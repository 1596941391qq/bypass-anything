# Cloudflare & CAPTCHA 绕过方案

> 开源工具集成决策树。submit-v2 引擎的参考。

## 决策树

```
提交目标页面
  │
  ├─ 能直接访问？ → 正常提交（走 cdp-submit.mjs）
  │
  ├─ CF Challenge 拦截？
  │   ├─ 有 FlareSolverr？ → cf-solver.mjs 代理
  │   └─ 无 FlareSolverr → CDP 接管已登录 Chrome（已有 CF session）
  │
  ├─ CAPTCHA 拦截？
  │   ├─ reCAPTCHA v2/v3 → captcha-solver.mjs（2Captcha/CapSolver）
  │   ├─ hCaptcha → captcha-solver.mjs
  │   ├─ Turnstile → captcha-solver.mjs（Turnstile 专用方法）
  │   ├─ 图片验证码 → captcha-solver.mjs（image 模式）
  │   ├─ 滑块 → Playwright 模拟拖拽（已在 submit-v2 中）
  │   └─ 数学/文字 → 自动计算（已在 submit-v2 中）
  │
  └─ 硬拦截（CleanTalk/hCaptcha Enterprise/Jetpack）→ 跳过（见 anti-spam.md）
```

## 工具矩阵

### Cloudflare 绕过

| 工具 | 语言 | 原理 | 成功率 | 集成方式 | 成本 |
|------|------|------|--------|----------|------|
| **FlareSolverr** | Docker/HTTP | Headless Chrome 解 CF challenge，返回 clearance cookies | 85% | `cil/cf-solver.mjs` HTTP API | 免费（需 Docker） |
| **CDP 接管** | Node.js | 复用用户已过 CF 验证的 Chrome session | 99% | `cil/cdp-submit.mjs` 已有 | 免费 |
| **puppeteer-extra-stealth** | Node.js | 11 个反检测补丁（webdriver 标志、Chrome runtime 等） | 70% | 注入 CDP 连接后 | 免费 |
| **DrissionPage** | Python | CDP 控制 + 反检测补丁 | 75% | subprocess 调用 | 免费 |
| **nodriver** | Python | 无 WebDriver 标志的 Chrome 控制 | 80% | subprocess 调用 | 免费 |
| **curl-impersonate** | C/CLI | TLS 指纹伪装成真实浏览器 | 60% | subprocess | 免费 |

### CAPTCHA 解析

| 工具 | 类型 | 支持验证码 | 平均耗时 | 集成方式 | 价格 |
|------|------|-----------|---------|----------|------|
| **2Captcha** | API 服务 | reCAPTCHA v2/v3, hCaptcha, Turnstile, 图片 | 15-30s | `cil/captcha-solver.mjs` | ~$3/1000 |
| **CapSolver** | API 服务 | reCAPTCHA, hCaptcha, Turnstile, FunCaptcha | 10-20s | `cil/captcha-solver.mjs` | ~$2/1000 |
| **Anti-Captcha** | API 服务 | reCAPTCHA, hCaptcha, Turnstile | 12-25s | `cil/captcha-solver.mjs` | ~$2/1000 |
| **hcaptcha-challenger** | 本地 ML | hCaptcha 图像分类 | 5-10s | 本地推理 | 免费（需 GPU） |

## FlareSolverr

### 部署

```bash
docker run -d \
  --name flaresolverr \
  -p 8191:8191 \
  -e LOG_LEVEL=info \
  --restart unless-stopped \
  ghcr.io/flaresolverr/flaresolverr:latest
```

### API

```javascript
// GET 请求（解 CF 后返回 HTML）
POST http://localhost:8191/v1
{
  "cmd": "request.get",
  "url": "https://target-site.com",
  "maxTimeout": 60000
}

// POST 请求（带表单数据）
POST http://localhost:8191/v1
{
  "cmd": "request.post",
  "url": "https://target-site.com/submit",
  "postData": "field1=value1&field2=value2",
  "maxTimeout": 60000
}

// 返回
{
  "status": "ok",
  "solution": {
    "url": "https://target-site.com",
    "response": "<html>...</html>",
    "cookies": [{ "name": "cf_clearance", "value": "xxx" }],
    "userAgent": "Mozilla/5.0..."
  }
}
```

### 局限

- 仅解 CF JS Challenge 和 Managed Challenge
- Turnstile Interactive Challenge 可能失败
- 需要 Docker 环境
- 每次请求启动新 session，不复用（可通过 session 参数复用）

