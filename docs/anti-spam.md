# Anti-Spam Countermeasures

> 6 种反垃圾系统的绕过对策。WP 评论和论坛提交的核心参考。

## 系统总览

| 系统 | 能否绕过 | 方法 |
|------|----------|------|
| Akismet | 能 | 干净 Gmail + ISP 代理 + 正文不放 URL + 链接放 author URL 字段 |
| Antispam Bee | 能 | Playwright 原生键盘输入（pressSequentially），不用 JS 设值 |
| WPantispam Protect | 看配置 | 严格模式：纯文本评论 + 链接放 URL 字段；宽松模式：直接过 |
| CleanTalk | 不能 | 403 硬拦，看到直接跳过 |
| hCaptcha Enterprise | 不能 | 评论内容被服务端清洗 |
| Jetpack Highlander | 不能 | 评论在跨域 iframe 中，无法注入 |

## 详细对策

### Akismet（100% 绕过率）

**判断机制：** Akismet 判断垃圾评论主要看邮箱信誉和 IP 信誉，不是评论内容。

**绕过组合：**
1. 邮箱：用干净 Gmail 地址，名字用随机真实人名
2. IP：ISP 代理（不是数据中心 IP）
3. 链接位置：只放在 author URL 字段，不放正文
4. 评论内容：真实、有价值、与文章相关

**关键发现：** 用品牌域名邮箱（team@yourdomain.com）注册过 → 邮箱被标记 → 之后所有评论都被吞。
一旦被 Akismet 标记，该邮箱+IP 组合永久黑名单。

### Antispam Bee（90% 绕过率）

**判断机制：** 监听 textarea 的 keydown 事件确认"真人在打字"。

**绕过方法：**
```javascript
// 错误做法（被检测）：
await page.$eval('textarea', el => el.value = '评论内容');

// 正确做法（Playwright 原生）：
await page.locator('textarea').pressSequentially('评论内容', { delay: 50 });
```

**关键发现：** JavaScript 直接设值 `element.value='...'` 不触发键盘事件 → 被判定为 bot → 403。
必须用 pressSequentially 逐字符输入，触发完整键盘事件链。

### WPantispam Protect（看配置）

**两种模式：**
- 严格模式：纯文本评论 + 链接只放 URL 字段。不要放任何 HTML 标签。
- 宽松模式：直接过，不需要特殊处理。

**识别方法：** 查看页面源码中的 `wpantispam` 相关隐藏字段。

### CleanTalk（不可绕过）

**判断机制：** 服务端 403 硬拦截。

**处理方式：** 检测到 CleanTalk（搜索页面中的 cleantalk.js 或 cleantalk 相关元素）→ 直接跳过该站。

### hCaptcha Enterprise（不可绕过）

**判断机制：** 评论内容被服务端清洗，不是前端拦截。

**处理方式：** 同 CleanTalk，直接跳过。

### Jetpack Highlander（不可绕过）

**判断机制：** 评论在跨域 iframe 中渲染，无法注入或操控。

**处理方式：** 直接跳过。

## 验证码处理方案（10 种）

| 类型 | 处理方式 |
|------|----------|
| reCAPTCHA v2 | 人机协作：先填完所有字段，只剩验证码叫人 |
| reCAPTCHA v3 | 通常自动过，如果不过说明行为太机械 |
| hCaptcha | 人机协作 |
| Cloudflare Turnstile | 通常自动过 |
| 简单数学验证码 | 自动计算填入 |
| 图片选择验证码 | 人机协作 |
| 滑块验证码 | Playwright 模拟拖拽 |
| 文字验证码（变形） | 人机协作 |
| 短信/邮箱 OTP | 自动查收（需配置邮箱 API）|
| 自定义 JS 验证 | 分析页面 JS，直接计算答案 |

## Cloudflare 绕过（从 edge-knowledge-pack 集成）

**问题：** Puppeteer 的 `page.goto()` 走 Node.js HTTP 层，不走 Chrome 的代理。导致浏览器能访问的站点，Puppeteer 反而超时。

