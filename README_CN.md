# Bypass Anything

> Claude Code 浏览器自动化技能：反检测、人类行为模拟、Cloudflare 绕过、CAPTCHA 解决方案。

零 Puppeteer。原生 CDP WebSocket。11 个反检测模块。Bezier 鼠标。打字节奏。Turnstile 自动解决。已验证：CF Turnstile 真实 sitekey 6 秒通过。

## 它做什么

这是一个 **Claude Code skill**，通过 CDP（Chrome DevTools Protocol）WebSocket 让 Claude 直接控制真实 Chrome 浏览器。Puppeteer/Playwright 使用 Node.js HTTP 层，而 CDP 命令直接走 Chrome 内置网络栈，这意味着：

- 代理设置正常工作（Chrome 遵循系统代理）
- 复用已有登录态
- 通过复用已验证会话绕过 Cloudflare 挑战
- 无 `Runtime.enable` 检测痕迹

### 三层反检测

| 层级 | 模块 | 击破什么 |
|------|------|----------|
| 1. 指纹 | `stealth-inject.mjs`（11 模块） | navigator.webdriver、Chrome runtime、Permissions API、iframe contentWindow、WebGL vendor/renderer、plugins、languages、media codecs、sourceURL、hardwareConcurrency、deviceMemory |
| 2. 行为 | `human-behavior.mjs` | Bezier 曲线鼠标 + 速度曲线 + Perlin 噪声时序、CDP keyDown/keyUp 打字节奏、随机滚动、操作间随机停顿 |
| 3. CAPTCHA/CF | `captcha-solver.mjs` + `cf-solver.mjs` | Turnstile 页内 token 捕获（免费）、reCAPTCHA/hCaptcha 通过 2Captcha/CapSolver/Anti-Captcha、FlareSolverr 解 CF 挑战 |

### 关键技术细节

Stealth 注入使用 `Page.addScriptToEvaluateOnNewDocument`，不是 `Runtime.evaluate`。这是项目中最关键的技术选择。`Runtime.evaluate` 在页面 JS **之后**执行（检测脚本先跑，stealth 到达太晚）。`Page.addScriptToEvaluateOnNewDocument` 注册脚本在每个新文档加载**之前**执行。这就是能通过 CF Turnstile 挑战的原因。

## 安装

```bash
git clone https://github.com/1596941391qq/bypass-anything.git
cd bypass-anything/bypass-anything
bash install.sh
```

手动安装：

```bash
cd bypass-anything/bypass-anything && npm install
```

### 添加到 Claude Code

```bash
# 全局（所有项目可用）
cp -r bypass-anything ~/.claude/skills/bypass-anything

# 项目级（通过 git 共享给团队）
cp -r bypass-anything your-project/.claude/skills/bypass-anything
```

### 启动带 CDP 的 Chrome

```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-bypass

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" \
  --remote-debugging-port=9222 --user-data-dir=C:\chrome-bypass

# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-bypass
```

**Windows 注意**：如果系统代理没开，加 `--no-proxy-server` 避免连接失败。如果需要代理，加 `--proxy-server=http://127.0.0.1:7892`。

### 可选：FlareSolverr（CF 绕过）

```bash
docker run -d -p 8191:8191 ghcr.io/flaresolverr/flaresolverr
```

### 可选：CAPTCHA API Keys

```bash
export CAPTCHA_2CAPTCHA_KEY="your_key"     # ~$3/1000 次解决
export CAPTCHA_CAPSOLVER_KEY="your_key"     # ~$2/1000 次解决
```

Turnstile 不需要任何 API key（页内 token 捕获，免费）。

## 使用场景

### 1. 外链自动化

提交到目录站、论坛、Web 2.0 平台。人类行为模拟通过反垃圾检测。

```
Navigate to https://submit-site.com/submit and fill the form:
- Title: My Brand
- URL: https://mybrand.com
- Description: A wellness brand...
```

**反垃圾兼容性：**

