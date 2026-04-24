/**
 * CDP WebSocket 外链提交引擎
 *
 * 基于 edge-knowledge-pack 的 CDP 模式。
 * 核心区别: 不用 Puppeteer page.goto()（走 Node HTTP，没代理），
 * 而是用 CDP WebSocket 的 Page.navigate（走 Chrome 内置 HTTP，有代理）。
 *
 * 适用场景:
 * - Cloudflare 保护的目录站
 * - 需要 OAuth 登录的提交页
 * - Puppeteer 超时但浏览器能访问的站点
 *
 * 用法:
 *   node cdp-submit.mjs <url> [--port=9222]
 */

import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectStealth } from './stealth-inject.mjs';
import { moveMouse, clickHuman, scrollRandom, typeHuman, randomPause } from './human-behavior.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_ROOT = path.resolve(__dirname, '..');

let ws;
let msgId = 1;
const pendingSends = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    ws.send(JSON.stringify({ id, method, params }));
    const handler = (data) => {
      const msg = JSON.parse(data);
      if (msg.id === id) {
        ws.off('message', handler);
        pendingSends.delete(id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
    ws.on('message', handler);
    pendingSends.set(id, { resolve, reject, handler });
    setTimeout(() => {
      ws.off('message', handler);
      pendingSends.delete(id);
      reject(new Error('CDP timeout (30s)'));
    }, 30000);
  });
}

function evaluate(expr) {
  return send('Runtime.evaluate', { expression: expr, returnByValue: true });
}

async function connect(port = 9222) {
  const res = await fetch(`http://127.0.0.1:${port}/json`);
  const tabs = await res.json();
  const page = tabs.find(t => t.type === 'page' && !t.url.startsWith('chrome://'))
    || tabs.find(t => t.type === 'page'); // Fallback: use any page tab
  if (!page) throw new Error('No usable Chrome tab found');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
    setTimeout(() => reject(new Error('WS connect timeout')), 10000);
  });

  // Wire close/error to reject all pending sends
  ws.on('close', () => {
    for (const [id, { reject }] of pendingSends) {
      reject(new Error('WebSocket closed'));
    }
    pendingSends.clear();
  });
  ws.on('error', (err) => {
    for (const [id, { reject }] of pendingSends) {
      reject(new Error(`WebSocket error: ${err.message}`));
    }
    pendingSends.clear();
  });

  console.log(`CDP connected: ${page.url.slice(0, 60)}`);

  // Inject all 11 stealth modules
  await send('Page.enable');
  await injectStealth(send);

  return page;
}

async function navigate(url, waitMs = 5000) {
  await send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, waitMs));
  const r = await evaluate('document.URL');
  return r?.result?.value;
}

async function getPageInfo() {
  const r = await evaluate(`JSON.stringify({
    url: location.href,
    title: document.title,
    forms: document.querySelectorAll('form').length,
    links: document.querySelectorAll('a').length,
    hasRecaptcha: !!document.querySelector('iframe[src*="recaptcha"]'),
    hasRecaptchaV3: !!document.querySelector('script[src*="recaptcha/enterprise"]'),
    hasHcaptcha: !!document.querySelector('.h-captcha'),
    hasTurnstile: !!document.querySelector('[data-sitekey]') || !!document.querySelector('iframe[src*="turnstile"]'),
    hasCfChallenge: !!document.querySelector('#challenge-running, #challenge-form, .cf-browser-verification'),
    hasCleanTalk: !!document.querySelector('[id*="cleantalk"], script[src*="cleantalk"]'),
    buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t.length < 30)
  })`);
  return JSON.parse(r?.result?.value || '{}');
}

async function fillField(selector, value) {
  // Use human-like typing for anti-spam evasion
  return typeHuman(send, selector, value);
}

async function clickElement(selector) {
  // Get element position for human-like click
  const pos = await evaluate(`
    (function(){
      var el = document.querySelector('${selector}');
      if(!el) return null;
      var r = el.getBoundingClientRect();
      return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 });
    })()
  `);
  if (!pos?.result?.value) return evaluate(`document.querySelector('${selector}') ? 'NOT_FOUND' : 'NOT_FOUND'`);
  const { x, y } = JSON.parse(pos.result.value);
  await clickHuman(send, x, y);
  return 'OK';
}

async function pressSequentially(selector, text, delay = 50) {
  // Delegate to human behavior module with variable typing rhythm
  return typeHuman(send, selector, text, delay);
}

async function submitForm(formSelector) {
  return evaluate(`
    (function(){
      var form = document.querySelector('${formSelector || 'form'}');
      if(!form) return 'NOT_FOUND';
      var btn = form.querySelector('button[type=submit], input[type=submit]');
      if(btn) btn.click();
      else form.submit();
      return 'OK';
    })()
  `);
}

async function takeScreenshot(outPath) {
  const r = await send('Page.captureScreenshot', { format: 'png', quality: 80 });
  if (r?.data) {
    fs.writeFileSync(outPath, Buffer.from(r.data, 'base64'));
    return outPath;
  }
  return null;
}

export { send, evaluate, connect, navigate, getPageInfo, fillField, clickElement, pressSequentially, submitForm, takeScreenshot };

// ─── 主流程 ───

async function main() {
  const args = process.argv.slice(2);
  const portArg = args.find(a => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1]) : 9222;
  const targetUrl = args.find(a => !a.startsWith('--'));

  if (!targetUrl) {
    console.log('Usage: node cdp-submit.mjs <url> [--port=9222]');
    console.log('  CDP WebSocket based form submitter');
    process.exit(1);
  }

  console.log('=== CDP WebSocket Submit Engine ===');
  console.log(`Target: ${targetUrl}`);
  console.log(`CDP Port: ${port}`);

  await connect(port);

  // 1. Navigate
  console.log(`\n→ Navigating: ${targetUrl}`);
  const currentUrl = await navigate(targetUrl, 6000);
  console.log(`  Landed: ${currentUrl}`);

  // 2. Page analysis
  const info = await getPageInfo();
  console.log(`  Title: ${info.title}`);
  console.log(`  Forms: ${info.forms} | Links: ${info.links}`);
  console.log(`  Buttons: ${(info.buttons || []).slice(0, 8).join(', ')}`);

  if (info.hasCfChallenge) {
    console.log('  CF challenge detected - waiting 10s...');
    await new Promise(r => setTimeout(r, 10000));
  }

  // 3. Screenshot
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const ssPath = path.join(PACK_ROOT, `cdp-submit-${ts}.png`);
  await takeScreenshot(ssPath);
  console.log(`  Screenshot: ${ssPath}`);

  // 4. Output page info as JSON for Claude Code to decide next steps
  const result = { ...info, screenshot: ssPath, timestamp: ts };
  console.log('\n=== PAGE INFO (for Claude Code) ===');
  console.log(JSON.stringify(result, null, 2));

  ws.close();
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
