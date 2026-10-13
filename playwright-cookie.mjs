// playwright-cookie.mjs — 加载登录状态，查询 MiMo 余额，写入 cc-switch
//
// 用法: node playwright-cookie.mjs
// 前置: 先运行过 playwright-login.mjs（生成 state.json）
// 效果: 加载 state.json → 拿到 Cookie → 验证 → 写入 cc-switch 数据库 → 重启 cc-switch

import { createRequire } from 'module';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, copyFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, 'state.json');
const DB = process.env.USERPROFILE + '\\.cc-switch\\cc-switch.db';

const MIMO_BALANCE = 'https://platform.xiaomimimo.com/api/v1/balance';
const COOKIE_DOMAIN = 'xiaomimimo.com';
const MATCH_NAME = 'MiMo';

async function loadPlaywright() {
  // 1. 本地 node_modules
  try {
    return await import('playwright');
  } catch {}

  // 2. 常见全局安装路径（不依赖 execSync，兼容受限环境）
  const appdata = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
  const candidates = [
    join(appdata, 'npm', 'node_modules', 'playwright'),
    join(homedir(), 'AppData', 'Local', 'npm', 'node_modules', 'playwright'),
    process.env.NODE_PATH,
    '/usr/local/lib/node_modules/playwright',
    '/usr/lib/node_modules/playwright',
  ];
  for (const dir of candidates) {
    if (!dir) continue;
    try {
      if (!existsSync(join(dir, 'package.json'))) continue;
      const require = createRequire(join(dir, 'package.json'));
      return require('playwright');
    } catch {}
  }

  // 3. 最后尝试 npm root -g
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const require = createRequire(join(globalRoot, 'noop.js'));
    return require('playwright');
  } catch {}

  throw new Error('找不到 Playwright，请运行: npm install -g playwright && npx playwright install chromium');
}

const { chromium } = await loadPlaywright();

// 按推荐顺序拼 Cookie 头（Cookie 顺序对部分服务端有影响）
function buildHeader(map) {
  const order = ['api-platform_serviceToken', 'userId', 'api-platform_ph', 'api-platform_slh'];
  const parts = [];
  for (const k of order) if (map.has(k)) parts.push(`${k}=${map.get(k)}`);
  for (const [k, v] of map) if (!order.includes(k)) parts.push(`${k}=${v}`);
  return parts.join('; ');
}

function cookiesToMap(cookies) {
  const map = new Map();
  for (const c of cookies) {
    if (c.domain && c.domain.includes(COOKIE_DOMAIN)) map.set(c.name, c.value);
  }
  return map;
}

// ---------- 校验 ----------
for (const f of [STATE_FILE]) {
  if (!existsSync(f)) {
    console.error('========================================');
    console.error(' 未找到 state.json');
    console.error('========================================');
    console.error('\n请先运行: node playwright-login.mjs');
    process.exit(1);
  }
}

let state;
try {
  state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
} catch (e) {
  console.error(`✗ state.json 损坏: ${e.message}`);
  process.exit(1);
}

const jar = cookiesToMap(state.cookies || []);
const token = jar.get('api-platform_serviceToken');
const userId = jar.get('userId');

if (!token || !userId) {
  console.error('========================================');
  console.error(' 未找到 MiMo 的 Cookie');
  console.error('========================================');
  console.error('\n请重新登录: node playwright-login.mjs');
  process.exit(1);
}

console.log(`✓ 读取到 ${jar.size} 个 Cookie`);
console.log(`  api-platform_serviceToken: ${token.length} 字符`);
console.log(`  userId: ${userId}`);

// ---------- 验证 Cookie 并取余额（纯 HTTP，无需浏览器） ----------
const cookieHeader = buildHeader(jar);