| 系统 | 能过？ | 方法 |
|------|--------|------|
| Akismet | 能 | 干净邮箱 + ISP 代理 + URL 放 author 字段 |
| Antispam Bee | 能 | `typeHuman()` 触发真实键盘事件 |
| CleanTalk | 不能 | 403 硬屏蔽，检测到就跳过 |
| hCaptcha Enterprise | 不能 | 服务端剥离，跳过 |

**铁律：每品牌每根域名只提交一条外链。** 同域外链第一条之后几乎零 SEO 价值。

### 2. 品牌监控

导航到竞品页面，截图，提取提及。反检测确保不封 IP。

```
Go to https://reddit.com/r/wellness and search for "my brand name", capture the top 10 results with screenshots.
```

### 3. 账号注册机

用人类行为填写注册表单。Turnstile 自动解决。reCAPTCHA/hCaptcha 需配置 API key。

```
Register an account on https://example.com with:
- Username: john_doe_2024
- Email: john+site@gmail.com
- Password: [generate a secure one]
```

### 4. 绕过保护抓取

Cloudflare 保护的站：CDP 接管复用你浏览器的已验证会话。如果触发挑战，FlareSolverr 解决。

```
Scrape the article list from https://cf-protected-site.com/blog and save as JSON.
```

### 5. 反向代理验证

CDP 用 Chrome 的 HTTP 栈（不是 Node.js），代理设置正确生效。验证特定代理后面的用户看到什么。

```
Navigate to https://example.com through the proxy and capture the full page HTML and response headers.
```

## 模块参考

### cdp-submit.mjs — 主引擎

```javascript
import { connect, navigate, getPageInfo, fillField, clickElement, takeScreenshot } from './scripts/cdp-submit.mjs';

await connect(9222);                          // 连接 Chrome
const url = await navigate('https://example.com', 5000); // 导航（走 Chrome HTTP，遵循代理）
const info = await getPageInfo();             // 分析页面
// { url, title, forms, links, hasRecaptcha, hasHcaptcha, hasTurnstile, hasCfChallenge, buttons }

await fillField('input[name="email"]', 'user@example.com'); // 人类打字填表
await clickElement('button[type="submit"]');   // 人类鼠标点击
await takeScreenshot('./output.png');          // 截图
```

### stealth-inject.mjs — 反检测

```javascript
import { injectStealth } from './scripts/stealth-inject.mjs';
await injectStealth(cdpSend);  // 通过 Page.addScriptToEvaluateOnNewDocument 注入全部 11 模块
```

### human-behavior.mjs — 行为模拟

```javascript
import { moveMouse, clickHuman, typeHuman, scrollRandom, randomPause } from './scripts/human-behavior.mjs';

await moveMouse(send, 100, 100, 500, 300);     // Bezier 曲线鼠标
await clickHuman(send, 500, 300);               // 移动 + 停顿 + 点击
await typeHuman(send, 'input[name="q"]', 'text'); // CDP keyDown/keyUp + DOM 更新
await scrollRandom(send, 300);                  // 变速滚动
await randomPause(500, 2000);                    // 随机延迟
```

### cf-solver.mjs — Cloudflare 绕过

```javascript
import { solveCf } from './scripts/cf-solver.mjs';
const { html, cookies, method } = await solveCf('https://cf-protected.com');
// 先试 FlareSolverr，回退到 CDP 接管
```

### captcha-solver.mjs — CAPTCHA 处理

```javascript
import { handleCaptcha, solveCaptcha } from './scripts/captcha-solver.mjs';

const result = await handleCaptcha(cdpSend, pageInfo); // 自动检测 + 解决 + 注入

const token = await solveCaptcha('recaptcha_v2', {      // 或手动按类型
  sitekey: '...',
  pageUrl: '...',
  provider: '2captcha',
  cdpSend,
});
```

## 反检测评分

