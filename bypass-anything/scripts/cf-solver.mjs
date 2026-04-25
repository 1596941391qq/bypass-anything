/**
 * FlareSolverr 客户端 + CDP fallback
 *
 * 两种 CF 绕过模式:
 * 1. FlareSolverr Docker HTTP API（独立服务，解 CF challenge 返回 cookies）
 * 2. CDP 接管（复用用户 Chrome 已过验证的 session）
 *
 * 用法:
 *   import { solveCf } from './cf-solver.mjs';
 *   const { html, cookies } = await solveCf('https://target.com', { flareUrl: 'http://localhost:8191' });
 */

import { WebSocket } from 'ws';
import http from 'http';

const DEFAULT_FLARE_URL = 'http://localhost:8191';
const FLARE_TIMEOUT = 60000;
const CDP_TIMEOUT = 30000;

/**
 * FlareSolverr GET 请求
 */
function flareGet(url, flareUrl = DEFAULT_FLARE_URL, maxTimeout = FLARE_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      cmd: 'request.get',
      url,
      maxTimeout,
    });

    const parsed = new URL(`${flareUrl}/v1`);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.status === 'ok') {
            resolve({
              html: data.solution.response,
              url: data.solution.url,
              cookies: data.solution.cookies,
              userAgent: data.solution.userAgent,
              method: 'flaresolverr',
            });
          } else {
            reject(new Error(`FlareSolverr error: ${data.message || body}`));
          }
        } catch {
          reject(new Error(`FlareSolverr parse error: ${body.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(FLARE_TIMEOUT + 5000, () => {
      req.destroy();
      reject(new Error('FlareSolverr timeout'));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * FlareSolverr POST 请求（带表单数据）
 */
function flarePost(url, postData, flareUrl = DEFAULT_FLARE_URL, maxTimeout = FLARE_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      cmd: 'request.post',
      url,
      postData: typeof postData === 'string' ? postData : new URLSearchParams(postData).toString(),
      maxTimeout,
    });

    const parsed = new URL(`${flareUrl}/v1`);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.status === 'ok') {
            resolve({
              html: data.solution.response,
              url: data.solution.url,
              cookies: data.solution.cookies,
              userAgent: data.solution.userAgent,
              method: 'flaresolverr',
            });
          } else {
            reject(new Error(`FlareSolverr POST error: ${data.message || body}`));
          }
        } catch {
          reject(new Error(`FlareSolverr parse error: ${body.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(FLARE_TIMEOUT + 5000, () => {
      req.destroy();
      reject(new Error('FlareSolverr timeout'));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * 检测 FlareSolverr 是否运行
 */
function checkFlareAlive(flareUrl = DEFAULT_FLARE_URL) {
  return new Promise((resolve) => {
    const parsed = new URL(`${flareUrl}/health`);
    http.get(`${parsed.protocol}//${parsed.host}/`, { timeout: 3000 }, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 404);
    }).on('error', () => resolve(false));
  });
}

/**
 * CDP fallback: 接管已运行的 Chrome，复用 CF session
 */
async function cdpNavigate(url, port = 9222) {
  const res = await fetch(`http://127.0.0.1:${port}/json`);
  const tabs = await res.json();
  const page = tabs.find(t => t.type === 'page' && !t.url.startsWith('chrome://'));
  if (!page) throw new Error('No usable Chrome tab');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 1;

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
    setTimeout(() => reject(new Error('CDP WS connect timeout')), 10000);
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      ws.send(JSON.stringify({ id, method, params }));
      const handler = (data) => {
        const msg = JSON.parse(data);
        if (msg.id === id) {
          ws.off('message', handler);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
      ws.on('message', handler);
      setTimeout(() => reject(new Error('CDP timeout')), CDP_TIMEOUT);
    });
  }

  // 注入反检测补丁 (must use Page.addScriptToEvaluateOnNewDocument, not Runtime.evaluate)
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      if(!window.chrome)window.chrome={};
      if(!window.chrome.runtime)window.chrome.runtime={connect:function(){return{onDisconnect:{addListener:function(){}},onMessage:{addListener:function(){}},postMessage:function(){}};},sendMessage:function(){}};
      if(!window.chrome.loadTimes)window.chrome.loadTimes=function(){return{commitLoadTime:Date.now()/1000}};
      if(!window.chrome.csi)window.chrome.csi=function(){return{onloadT:Date.now(),pageT:500+Math.random()*500}};
    `,
  });

  // 导航
  await send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, 8000));

  // 检查是否还在 CF challenge 页面
  const check = await send('Runtime.evaluate', {
    expression: `!!document.querySelector('#challenge-running, #challenge-form, .cf-browser-verification')`,
    returnByValue: true,
  });

  const isCfChallenge = check?.result?.value;
  if (isCfChallenge) {
    // 等待 CF challenge 自动完成
    console.log('  CF challenge detected, waiting 15s...');
    await new Promise(r => setTimeout(r, 15000));
  }

  // 提取 HTML
  const htmlResult = await send('Runtime.evaluate', {
    expression: `document.documentElement.outerHTML`,
    returnByValue: true,
  });

  const cookies = await send('Network.getAllCookies');

  ws.close();

  return {
    html: htmlResult?.result?.value || '',
    url,
    cookies: (cookies?.cookies || []).map(c => ({ name: c.name, value: c.value, domain: c.domain })),
    method: 'cdp-takeover',
  };
}

/**
 * 主入口: 智能选择 CF 绕过方式
 *
 * 优先级: FlareSolverr → CDP 接管
 */
export async function solveCf(url, options = {}) {
  const { flareUrl = DEFAULT_FLARE_URL, cdpPort = 9222, retries = 2 } = options;

  // 尝试 FlareSolverr
  const flareAlive = await checkFlareAlive(flareUrl);
  if (flareAlive) {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`  [FlareSolverr] Attempt ${i + 1}: ${url}`);
        const result = await flareGet(url, flareUrl);
        console.log(`  [FlareSolverr] Success (${result.html.length} bytes)`);
        return result;
      } catch (e) {
        console.log(`  [FlareSolverr] Failed: ${e.message}`);
        if (i < retries - 1) await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  // Fallback: CDP 接管
  console.log(`  [CDP Fallback] Connecting to port ${cdpPort}...`);
  try {
    const result = await cdpNavigate(url, cdpPort);
    console.log(`  [CDP Fallback] Success (${result.html.length} bytes)`);
    return result;
  } catch (e) {
    throw new Error(`All CF bypass methods failed. FlareSolverr: ${flareAlive ? 'tried' : 'not running'}. CDP: ${e.message}`);
  }
}

/**
 * 带 CF cookies 的表单提交
 */
export async function submitWithCfCookies(url, formData, flareUrl = DEFAULT_FLARE_URL) {
  const flareAlive = await checkFlareAlive(flareUrl);
  if (!flareAlive) {
    throw new Error('FlareSolverr not running. POST with CF cookies requires FlareSolverr.');
  }

  return flarePost(url, formData, flareUrl);
}

export { flareGet, flarePost, checkFlareAlive, cdpNavigate };

// CLI mode
if (process.argv[1] && process.argv[1].includes('cf-solver.mjs')) {
  const url = process.argv.find(a => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1]);
  if (!url) {
    console.log('Usage: node cf-solver.mjs <url> [--flare=http://localhost:8191] [--port=9222]');
    process.exit(1);
  }

  const flareArg = process.argv.find(a => a.startsWith('--flare='));
  const portArg = process.argv.find(a => a.startsWith('--port='));
  const flareUrl = flareArg ? flareArg.split('=')[1] : DEFAULT_FLARE_URL;
  const cdpPort = portArg ? parseInt(portArg.split('=')[1]) : 9222;

  console.log('=== CF Solver ===');
  console.log(`Target: ${url}`);
  console.log(`FlareSolverr: ${flareUrl}`);
  console.log(`CDP Fallback: port ${cdpPort}`);

  solveCf(url, { flareUrl, cdpPort })
    .then(r => {
      console.log(`\nMethod: ${r.method}`);
      console.log(`URL: ${r.url}`);
      console.log(`HTML size: ${r.html.length} bytes`);
      console.log(`Cookies: ${r.cookies?.length || 0}`);
      if (r.cookies?.length) {
        console.log('  CF cookie:', r.cookies.find(c => c.name === 'cf_clearance')?.value?.slice(0, 30) + '...');
      }
    })
    .catch(e => {
      console.error('Failed:', e.message);
      process.exit(1);
    });
}
