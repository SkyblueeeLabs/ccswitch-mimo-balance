# MiMo Balance for CC Switch

> ## 📦 已归档（Archived）
>
> **本项目已停止维护，建议改用合并版 → [SkyblueeeLabs/ccswitch-balance-sync](https://github.com/SkyblueeeLabs/ccswitch-balance-sync)**
>
> | | 本独立版 | 合并版 |
> |---|---|---|
> | 支持供应商 | 只有 MiMo | MiMo + LongCat，`config.json` 可继续扩展 |
> | 添加新供应商 | 需要改动代码 | 只改 `config.json` |
> | 计划任务 | 每个供应商一个任务 | 一个任务管全部 |
> | 维护状态 | ⛔ 不再更新 | ✅ 持续维护 |
>
> **当前代码是可用的** —— 如果你只需要 MiMo 一家，本版本依然能正常工作，
> 功能和合并版完全一致（同样是纯 HTTP 查询、不弹浏览器）。但后续不再修复问题、
> 也不会跟进 cc-switch 或供应商接口的变化。
>
> 如果将来遇到问题，请直接迁移到合并版，而不是在这里提 issue。

在 CC Switch 中显示小米 MiMo 大模型余额的自动化工具。

> ⚠️ **本项目仅供学习与研究使用**，与小米、CC Switch 官方无关。使用本项目产生的一切后果由使用者自行承担。请遵守小米 MiMo 和 CC Switch 的服务条款。

> 🔒 **不要提交 `state.json`**：里面是你账号的完整登录 Cookie，泄露等于账号被接管。
> 本项目的 `.gitignore` 已默认排除它，请勿强制添加。

## 背景

MiMo 官方**没有**提供余额查询 API，CC Switch 也没有内置 MiMo 模板。本项目通过 Playwright 浏览器自动化，从 MiMo 控制台获取 Cookie 并自动同步到 CC Switch，实现余额显示。

## 前置条件（重要）

使用本项目前，请确保以下条件**已全部满足**：

| 条件 | 说明 |
|------|------|
| ✅ CC Switch 已安装 | 版本 3.0 以上 |
| ✅ MiMo 供应商已配置 | 在 CC Switch 里添加 MiMo 供应商，填入有效的 API Key |
| ✅ MiMo API 可正常调用 | 能用 MiMo 模型正常对话/推理 |
| ✅ 用量查询已配置 | CC Switch 里 MiMo 供应商的用量查询使用"自定义"模板 |
| ✅ Node.js 已安装 | 版本 18 以上 |
| ✅ Windows 10/11 | 用于任务计划程序 |

> **本项目只负责"余额显示"，不负责 MiMo API 的配置。** 如果你的 MiMo API Key 无效或供应商配置有问题，请先解决那些问题，再使用本项目。

## 工作原理

```
登录一次 MiMo → 保存浏览器状态（state.json）
                        ↓
        每次同步时自动加载状态 → 获取最新 Cookie → 写入 CC Switch
                        ↓
              Cookie 过期时 → 自动弹出浏览器重新登录
```

### 自动化方案

本项目的核心优势是**全自动维护 Cookie**：

- **首次登录**：运行 `2-login.bat`，浏览器弹出，登录 MiMo 后按 Enter
- **自动刷新**：Windows 任务计划程序每 6 小时自动运行，静默更新 Cookie
- **过期处理**：Cookie 过期时自动弹出浏览器，登录后自动完成后续步骤
- **手动同步**：随时双击 `3-sync.bat` 立即同步

## 安装

### 第一步：安装依赖

**方法一（推荐）**：双击运行 `1-install.bat`

**方法二**：在项目目录下执行：
```powershell
npm install -g playwright
npx playwright install chromium
```

### 第二步：登录 MiMo

双击运行 `2-login.bat`

会弹出浏览器，登录你的小米账号，登录成功后回到命令行按 **Enter**。

### 第 2.5 步（首次必须）：设置自定义模板

**打开 CC Switch → MiMo 供应商 → 配置用量查询**

1. 启用"用量查询"开关
2. 模板选择**"自定义"**
3. 点击**"保存"**

> ⚠️ **这一步只需要做一次**。如果不设置成"自定义"模板，脚本写入的代码会被 cc-switch 覆盖。
> 官方模板、Token Plan 等内置模板都不支持自定义代码。

### 第三步：同步到 CC Switch

双击运行 `3-sync.bat`

自动获取 Cookie 并写入 CC Switch，显示余额。

### 第四步（可选）：设置自动刷新

**右键 `4-setup-task.bat` → 以管理员身份运行**，UAC 弹窗点"是"即可。

> 为什么前 3 个能直接双击，这个要管理员权限？
> 因为创建 Windows 计划任务需要管理员权限，而前面 3 步（安装、登录、同步）都不需要。

脚本使用 `/IT`（交互式登录）标志，**不需要输入密码**，任务会在你登录 Windows 时自动运行。

如果提示"Access is denied"，请确认你选择了"以管理员身份运行"。

任务创建后每 6 小时自动刷新 Cookie。

## 使用

| 操作 | 方式 |
|------|------|
| 手动同步 | 双击 `3-sync.bat` |
| 重新登录 | 双击 `2-login.bat` |
| 自动刷新 | 任务计划程序每 6 小时自动运行 |
| 查看任务 | `schtasks /Query /TN "MiMoCookieAutoRefresh"` |
| 删除任务 | `schtasks /Delete /TN "MiMoCookieAutoRefresh" /F` |

## 安全提示

### Cookie 风险

本项目通过获取 MiMo 控制台的登录 Cookie 来查询余额。请注意：

- **Cookie 是账号级登录态**：获取 Cookie 后可以操作你的小米账号，风险高于普通 API Key
- **不要分享 `state.json`**：该文件包含你的完整登录状态
- **谨慎使用云同步**：如果 CC Switch 开启了 WebDAV 自动同步，Cookie 会被上传到云端
- **定期更换密码**：如发现 Cookie 泄露，立即修改小米账号密码

### 数据安全

- `state.json` 包含敏感登录信息，已加入 `.gitignore`，不会被提交到 GitHub
- 本项目不会将任何数据发送到第三方服务器
- 所有操作均在本地完成

## 文件说明

| 文件 | 用途 |
|------|------|
| `1-install.bat` | 安装 Playwright 和 Chromium |
| `2-login.bat` | 重新登录 MiMo |
| `3-sync.bat` | 手动同步 Cookie 到 CC Switch |
| `4-setup-task.bat` | 创建 Windows 任务计划程序任务（需管理员权限） |
| `setup-task.ps1` | 任务创建脚本（被 4-setup-task.bat 调用） |
| `elevate.ps1` | UAC 提权备用方案 |
| `playwright-login.mjs` | 登录脚本（保存 state.json） |
| `playwright-cookie.mjs` | 获取 Cookie 并写入 CC Switch |
| `playwright-auto.mjs` | 自动维护（检测 + 刷新 + 同步） |
| `find-provider.mjs` | 自动查找 MiMo 供应商 ID |
| `state.json` | 浏览器登录状态（每台机器不同，不打包） |
| `cc-switch.backup-*.db` | CC Switch 数据库备份（自动生成） |

## 迁移到合并版（推荐）

如果你以后想同时管理多家供应商，可以平滑迁移：

1. 先删掉本项目的计划任务（避免和新任务抢同一个数据库）：
   ```powershell
   schtasks /Delete /TN "MiMoCookieAutoRefresh" /F
   ```
2. 切到 [ccswitch-balance-sync](https://github.com/SkyblueeeLabs/ccswitch-balance-sync)，双击 `1-install.bat`
3. 双击 `2-login.bat`，重新登录 MiMo（Cookie 不通用，需要重登一次）
4. 双击 `3-sync.bat` 写入
5. 可选：以管理员运行 `4-setup-task.bat` 建立统一的自动刷新任务

完成后本目录可以直接删除。

> 💡 不用先卸载本版本 —— 合并版会直接覆盖 cc-switch 里同一条供应商记录，不会冲突。

## 迁移到其他电脑

1. 复制整个项目目录（排除 `state.json` 和 `cc-switch.backup-*.db`）
2. 双击 `1-install.bat` 安装依赖
3. 双击 `2-login.bat` 登录 MiMo
4. 双击 `3-sync.bat` 同步
5. 可选：右键 `4-setup-task.bat` 以管理员身份运行，设置自动刷新

## 常见问题

**Q: 同步失败怎么办？**
A: 先运行 `2-login.bat` 重新登录，再运行 `3-sync.bat`。

**Q: 自动刷新不工作？**
A: 检查任务是否存在：`schtasks /Query /TN "MiMoCookieAutoRefresh"`。如果不存在，重新运行 `4-setup-task.bat`。

**Q: 余额不显示？**
A: 确认 CC Switch 里 MiMo 供应商的用量查询已启用，且模板类型为"自定义"。

**Q: 支持其他浏览器吗？**
A: 目前只支持 Chromium。Playwright 的 storageState 格式是标准的，理论上可以手动转换。

**Q: 为什么需要管理员权限创建任务？**
A: Windows 任务计划程序需要管理员权限才能创建任务。创建一次后，后续运行不需要管理员权限。

## 免责声明

1. 本项目仅供学习与研究用途，不得用于任何商业或非法目的
2. 使用本项目所产生的一切后果由使用者自行承担，包括但不限于账号封禁、数据泄露等
3. 本项目与小米、CC Switch 官方无任何关联
4. 请遵守小米 MiMo 和 CC Switch 的服务条款
5. 本项目按"原样"提供，不提供任何明示或暗示的担保

## 许可

本项目代码基于 MIT 许可证开源。使用本项目即表示你同意上述免责声明。
