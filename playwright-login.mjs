// playwright-login.mjs — 打开浏览器，你登录 MiMo，自动保存登录状态
//
// 用法: node playwright-login.mjs
// 效果: 弹出 Chrome 窗口 → 你登录 MiMo → 按 Enter → 保存 state.json
// 之后 playwright-cookie.mjs 会自动加载这个状态，不用重新登录

import { createRequire } from 'module';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, 'state.json');
const MIMO_URL = 'https://platform.xiaomimimo.com/#/console/balance';

// 加载 Playwright：优先本地，其次常见全局路径，最后 npm root -g
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {}

  const appdata = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
  const candidates = [
    join(appdata, 'npm', 'node_modules', 'playwright'),
    join(homedir(), 'AppData', 'Local', 'npm', 'node_modules', 'playwright'),
    process.env.NODE_PATH,
  ];
  for (const dir of candidates) {
    if (!dir) continue;
    try {
      if (!existsSync(join(dir, 'package.json'))) continue;
      const require = createRequire(join(dir, 'package.json'));
      return require('playwright');
    } catch {}
  }

  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const require = createRequire(join(globalRoot, 'noop.js'));
    return require('playwright');
  } catch {}

  throw new Error('找不到 Playwright，请运行: npm install -g playwright && npx playwright install chromium');
}

const { chromium } = await loadPlaywright();

console.log('正在启动浏览器...');
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

console.log('正在打开 MiMo 控制台...');
await page.goto(MIMO_URL);

console.log('\n========================================');
console.log(' 请在浏览器里登录 MiMo 账号');
console.log(' 登录成功后，回到这里按 Enter 键');
console.log('========================================\n');

// 等待用户按 Enter
await new Promise(resolve => {
  process.stdin.setEncoding('utf8');
  process.stdin.once('data', resolve);
});

// 保存登录状态
await context.storageState({ path: STATE_FILE });
console.log(`✓ 登录状态已保存到: ${STATE_FILE}`);

await browser.close();
console.log('\n完成。以后运行 playwright-cookie.mjs 即可自动获取 Cookie。');
