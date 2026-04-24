/**
 * Multi-provider CAPTCHA solver
 *
 * Providers: 2Captcha, CapSolver, Anti-Captcha
 * Types: reCAPTCHA v2/v3, hCaptcha, Turnstile, image
 * Turnstile: local in-page token capture (no external dependency)
 *
 * Usage:
 *   import { solveCaptcha, detectCaptcha, handleCaptcha } from './captcha-solver.mjs';
 *   const types = await detectCaptcha(pageInfo);
 *   const token = await solveCaptcha('recaptcha_v2', { sitekey, pageUrl });
 */

import https from 'https';
import http from 'http';

const PROVIDERS = {
  '2captcha': {
    submitUrl: 'https://2captcha.com/in.php',
    resultUrl: 'https://2captcha.com/res.php',
    balanceUrl: 'https://2captcha.com/res.php',
    keyEnv: 'CAPTCHA_2CAPTCHA_KEY',
    pollInterval: 5000,
    createPayload: (type, params, apiKey) => {
      const base = { key: apiKey, soft_id: 'bypass-anything', json: 1 };
      switch (type) {
        case 'recaptcha_v2':
          return { ...base, method: 'userrecaptcha', googlekey: params.sitekey, pageurl: params.pageUrl };
        case 'recaptcha_v3':
          return { ...base, method: 'userrecaptcha', googlekey: params.sitekey, pageurl: params.pageUrl, version: 'v3', action: params.action || 'submit', min_score: params.minScore || 0.3 };
        case 'hcaptcha':
          return { ...base, method: 'hcaptcha', sitekey: params.sitekey, pageurl: params.pageUrl };
        case 'turnstile':
          return { ...base, method: 'turnstile', sitekey: params.sitekey, pageurl: params.pageUrl, action: params.action || 'managed' };
        case 'image':
          return { ...base, method: 'base64', body: params.imageBase64 };
        default:
          throw new Error(`2captcha: unsupported type ${type}`);
      }
    },
    parseSubmitResponse: (data) => data.request,
    parseResultResponse: (data) => {
      if (data.status === 1) return data.request;
      if (data.request === 'CAPCHA_NOT_READY') return null;
      throw new Error(`2captcha error: ${data.request}`);
    },
  },
  capsolver: {
    createUrl: 'https://api.capsolver.com/createTask',
    resultUrl: 'https://api.capsolver.com/getTaskResult',
    balanceUrl: 'https://api.capsolver.com/getBalance',
    keyEnv: 'CAPTCHA_CAPSOLVER_KEY',
    pollInterval: 3000,
    createPayload: (type, params, apiKey) => {
      const taskTypes = {
        recaptcha_v2: 'ReCaptchaV2TaskProxyLess',
        recaptcha_v3: 'ReCaptchaV3TaskProxyLess',
        hcaptcha: 'HCaptchaTaskProxyLess',
        turnstile: 'AntiTurnstileTaskProxyLess',
      };
      const task = {
        type: taskTypes[type] || type,
        websiteURL: params.pageUrl,
        websiteKey: params.sitekey,
      };
      if (type === 'recaptcha_v3') {
        task.pageAction = params.action || 'submit';
        task.minScore = params.minScore || 0.3;
      }
      if (type === 'turnstile') {
        task.metadata = { action: params.action || 'managed' };
      }
      return { clientKey: apiKey, task };
    },
    parseSubmitResponse: (data) => {
      if (data.errorId) throw new Error(`CapSolver error: ${data.errorDescription}`);
      return data.taskId;
    },
    parseResultResponse: (data) => {
      if (data.errorId) throw new Error(`CapSolver error: ${data.errorDescription}`);
      if (data.status === 'ready') return data.solution.gRecaptchaResponse || data.solution.token || data.solution.responseText;
      return null;
    },
  },
  anticaptcha: {
    createUrl: 'https://api.anti-captcha.com/createTask',
    resultUrl: 'https://api.anti-captcha.com/getTaskResult',
    balanceUrl: 'https://api.anti-captcha.com/getBalance',
    keyEnv: 'CAPTCHA_ANTICAPTCHA_KEY',
    pollInterval: 5000,
    createPayload: (type, params, apiKey) => {
      const taskTypes = {
        recaptcha_v2: 'NoCaptchaTaskProxyless',
        recaptcha_v3: 'RecaptchaV3TaskProxyless',
        hcaptcha: 'HCaptchaTaskProxyless',
        turnstile: 'TurnstileTaskProxyless',
      };
      const task = {
        type: taskTypes[type] || type,
        websiteURL: params.pageUrl,
        websiteKey: params.sitekey,
      };
      if (type === 'recaptcha_v3') {
        task.pageAction = params.action || 'submit';
        task.minScore = params.minScore || 0.3;
      }
      return { clientKey: apiKey, task };
    },
    parseSubmitResponse: (data) => {
      if (data.errorId) throw new Error(`Anti-Captcha error: ${data.errorDescription}`);
      return data.taskId;
    },
    parseResultResponse: (data) => {
      if (data.errorId) throw new Error(`Anti-Captcha error: ${data.errorDescription}`);
      if (data.status === 'ready') return data.solution.gRecaptchaResponse || data.solution.token;
      return null;
    },
  },
};

