/**
 * AdsPower 指纹浏览器客户端
 *
 * 封装 AdsPower Local API：profile CRUD + CDP 连接 + SOCKS5 代理配置。
 * 供 submit-v2 / submit-directories / cdp-submit 复用。
 *
 * 用法:
 *   import { connectAdsPower, createBrandProfile, stopProfile } from './adspower-client.mjs';
 *   const { browser, page, profileId } = await connectAdsPower('arousen');
 *   // ... do work ...
 *   await stopProfile(profileId);
 *
 * 环境变量（从根目录 .env 加载）:
 *   ADS_API=http://127.0.0.1:50325
 *   ADS_KEY=xxx
 *   KOOKEEY_HOST=gateway
 *   KOOKEEY_PORT=1000
 *   KOOKEEY_USER=xxx
 *   KOOKEEY_PASS_BASE=xxx
 */

import http from 'http';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 加载根目录 .env
const REPO_ROOT = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(REPO_ROOT, '.env') });

const ADS_API = process.env.ADS_API || 'http://127.0.0.1:50325';
const ADS_KEY = process.env.ADS_KEY || '';

function adsRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, ADS_API);
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let chunks = '';
      res.on('data', c => { chunks += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch { reject(new Error(`AdsPower parse error: ${chunks.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('AdsPower timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

function buildProxyConfig() {
  const host = process.env.KOOKEEY_HOST;
  const port = process.env.KOOKEEY_PORT;
  const user = process.env.KOOKEEY_USER;
  const passBase = process.env.KOOKEEY_PASS_BASE;
  if (!host || !port) return null;
  // AdsPower proxy config format
  return {
    proxy_soft: 'other',
    proxy_type: 'socks5',
    proxy_host: host,
    proxy_port: port.toString(),
    proxy_user: user || '',
    proxy_password: passBase ? `${passBase}-${Math.random().toString(36).slice(2, 6)}` : '',
  };
}

/**
 * 列出所有 profiles
 */
export async function listProfiles() {
  const resp = await adsRequest('/api/v1/browser/list?page=1&pageSize=100');
  if (resp.code !== 0) throw new Error(`AdsPower list error: ${resp.msg}`);
  return resp.data?.list || [];
}

/**
 * 按 name 查找 profile
 */
export async function findProfile(name) {
  const profiles = await listProfiles();
  return profiles.find(p => p.name === name) || null;
}

/**
 * 创建品牌专属 profile
 */
export async function createBrandProfile(brandKey, opts = {}) {
  const proxy = opts.proxy !== false ? buildProxyConfig() : null;
  const body = {
    name: `lb-${brandKey}-${Date.now()}`,
    group_name: opts.group || 'link-building',
    // 基础指纹配置
    fingerprint: {
      ua: 'random',
      os: opts.os || 'win',
      // Core language based on brand targeting
      language: opts.language || ['en-US', 'en'],
      resolution: opts.resolution || '1920x1080',
      fonts: 'random',
    },
    // SOCKS5 proxy (Kookeey)
    ...(proxy || {}),
  };

  const resp = await adsRequest('/api/v1/user/create', 'POST', body);
  if (resp.code !== 0) throw new Error(`AdsPower create error: ${resp.msg}`);
  return resp.data?.id;
}

/**
 * 启动 profile，返回 CDP WS endpoint
 */
export async function startProfile(profileId) {
  const resp = await adsRequest(`/api/v1/browser/start?user_id=${profileId}`);
  if (resp.code !== 0) throw new Error(`AdsPower start error: ${resp.msg}`);
  return {
    wsEndpoint: resp.data?.ws?.puppeteer,
    debugPort: resp.data?.ws?.debug_port,
  };
}

/**
 * 停止 profile
 */
export async function stopProfile(profileId) {
  try {
    const resp = await adsRequest(`/api/v1/browser/stop?user_id=${profileId}`);
    return resp.code === 0;
  } catch (e) {
    console.warn(`  [AdsPower] stop failed: ${e.message}`);
    return false;
  }
}

/**
 * 一键连接：查找或创建 profile → 启动 → Puppeteer connect
 *
 * @param {string} brandKey - 品牌标识
 * @param {object} opts - { reuse: true, proxy: true, group, language }
 * @returns {Promise<{browser, page, profileId, via: 'adspower'|'raw_cdp'}>}
 */
export async function connectAdsPower(brandKey, opts = {}) {
  const reuse = opts.reuse !== false;

  // 1. 查找已有 profile
  let profileId = null;
  if (reuse) {
    const existing = await findProfile(`lb-${brandKey}`);
    if (existing) {
      profileId = existing.user_id || existing.id;
      console.log(`  [AdsPower] Reusing profile: ${profileId}`);
    }
  }

  // 2. 不存在则创建
  if (!profileId) {
    profileId = await createBrandProfile(brandKey, opts);
    console.log(`  [AdsPower] Created profile: ${profileId}`);
  }

  // 3. 启动
  const { wsEndpoint } = await startProfile(profileId);
  if (!wsEndpoint) throw new Error('AdsPower started but no WS endpoint returned');

  // 4. Puppeteer connect
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsEndpoint,
    defaultViewport: opts.viewport || null,
  });

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  return { browser, page, profileId, via: 'adspower' };
}

/**
 * Fallback: 直接连接裸 CDP（不经过 AdsPower）
 */
export async function connectRawCdp(port = 9222) {
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${port}`,
    defaultViewport: null,
  });
  return { browser, page: null, profileId: null, via: 'raw_cdp' };
}

/**
 * 智能连接：优先 AdsPower，失败则 fallback 裸 CDP
 */
export async function smartConnect(brandKey, opts = {}) {
  const cdpPort = opts.cdpPort || 9222;

  // AdsPower 不可用则跳过
  if (!ADS_KEY) {
    console.log(`  [AdsPower] No ADS_KEY, falling back to raw CDP :${cdpPort}`);
    const result = await connectRawCdp(cdpPort);
    const page = await result.browser.newPage();
    return { ...result, page };
  }

  try {
    const result = await connectAdsPower(brandKey, opts);
    console.log(`  [AdsPower] Connected via fingerprint profile`);
    return result;
  } catch (e) {
    console.warn(`  [AdsPower] Failed: ${e.message}, falling back to raw CDP`);
    const result = await connectRawCdp(cdpPort);
    const page = await result.browser.newPage();
    return { ...result, page };
  }
}

/**
 * 断开连接：AdsPower 断开需要 stop，裸 CDP 只 disconnect
 */
export async function disconnect(result) {
  if (!result) return;
  try {
    if (result.via === 'adspower' && result.browser) {
      await result.browser.disconnect();
      if (result.profileId) {
        // 不立即 stop profile — 保持 cookie/session 给下次复用
        console.log(`  [AdsPower] Disconnected (profile ${result.profileId} kept alive)`);
      }
    } else if (result.browser) {
      await result.browser.disconnect();
    }
  } catch (e) {
    console.warn(`  [AdsPower] Disconnect error: ${e.message}`);
  }
}

// CLI
if (process.argv[1]?.includes('adspower-client.mjs')) {
  const cmd = process.argv[2];
  if (cmd === 'list') {
    listProfiles().then(ps => {
      console.log(`Found ${ps.length} profiles:`);
      ps.forEach(p => console.log(`  ${p.user_id || p.id} | ${p.name} | ${p.group_name || ''}`));
    }).catch(e => console.error(e.message));
  } else if (cmd === 'create') {
    const brand = process.argv[3] || 'test';
    createBrandProfile(brand).then(id => console.log(`Created: ${id}`)).catch(e => console.error(e.message));
  } else if (cmd === 'stop') {
    const id = process.argv[3];
    if (!id) { console.log('Usage: node adspower-client.mjs stop <profileId>'); process.exit(1); }
    stopProfile(id).then(ok => console.log(ok ? 'Stopped' : 'Failed')).catch(e => console.error(e.message));
  } else {
    console.log('Usage: node adspower-client.mjs <list|create|stop> [args]');
  }
}
