# Bypass Anything

> Claude Code skill for browser automation with anti-detection, human behavior simulation, Cloudflare bypass, and CAPTCHA solving.

Zero Puppeteer. CDP WebSocket native. 11 anti-detection modules. Bezier mouse. Typing rhythm. Turnstile auto-solve.

## What It Does

This is a **Claude Code skill** that gives Claude direct control over a real Chrome browser via CDP (Chrome DevTools Protocol) WebSocket. Unlike Puppeteer/Playwright which use a Node.js HTTP layer, CDP commands go through Chrome's built-in networking stack, which means:

- Proxy settings work (Chrome respects system proxy)
- Existing login sessions are reused
- Cloudflare challenges can be passed by reusing verified sessions
- No detectable `Runtime.enable` artifacts

### Three-Layer Anti-Detection

| Layer | Module | What It Defeats |
|-------|--------|-----------------|
| 1. Fingerprint | `stealth-inject.mjs` (11 modules) | navigator.webdriver, Chrome runtime, Permissions API, iframe contentWindow, WebGL vendor/renderer, plugins, languages, media codecs, sourceURL, hardwareConcurrency, deviceMemory |
| 2. Behavior | `human-behavior.mjs` | Bezier curve mouse with velocity profile + Perlin noise timing, typing rhythm with CDP keyDown/keyUp, random scroll, inter-action pauses |
| 3. CAPTCHA/CF | `captcha-solver.mjs` + `cf-solver.mjs` | Turnstile in-page token capture (free), reCAPTCHA/hCaptcha via 2Captcha/CapSolver/Anti-Captcha, FlareSolverr for CF challenges |

## Install

```bash
git clone https://github.com/1596941391qq/bypass-anything.git
cd bypass-anything/bypass-anything
bash install.sh
```

Or manually:

```bash
cd bypass-anything/bypass-anything && npm install
```

### Add to Claude Code

```bash
# Global (available in all projects)
cp -r bypass-anything ~/.claude/skills/bypass-anything

# Or project-level (shared with team via git)
cp -r bypass-anything your-project/.claude/skills/bypass-anything
```

### Launch Chrome with CDP

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

### Optional: FlareSolverr (CF Bypass)

```bash
docker run -d -p 8191:8191 ghcr.io/flaresolverr/flaresolverr
```

### Optional: CAPTCHA API Keys

```bash
export CAPTCHA_2CAPTCHA_KEY="your_key"     # ~$3/1000 solves
export CAPTCHA_CAPSOLVER_KEY="your_key"     # ~$2/1000 solves
```

Turnstile works without any API key (local in-page token capture).

## Usage Scenarios

### 1. Backlink Automation

Submit to directories, forums, Web 2.0 platforms. Human behavior simulation passes anti-spam checks.

```
Navigate to https://submit-site.com/submit and fill the form:
- Title: My Brand
- URL: https://mybrand.com
- Description: A wellness brand...
```

**Anti-spam compatibility:**

| System | Bypass? | How |
|--------|---------|-----|
| Akismet | Yes | Clean email + ISP proxy + URL in author field |
| Antispam Bee | Yes | `typeHuman()` triggers real keyboard events |
| CleanTalk | No | 403 hard block, detect and skip |
| hCaptcha Enterprise | No | Server-side stripping, skip |

**Rule: One link per root domain per brand.** Same-domain links have zero SEO value after the first.

### 2. Brand Monitoring

Navigate to competitor pages, capture screenshots, extract mentions. Anti-detection ensures no IP blocks.

```
Go to https://reddit.com/r/wellness and search for "my brand name", capture the top 10 results with screenshots.
```

### 3. Account Registration Bot

Fill registration forms with human-like behavior. Turnstile auto-solves. For reCAPTCHA/hCaptcha, configure API key.

```
Register an account on https://example.com with:
- Username: john_doe_2024
- Email: john+site@gmail.com
- Password: [generate a secure one]
```

### 4. Web Scraping Behind Protection

Cloudflare-protected sites: CDP takeover reuses your browser's verified session. If challenge triggers, FlareSolverr solves it.

```
Scrape the article list from https://cf-protected-site.com/blog and save as JSON.
```

### 5. Reverse Proxy Verification

CDP uses Chrome's HTTP stack (not Node.js), so proxy settings work correctly. Verify what users behind specific proxies see.

```
Navigate to https://example.com through the proxy and capture the full page HTML and response headers.
```

## Module Reference

### cdp-submit.mjs — Main Engine