function httpPost(url, payload) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(payload);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error(`Parse error: ${body.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('HTTP timeout')); });
    req.write(data);
    req.end();
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(body); }
      });
    }).on('error', reject);
  });
}

function getApiKey(providerName) {
  const provider = PROVIDERS[providerName];
  if (!provider) throw new Error(`Unknown provider: ${providerName}`);
  const key = process.env[provider.keyEnv];
  if (!key) throw new Error(`Missing API key: set ${provider.keyEnv} env var`);
  return key;
}

export function detectCaptcha(pageInfo) {
  const results = [];
  if (pageInfo.hasRecaptcha) results.push('recaptcha_v2');
  if (pageInfo.hasHcaptcha) results.push('hcaptcha');
  if (pageInfo.hasTurnstile) results.push('turnstile');
  if (pageInfo.hasRecaptchaV3) results.push('recaptcha_v3');
  return results;
}

export async function extractSitekey(cdpSend, type) {
  const selectors = {
    recaptcha_v2: ['.g-recaptcha[data-sitekey]', 'iframe[src*="recaptcha"]'],
    hcaptcha: ['.h-captcha[data-sitekey]', 'iframe[src*="hcaptcha"]'],
    turnstile: ['[data-sitekey]', 'iframe[src*="turnstile"]', '.cf-turnstile[data-sitekey]'],
  };

  for (const s of (selectors[type] || [])) {
    const r = await cdpSend('Runtime.evaluate', {
      expression: `(function(){var el=document.querySelector('${s}');if(!el)return null;return el.dataset?.sitekey||el.src?.match(/sitekey=([^&]+)/)?.[1]||null})()`,
      returnByValue: true,
    });
    if (r?.result?.value) return r.result.value;
  }
  return null;
}

const TURNSTILE_INJECTION = `
(function(){
  if(typeof turnstile!=='undefined'){
    var origRender=turnstile.render;
    turnstile.render=function(container,params){
      var origCallback=params.callback;
      params.callback=function(token){
        window.__turnstile_token=token;
        if(typeof origCallback==='function')origCallback(token);
      };
      return origRender?origRender(container,params):null;
    };
  }
  var existing=document.querySelector('[name="cf-turnstile-response"]');
  if(existing&&existing.value)return existing.value;
  return new Promise(function(resolve){
    var start=Date.now();
    (function check(){
      var el=document.querySelector('[name="cf-turnstile-response"]');
      if(el&&el.value&&el.value.length>10)resolve(el.value);
      else if(window.__turnstile_token)resolve(window.__turnstile_token);
      else if(Date.now()-start>30000)resolve('');
      else setTimeout(check,500);
    })();
  });
})()
`;

async function solveLocalTurnstile(cdpSend) {
  await cdpSend('Runtime.evaluate', {
    expression: TURNSTILE_INJECTION,
    returnByValue: true,
    awaitPromise: true,
  });

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    const r = await cdpSend('Runtime.evaluate', {
      expression: `document.querySelector('[name="cf-turnstile-response"]')?.value||window.__turnstile_token||''`,
      returnByValue: true,
    });
    const token = r?.result?.value;
    if (token && token.length > 10) return token;
  }
  return null;
}

export async function solveCaptcha(type, params) {
  const {
    provider: providerName = process.env.CAPTCHA_PROVIDER || '2captcha',
    sitekey,
    pageUrl,
    imageBase64,
    action,
    minScore,
    maxWait = 120000,
    cdpSend,
  } = params;

  // Turnstile: try local in-page first (free)
  if (type === 'turnstile' && cdpSend) {
    try {
      const localToken = await solveLocalTurnstile(cdpSend);
      if (localToken) {
        console.log(`  [CAPTCHA] Turnstile solved locally`);
        return localToken;
      }
    } catch {}
    console.log(`  [CAPTCHA] Turnstile local failed, falling back to ${providerName}`);
  }

  // Paid API
  const provider = PROVIDERS[providerName];
  if (!provider) throw new Error(`Unknown provider: ${providerName}. Available: ${Object.keys(PROVIDERS).join(', ')}`);
  const apiKey = getApiKey(providerName);
  const startTime = Date.now();

  console.log(`  [CAPTCHA] Creating ${type} task via ${providerName}...`);
  const payload = provider.createPayload(type, { sitekey, pageUrl, imageBase64, action, minScore }, apiKey);

  let taskId;
  if (providerName === '2captcha') {
    const qs = new URLSearchParams(payload).toString();
    taskId = provider.parseSubmitResponse(await httpGet(`${provider.submitUrl}?${qs}`));
  } else {
    taskId = provider.parseSubmitResponse(await httpPost(provider.createUrl, payload));
  }
  console.log(`  [CAPTCHA] Task created: ${taskId}`);

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, provider.pollInterval));
    let result;
    if (providerName === '2captcha') {
      const qs = new URLSearchParams({ key: apiKey, action: 'get', id: taskId, json: 1 }).toString();
      result = await httpGet(`${provider.resultUrl}?${qs}`);
    } else {
      result = await httpPost(provider.resultUrl, { clientKey: apiKey, taskId });
    }
    const token = provider.parseResultResponse(result);
    if (token) {
      console.log(`  [CAPTCHA] Solved in ${Math.round((Date.now() - startTime) / 1000)}s`);
      return token;
    }
  }
  throw new Error(`CAPTCHA solve timeout after ${maxWait / 1000}s`);
}

export async function injectToken(cdpSend, type, token) {
  const injectScripts = {
    recaptcha_v2: `(function(){var el=document.getElementById('g-recaptcha-response');if(el){el.innerHTML='${token}';el.value='${token}';}if(typeof ___grecaptcha_cfg!=='undefined'){var c=___grecaptcha_cfg.clients;for(var k in c){if(c[k].callback){c[k].callback('${token}');return 'callback';}}}return 'input';})()`,
    hcaptcha: `(function(){var el=document.querySelector('[name="h-captcha-response"]');if(el){el.innerHTML='${token}';el.value='${token}';}if(typeof hcaptcha!=='undefined'&&hcaptcha.setResponse){hcaptcha.setResponse('${token}');return 'api';}return 'input';})()`,
    turnstile: `(function(){var el=document.querySelector('[name="cf-turnstile-response"]');if(el)el.value='${token}';if(typeof turnstile!=='undefined'){turnstile.getResponse=function(){return '${token}';};}return 'input';})()`,
  };
  const script = injectScripts[type];
  if (!script) throw new Error(`No injection script for ${type}`);
  const r = await cdpSend('Runtime.evaluate', { expression: script, returnByValue: true });
  return r?.result?.value;
}

export async function getBalance(providerName = process.env.CAPTCHA_PROVIDER || '2captcha') {
  const provider = PROVIDERS[providerName];
  const apiKey = getApiKey(providerName);
  if (providerName === '2captcha') {
    const qs = new URLSearchParams({ key: apiKey, action: 'getbalance', json: 1 }).toString();
    return parseFloat((await httpGet(`${provider.balanceUrl}?${qs}`)).request);
  }
  const r = await httpPost(provider.balanceUrl, { clientKey: apiKey });
  return r.balance || r.errorDescription;
}

export async function handleCaptcha(cdpSend, pageInfo, options = {}) {
  const types = detectCaptcha(pageInfo);
  if (!types.length) return null;

  const type = types[0];
  console.log(`  [CAPTCHA] Detected: ${type}`);

  const sitekey = await extractSitekey(cdpSend, type);
  if (!sitekey) { console.log(`  [CAPTCHA] Could not extract sitekey`); return null; }
  console.log(`  [CAPTCHA] Sitekey: ${sitekey}`);

  const currentUrl = await cdpSend('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
  const pageUrl = currentUrl?.result?.value;

  const token = await solveCaptcha(type, { ...options, sitekey, pageUrl, cdpSend });
  const injectResult = await injectToken(cdpSend, type, token);
  console.log(`  [CAPTCHA] Injected via ${injectResult}`);
  return { type, sitekey, token, injectMethod: injectResult };
}

// CLI
if (process.argv[1]?.includes('captcha-solver.mjs')) {
  const cmd = process.argv[2];
  if (cmd === 'balance') {
    const provider = process.argv[3] || '2captcha';
    getBalance(provider).then(b => console.log(`${provider} balance: $${b}`)).catch(e => console.error(e.message));
  } else {
    console.log('Usage: node captcha-solver.mjs balance [2captcha|capsolver|anticaptcha]');
  }
}