## 本地免费 CAPTCHA 解法

| 类型 | 方法 | 依赖 | 平均耗时 | 成本 |
|------|------|------|---------|------|
| hCaptcha | YOLOv8-nano 图片分类 | Anaconda (D:): ultralytics, hcaptcha-challenger | 5-15s | 免费 |
| reCAPTCHA v2 | 音频挑战 + Whisper 转文字 | 系统 Python: openai-whisper | 3-8s | 免费（音频不可用时 fallback 付费 API） |
| Turnstile | CDP in-page token 提取 | 无额外依赖 | 5-30s | 免费 |

引擎文件：
- `cil/captcha-local/hcaptcha-solver.py` — YOLOv8 分类
- `cil/captcha-local/recaptcha-audio.py` — Whisper 语音转文字
- `cil/captcha-local/turnstile-solver.py` — CDP token 提取脚本

自动降级链：本地解法 → 付费 API (2Captcha/CapSolver) → 人机协作

## CAPTCHA 解析 API

### reCAPTCHA v2

```javascript
// 1. 从页面提取 sitekey
const sitekey = document.querySelector('.g-recaptcha')?.dataset.sitekey
  || document.querySelector('iframe[src*="recaptcha"]')?.src.match(/sitekey=([^&]+)/)?.[1];

// 2. 提交到解析服务
POST https://2captcha.com/in.php
  method=userrecaptcha
  googlekey={sitekey}
  pageurl={current_url}
  key={api_key}

// 3. 轮询结果（每 5s）
GET https://2captcha.com/res.php?action=get&id={task_id}&key={api_key}

// 4. 注入 token
document.getElementById('g-recaptcha-response').innerHTML = '{token}';
// 或回调函数
___grecaptcha_cfg.clients[0].callback.callback('{token}');
```

### Cloudflare Turnstile

```javascript
// 1. 提取 sitekey
const sitekey = document.querySelector('[data-sitekey]')?.dataset.sitekey
  || document.querySelector('iframe[src*="turnstile"]')?.src.match(/sitekey=([^&]+)/)?.[1];

// 2. 提交到解析服务（CapSolver 格式）
POST https://api.capsolver.com/createTask
{
  "clientKey": "{api_key}",
  "task": {
    "type": "AntiTurnstileTaskProxyLess",
    "websiteURL": "{page_url}",
    "websiteKey": "{sitekey}",
    "metadata": { "action": "managed" }
  }
}

// 3. 轮询结果
POST https://api.capsolver.com/getTaskResult
{ "clientKey": "{api_key}", "taskId": "{task_id}" }

// 4. 注入 token（找到 Turnstile callback）
document.querySelector('[name="cf-turnstile-response"]').value = '{token}';
// 或通过 callback
turnstileCallback('{token}');
```

### hCaptcha

```javascript
// 提取 sitekey
const sitekey = document.querySelector('.h-captcha')?.dataset.sitekey
  || document.querySelector('iframe[src*="hcaptcha"]')?.src.match(/sitekey=([^&]+)/)?.[1];

// 提交（2Captcha 格式）
POST https://2captcha.com/in.php
  method=hcaptcha
  sitekey={sitekey}
  pageurl={url}
  key={api_key}
```

## 反检测补丁（CDP 注入）

在 CDP 连接建立后、导航前注入以下补丁：

```javascript
// 1. 隐藏 navigator.webdriver
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// 2. 伪造 Chrome runtime
window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){} };

// 3. 修复 iframe contentWindow 检测
Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
  get: function() { return window; }
});

// 4. 伪装 permissions API
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) => (
  parameters.name === 'notifications' ?
    Promise.resolve({ state: Notification.permission }) :
    originalQuery(parameters)
);
```

## 配置

在 brand config JSON 中添加：

```json
{
  "bypass": {
    "flaresolverr_url": "http://localhost:8191",
    "captcha_provider": "2captcha",
    "captcha_api_key_env": "CAPTCHA_API_KEY",
    "max_captcha_cost_per_run": 0.50,
    "cf_retry_count": 3,
    "cf_retry_delay_ms": 5000
  }
}
```

## 推荐组合

### 低预算（免费）
CDP 接管（已有 CF session）+ pressSequentially 反检测 + 数学/文字验证码自动解

### 中等预算（<$10/月）
FlareSolverr Docker + 2Captcha 按量付费（只解 Turnstile 和 reCAPTCHA）

### 高产出（自动化优先）
FlareSolverr + CapSolver + CDP 接管 fallback + puppeteer-extra-stealth 注入
