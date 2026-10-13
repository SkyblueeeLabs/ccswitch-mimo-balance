// playwright-auto.mjs — 自动维护 MiMo Cookie，保持 cc-switch 余额始终可用
//
// 用法: node playwright-auto.mjs
// 逻辑:
//   1. 读取 state.json，直接用 HTTP 验证 Cookie 并查询余额（不启动浏览器）
//   2. Cookie 有效 → 写入 cc-switch → 重启 → 结束
//   3. Cookie 过期 → 若为交互式终端则弹浏览器让你登录；无人值守则只提示

import { createRequire } from 'module';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, 'state.json');
const DB = process.env.USERPROFILE + '\\.cc-switch\\cc-switch.db';

const MIMO_HOME = 'https://platform.xiaomimimo.com/';
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

function buildHeader(map) {
  const order = ['api-platform_serviceToken', 'userId', 'api-platform_ph', 'api-platform_slh'];
  const parts = [];
  for (const k of order) if (map.has(k)) parts.push(`${k}=${map.get(k)}`);
  for (const [k, v] of map) if (!order.includes(k)) parts.push(`${k}=${v}`);
  return parts.join('; ');
}

function cookiesToMap(cookies) {
  const map = new Map();
  for (const c of cookies || []) {
    if (c.domain && c.domain.includes(COOKIE_DOMAIN)) map.set(c.name, c.value);
  }
  return map;
}

// 直接用 HTTP 验证 Cookie 并取余额（不启动浏览器）
async function fetchBalance(cookieHeader) {
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
  if (resp.status === 401 || json.code === 401 || json.code === 403) return { error: 'Cookie 已过期' };
  if (json.code !== 0) return { error: json.msg || json.message || `code=${json.code}` };
  if (json.data?.balance == null) return { error: '未找到余额字段' };
  return { balance: json.data.balance, currency: json.data.currency || 'CNY' };
}

function writeToCCSwitch(cookieHeader) {
  const db = new DatabaseSync(DB);
  const rows = db.prepare(
    "SELECT id, name, meta FROM providers WHERE name LIKE ? AND app_type='claude'"
  ).all(`%${MATCH_NAME}%`);
  if (rows.length === 0) { db.close(); return false; }

  const row = rows[0];
  const meta = JSON.parse(row.meta);
  meta.commonConfigEnabled = false;
  if (!meta.usage_script) meta.usage_script = {};
  meta.usage_script.enabled = true;
  meta.usage_script.language = 'javascript';
  meta.usage_script.timeout = meta.usage_script.timeout || 10;
  meta.usage_script.templateType = 'custom';
  meta.usage_script.autoQueryInterval = meta.usage_script.autoQueryInterval ?? 5;

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
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE providers SET meta=? WHERE id=?').run(JSON.stringify(meta), row.id);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    db.close();
    return false;
  }
  db.close();
  return true;
}

function restartCCSwitch() {
  try {
    execSync('taskkill /f /im cc-switch.exe', { stdio: 'ignore' });
    setTimeout(() => {
      const exePath = process.env.LOCALAPPDATA + '\\Programs\\CC Switch\\cc-switch.exe';
      execSync(`start "" "${exePath}"`, { stdio: 'ignore' });
    }, 2000);
    console.log('✓ cc-switch 已重启');
  } catch {
    console.log('⚠ 重启失败，请手动重启 cc-switch');
  }
}

// ==================== 主流程 ====================
console.log('正在检查 MiMo Cookie 状态...\n');

// 第 1 步: 用现有 state.json 直接 HTTP 查询（不启动浏览器）
let cookieHeader = '';
let needRelogin = false;

if (existsSync(STATE_FILE)) {
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    const jar = cookiesToMap(state.cookies);
    if (!jar.has('api-platform_serviceToken') || !jar.get('userId')) {
      console.log('  缺少关键 Cookie，需要重新登录');
      needRelogin = true;
    } else {
      cookieHeader = buildHeader(jar);
      const r = await fetchBalance(cookieHeader);
      if (r.error) {
        console.log(`  Cookie 无效 (${r.error})`);
        needRelogin = true;
      } else {
        console.log(`✓ Cookie 有效  余额: ${r.balance} ${r.currency}`);
        const ok = writeToCCSwitch(cookieHeader);
        if (ok) {
          console.log('✓ 已同步到 cc-switch');
          restartCCSwitch();
          process.exit(0);
        }
        console.log('✗ 写入 cc-switch 失败');
        process.exit(1);
      }
    }
  } catch (e) {
    console.log(`  state.json 无法解析: ${e.message}`);
    needRelogin = true;
  }
} else {
  console.log('  未找到 state.json');
  needRelogin = true;
}

if (!needRelogin) {
  console.log('\n无需处理。');
  process.exit(0);
}

// 第 2 步: 需要重新登录。
// 计划任务无人值守，没有 TTY，不能阻塞等待输入
if (!process.stdin.isTTY) {
  console.log('\n⚠ MiMo 需要重新登录，但当前为无人值守运行。');
  console.log('  请手动双击 2-login.bat 重新登录后，再运行 3-sync.bat。');
  process.exit(1);
}

console.log('========================================');
console.log(' 正在打开浏览器，请重新登录 MiMo');
console.log(' 登录完成后回到这里按 Enter');
console.log('========================================\n');

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext(
  existsSync(STATE_FILE) ? { storageState: STATE_FILE } : undefined
);
const page = await context.newPage();
await page.goto(MIMO_HOME + '#/console/balance');

await new Promise(resolve => {
  process.stdin.setEncoding('utf8');
  process.stdin.once('data', resolve);
});

await context.storageState({ path: STATE_FILE });
console.log('\n✓ 登录状态已保存');

const cookies = await context.cookies();
const jar2 = cookiesToMap(cookies);
await browser.close();

if (!jar2.has('api-platform_serviceToken')) {
  console.error('✗ 仍未获取到 Cookie，请重试');
  process.exit(1);
}

const header2 = buildHeader(jar2);
const r2 = await fetchBalance(header2);
if (r2.error) {
  console.error(`✗ 新 Cookie 验证失败: ${r2.error}`);
  process.exit(1);
}

console.log(`✓ 验证通过  余额: ${r2.balance} ${r2.currency}`);
const ok = writeToCCSwitch(header2);
console.log(ok ? '✓ 已同步到 cc-switch' : '✗ 同步失败');
if (ok) restartCCSwitch();
process.exit(ok ? 0 : 1);