```javascript
import { connect, navigate, getPageInfo, fillField, clickElement, takeScreenshot } from './scripts/cdp-submit.mjs';

// Connect to Chrome
await connect(9222);

// Navigate (uses Chrome HTTP, respects proxy)
const url = await navigate('https://example.com', 5000);

// Analyze page
const info = await getPageInfo();
// { url, title, forms, links, hasRecaptcha, hasHcaptcha, hasTurnstile, hasCfChallenge, buttons }

// Fill form with human typing
await fillField('input[name="email"]', 'user@example.com');

// Click with human mouse movement
await clickElement('button[type="submit"]');

// Screenshot
await takeScreenshot('./output.png');
```

### stealth-inject.mjs — Anti-Detection

```javascript
import { injectStealth } from './scripts/stealth-inject.mjs';
await injectStealth(cdpSend);  // Injects all 11 modules
```

### human-behavior.mjs — Behavior Simulation

```javascript
import { moveMouse, clickHuman, typeHuman, scrollRandom, randomPause } from './scripts/human-behavior.mjs';

await moveMouse(send, 100, 100, 500, 300);     // Bezier curve mouse
await clickHuman(send, 500, 300);               // Move + pause + click
await typeHuman(send, 'input[name="q"]', 'text'); // CDP keyDown/keyUp + DOM update
await scrollRandom(send, 300);                  // Variable-speed scroll
await randomPause(500, 2000);                    // Random delay
```

### cf-solver.mjs — Cloudflare Bypass

```javascript
import { solveCf } from './scripts/cf-solver.mjs';
const { html, cookies, method } = await solveCf('https://cf-protected.com');
// Tries FlareSolverr first, falls back to CDP takeover
```

### captcha-solver.mjs — CAPTCHA Handling

```javascript
import { handleCaptcha, solveCaptcha } from './scripts/captcha-solver.mjs';

// Full auto-detect + solve + inject
const result = await handleCaptcha(cdpSend, pageInfo);

// Or manual per-type
const token = await solveCaptcha('recaptcha_v2', {
  sitekey: '...',
  pageUrl: '...',
  provider: '2captcha',
  cdpSend,
});
```

## Anti-Detection Score

Tested on [bot.sannysoft.com](https://bot.sannysoft.com):

| Check | Status |
|-------|--------|
| User Agent | Pass (real Chrome) |
| WebDriver | Pass (undefined) |
| Chrome runtime | Pass (faked) |
| Plugins | Pass (3 fake plugins) |
| Languages | Pass |
| WebGL Vendor | Pass (Intel) |
| Permissions | Pass |
| Hardware | Pass (8 core, 8GB) |
| Media Codecs | Pass |
| **Canvas Fingerprint** | **Not covered** |
| **AudioContext** | **Not covered** |
| **Font Enumeration** | **Not covered** |

## Project Structure

```
bypass-anything/
├── README.md                    ← This file
├── bypass-anything/
│   ├── SKILL.md                 ← Claude Code skill definition
│   ├── install.sh               ← Dependency installer
│   ├── config.json              ← Default configuration
│   ├── package.json             ← Node.js dependencies (ws)
│   └── scripts/
│       ├── cdp-submit.mjs       ← Main CDP WebSocket engine
│       ├── stealth-inject.mjs   ← 11 anti-detection modules
│       ├── human-behavior.mjs   ← Bezier mouse + typing rhythm
│       ├── cf-solver.mjs        ← FlareSolverr + CDP fallback
│       └── captcha-solver.mjs   ← Turnstile local + 3 paid APIs
```

## Roadmap

### Next Up
- [ ] **Canvas fingerprint randomization** — Add noise to `toDataURL()` output
- [ ] **AudioContext fingerprint noise** — Oscillator frequency jitter
- [ ] **Font enumeration protection** — Return standard font list only
- [ ] **Cookie jar persistence** — Save/load sessions across restarts

### Medium Term
- [ ] **Residential IP rotation** — Bright Data / IPRoyal / SmartProxy integration
- [ ] **Multi-profile parallel sessions** — Run N Chrome instances simultaneously
- [ ] **Smart form detection** — Label-based field matching instead of CSS selectors
- [ ] **Credential vault** — Encrypted storage for site logins
- [ ] **Visual CAPTCHA classification** — Local ONNX model for image challenges

### Long Term
- [ ] **Playwright MCP bridge** — Hybrid mode for complex interactions
- [ ] **Browser fingerprint diversity** — Generate unique consistent fingerprints per profile
- [ ] **Behavioral AI** — Learn site-specific interaction patterns from observation
- [ ] **Distributed worker pool** — Orchestrate multiple machines for large-scale tasks

## Dependencies

- **Node.js** >= 18 (for native `fetch`)
- **Google Chrome** (any recent version)
- **ws** npm package (WebSocket client)
- **FlareSolverr** (optional, Docker, for CF challenge bypass)
- **2Captcha/CapSolver/Anti-Captcha** account (optional, for non-Turnstile CAPTCHA)

## License

MIT