在 [bot.sannysoft.com](https://bot.sannysoft.com) 测试：

| 检测项 | 状态 |
|--------|------|
| User Agent | 通过（真实 Chrome） |
| WebDriver | 通过（undefined） |
| Chrome runtime | 通过（伪造） |
| Plugins | 通过（3 个假插件） |
| Languages | 通过 |
| WebGL Vendor | 通过（Intel） |
| Permissions | 通过 |
| Hardware | 通过（8 核，8GB） |
| Media Codecs | 通过 |
| **Canvas 指纹** | **未覆盖** |
| **AudioContext** | **未覆盖** |
| **Font 枚举** | **未覆盖** |

## Turnstile 绕过验证

| 测试 | Sitekey | 结果 |
|------|---------|------|
| 测试自动通过 | `1x00000000000000000000AA` | 3 秒通过，token: `XXXX.DUMMY.TOKEN.XXXX` |
| 强制交互 | `3x00000000000000000000FF` | `before-interactive` 回调触发，但 widget 内部不渲染可交互 UI。这是 Cloudflare 测试 sitekey 的设计行为，不是绕过失败 |
| **真实 sitekey** | `0x4AAAAAAAhMny_sYVPqN2SW` | **6 秒通过，真实 837 字符 token 捕获**（turnstile.cf-testing.com） |
| **真实显式渲染** | `0x4AAAAAAAhMny_sYVPqN2SW` | **通过，显式渲染模式下真实 token 捕获** |

真实 sitekey 在 `turnstile.cf-testing.com` 验证通过。通过 `Page.addScriptToEvaluateOnNewDocument` 注入 stealth，无需 API key，token 自动从隐藏 input 字段捕获。

## 项目结构

```
bypass-anything/
├── README.md                    ← 英文文档
├── README_CN.md                 ← 中文文档（本文件）
├── bypass-anything/
│   ├── SKILL.md                 ← Claude Code skill 定义
│   ├── install.sh               ← 依赖安装器
│   ├── config.json              ← 默认配置
│   ├── package.json             ← Node.js 依赖（ws）
│   └── scripts/
│       ├── cdp-submit.mjs       ← CDP WebSocket 主引擎
│       ├── stealth-inject.mjs   ← 11 反检测模块
│       ├── human-behavior.mjs   ← Bezier 鼠标 + 打字节奏
│       ├── cf-solver.mjs        ← FlareSolverr + CDP 回退
│       └── captcha-solver.mjs   ← Turnstile 本地 + 3 个付费 API
```

## 路线图

### 近期
- [ ] **Canvas 指纹随机化** — 给 `toDataURL()` 输出加噪
- [ ] **AudioContext 指纹噪声** — 振荡器频率抖动
- [ ] **Font 枚举保护** — 只返回标准字体列表
- [ ] **Cookie 持久化** — 重启后保存/加载会话

### 中期
- [ ] **住宅 IP 轮换** — Bright Data / IPRoyal / SmartProxy 集成
- [ ] **多配置文件并行会话** — 同时运行 N 个 Chrome 实例
- [ ] **智能表单检测** — 基于 label 匹配字段，不用 CSS 选择器
- [ ] **凭证库** — 加密存储站点登录信息
- [ ] **视觉 CAPTCHA 分类** — 本地 ONNX 模型解决图片挑战

### 远期
- [ ] **Playwright MCP 桥接** — 复杂交互的混合模式
- [ ] **浏览器指纹多样性** — 每个配置文件生成唯一一致的指纹
- [ ] **行为 AI** — 从观察中学习站点特定的交互模式
- [ ] **分布式工作池** — 编排多台机器处理大规模任务

## 依赖

- **Node.js** >= 18（原生 `fetch`）
- **Google Chrome**（任何近期版本）
- **ws** npm 包（WebSocket 客户端）
- **FlareSolverr**（可选，Docker，CF 挑战绕过）
- **2Captcha/CapSolver/Anti-Captcha** 账号（可选，非 Turnstile CAPTCHA）

## License

MIT