**方案：CDP WebSocket 直接导航**

Puppeteer 超时 ≠ 站点不可达。用 CDP WS 的 `Page.navigate` 走 Chrome 内置 HTTP（继承代理设置），绕过代理问题。

```javascript
// ❌ Puppeteer 方式（走 Node HTTP，没代理）
await page.goto('https://dev.to');  // timeout

// ✅ CDP WebSocket 方式（走 Chrome HTTP，有代理）
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/TAB_ID');
ws.send(JSON.stringify({ id: 1, method: 'Page.navigate', params: { url: 'https://dev.to' } }));
// 等 5s 后用 Runtime.evaluate 获取页面内容
```

**已验证通过的站点：** dev.to, gist.github.com, anoox.com

**适用场景：**
- Puppeteer timeout 但浏览器手动能访问的站点
- Cloudflare 保护的目录站（浏览器已过 CF 验证）
- 需要 OAuth 登录的提交页（复用浏览器登录态）

**引擎文件：** `cil/cdp-submit.mjs`

## 反检测配置

复用 Chrome Profile 的登录态 + CDP 接管 = 零风控：

**stealth-inject.mjs（11 模块，连接时自动注入）：**
1. navigator.webdriver 隐藏
2. Chrome runtime + App API 伪造
3. Permissions API 修复
4. iframe contentWindow 检测绕过
5. WebGL vendor/renderer 伪装（Intel Iris）
6. navigator.plugins 伪造（Chrome PDF + Native Client）
7. navigator.languages 修正
8. media codecs canPlayType 修复
9. sourceURL 泄露修复
10. navigator.hardwareConcurrency（8 核）
11. navigator.deviceMemory（8GB）

**human-behavior.mjs（操作时自动调用）：**
- 贝塞尔曲线鼠标轨迹（速度曲线 + Perlin 噪声时序）
- 真人点击（先移动，停顿，再按下/释放）
- 随机滚动（变速度）
- 打字节奏（30-120ms/字，10% 概率 200ms 停顿）

**其他：**
- 固定 Viewport: 1920x1080
- 真实 User-Agent（Chrome 最新版）
- 复用已验证的 Cloudflare session

## CF/CAPTCHA 自动绕过模块

详见 `knowledge/cf-captcha-bypass.md`。

| 模块 | 文件 | 功能 |
|------|------|------|
| 反检测注入 | `cil/stealth-inject.mjs` | 11 模块 CDP Runtime.evaluate 注入 |
| 人类行为 | `cil/human-behavior.mjs` | 贝塞尔鼠标 + 打字节奏 + 随机滚动 |
| CF 绕过 | `cil/cf-solver.mjs` | FlareSolverr + CDP 双模式 CF challenge 解析 |
| CAPTCHA 解析 | `cil/captcha-solver.mjs` | 本地 YOLOv8/Whisper + 付费 API fallback |
| hCaptcha 本地 | `cil/captcha-local/hcaptcha-solver.py` | YOLOv8 CPU 图片分类（Anaconda） |
| reCAPTCHA 音频 | `cil/captcha-local/recaptcha-audio.py` | Whisper 语音转文字（系统 Python） |
| Turnstile 提取 | `cil/captcha-local/turnstile-solver.py` | CDP in-page token 提取 |
| 引擎集成 | `cil/submit-v2.mjs` | 导航超时 → CF 绕过，CAPTCHA → 本地 → 付费 API |
| CDP 引擎 | `cil/cdp-submit.mjs` | 主力引擎，集成以上所有模块 |

CAPTCHA 自动降级链：本地免费 → 付费 API → 人机协作
配置在 brand JSON 的 `bypass` 字段中。

## 邮箱策略

- **首选：** Gmail + plus addressing (`you+site1@gmail.com`, `you+site2@gmail.com`)
- **备选：** 独立邮箱（catch-all 域名邮箱被很多站静默拒绝）
- **禁止：** 临时邮箱（10minutemail 等，被 Akismet 直接标记）