console.log('\n正在向 MiMo 验证...');
let balance, currency;
try {
  const resp = await fetch(MIMO_BALANCE, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieHeader,
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(20000),
  });
  const json = await resp.json();

  if (resp.status === 401 || json.code === 401 || json.code === 403) {
    console.error('========================================');
    console.error(' Cookie 已过期');
    console.error('========================================');
    console.error('\n请重新登录: node playwright-login.mjs');
    process.exit(1);
  }
  if (json.code !== 0) {
    console.error(`✗ 接口返回错误: ${json.msg || json.message || json.code}`);
    process.exit(1);
  }

  balance = json.data?.balance;
  currency = json.data?.currency || 'CNY';

  if (balance == null) {
    console.error('✗ 未找到余额字段，请确认登录状态是否有效');
    process.exit(1);
  }
  console.log(`✓ 验证通过  余额: ${balance} ${currency}`);
} catch (e) {
  console.error('✗ 验证失败:', e.message);
  process.exit(1);
}

// ---------- 写入 cc-switch ----------
const db = new DatabaseSync(DB);
const rows = db.prepare(
  "SELECT id, name, meta FROM providers WHERE name LIKE ? AND app_type='claude'"
).all(`%${MATCH_NAME}%`);

if (rows.length === 0) {
  console.error(`✗ 未找到匹配 "${MATCH_NAME}" 的供应商`);
  console.error('  请先在 CC Switch 里添加该供应商');
  db.close();
  process.exit(1);
}

const row = rows[0];
const meta = JSON.parse(row.meta);

// 必须关掉，否则 cc-switch 会忽略供应商自带的 usage_script.code
meta.commonConfigEnabled = false;
if (!meta.usage_script) meta.usage_script = {};
meta.usage_script.enabled = true;
meta.usage_script.language = 'javascript';
meta.usage_script.timeout = meta.usage_script.timeout || 10;
meta.usage_script.templateType = 'custom';
meta.usage_script.autoQueryInterval = meta.usage_script.autoQueryInterval ?? 5;

// 注意：extractor 收到的是接口原始响应体，data 不会被解包，
// 所以路径必须写完整的 data.balance，不能简写。
// 用逐级安全取值，任何一级缺失都返回 undefined 而不抛异常。
meta.usage_script.code = `({
  request: {
    url: "${MIMO_BALANCE}",
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "zh-CN",
      "Cookie": ${JSON.stringify(cookieHeader)}
    }
  },
  extractor: function (response) {
    if (response == null) return { isValid: false, invalidMessage: "响应为空" };
    if (response.code !== 0 && response.code !== 200) {
      return { isValid: false, invalidMessage: response.msg || response.message || "查询失败" };
    }
    function pick(path) {
      var cur = response;
      var keys = String(path).split(".");
      for (var i = 0; i < keys.length; i++) {
        if (cur == null) return undefined;
        cur = cur[keys[i]];
      }
      return cur;
    }
    return {
      isValid: true,
      planName: "MiMo 余额",
      remaining: Number(pick("data.balance")) || 0,
      unit: pick("data.currency") || "CNY"
    };
  }
})`;

const bak = DB.replace(/\.db$/, '') + `.backup-${Date.now()}.db`;
copyFileSync(DB, bak);
console.log(`\n已备份: ${bak}`);

db.exec('BEGIN IMMEDIATE');
try {
  db.prepare('UPDATE providers SET meta=? WHERE id=?').run(JSON.stringify(meta), row.id);
  db.exec('COMMIT');
  console.log(`✓ 已写入 cc-switch 数据库（供应商: ${row.name}）`);
} catch (e) {
  try { db.exec('ROLLBACK'); } catch {}
  console.error('✗ 写入失败:', e.message);
  db.close();
  process.exit(1);
}
db.close();

console.log(`\n完成。余额: ${balance} ${currency}`);
console.log('正在重启 cc-switch...');

// 自动重启 cc-switch
try {
  execSync('taskkill /f /im cc-switch.exe', { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2000));
  const exePath = process.env.LOCALAPPDATA + '\\Programs\\CC Switch\\cc-switch.exe';
  execSync(`start "" "${exePath}"`, { stdio: 'ignore' });
  console.log('✓ cc-switch 已重启');
} catch {
  console.log('⚠ 重启失败，请手动重启 cc-switch');
}
