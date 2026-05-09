/**
 * 5sim 短信接码模块
 *
 * 封装 5sim API：获取临时号码 → 等待验证码 → 返回。
 * 供 link-building-pack 目录提交注册验证使用。
 *
 * 用法:
 *   import { verify } from './sms-verifier.mjs';
 *   const code = await verify('google', 'us');
 *
 * 环境变量:
 *   FIVESIM_TOKEN=eyJ...
 */

import https from 'https';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') });

const API_BASE = 'https://5sim.net/v1';
const TOKEN = process.env.FIVESIM_TOKEN;

function apiRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_BASE);
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let chunks = '';
      res.on('data', c => { chunks += c; });
      res.on('end', () => {
        if (res.statusCode === 401) { reject(new Error('5sim: invalid token')); return; }
        if (res.statusCode === 429) { reject(new Error('5sim: rate limited')); return; }
        try { resolve(JSON.parse(chunks)); }
        catch { reject(new Error(`5sim parse error: ${chunks.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('5sim timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

/**
 * 获取可用号码
 * @param {string} service - 服务名（google, facebook, twitter 等）
 * @param {string} country - 国家代码（us, gb, cn 等，或 'any'）
 * @returns {Promise<{id: number, phone: string}>}
 */
export async function getNumber(service = 'google', country = 'any') {
  if (!TOKEN) throw new Error('FIVESIM_TOKEN not set');
  const resp = await apiRequest(
    'GET',
    `/user/buy/number/${country}/${service}/any`
  );
  if (resp.status === 'error') {
    throw new Error(`5sim getNumber: ${resp.message || 'no numbers available'}`);
  }
  console.log(`  [SMS] Got number: ${resp.phone} (order ${resp.id})`);
  return { id: resp.id, phone: resp.phone };
}

/**
 * 等待短信验证码
 * @param {number} orderId - 订单 ID
 * @param {number} timeout - 超时毫秒（默认 120s）
 * @returns {Promise<string|null>} 验证码文本
 */
export async function waitForSms(orderId, timeout = 120000) {
  const start = Date.now();
  const pollInterval = 5000;

  while (Date.now() - start < timeout) {
    const resp = await apiRequest('GET', `/user/check/${orderId}`);
    if (resp.status === 'RECEIVED' || resp.sms?.length > 0) {
      const code = resp.sms?.[0]?.code || resp.sms?.[0]?.text || null;
      if (code) {
        console.log(`  [SMS] Received: ${code}`);
        return code;
      }
    }
    if (resp.status === 'CANCELED' || resp.status === 'BANNED') {
      throw new Error(`5sim order ${resp.status}`);
    }
    await new Promise(r => setTimeout(r, pollInterval));
  }
  return null;
}

/**
 * 取消订单（如果没收到短信）
 */
export async function cancelOrder(orderId) {
  try {
    await apiRequest('GET', `/user/cancel/${orderId}`);
    console.log(`  [SMS] Order ${orderId} cancelled`);
  } catch (e) {
    console.warn(`  [SMS] Cancel failed: ${e.message}`);
  }
}

/**
 * 完整验证流程：取号 → 等短信 → 返回验证码
 *
 * @param {string} service - 服务名
 * @param {string} country - 国家代码
 * @param {number} timeout - 等待超时（毫秒）
 * @returns {Promise<{phone: string, code: string}>}
 */
export async function verify(service = 'google', country = 'any', timeout = 120000) {
  const { id, phone } = await getNumber(service, country);
  try {
    const code = await waitForSms(id, timeout);
    if (!code) throw new Error('SMS timeout — no code received');
    return { phone, code };
  } catch (e) {
    await cancelOrder(id);
    throw e;
  }
}

/**
 * 查询余额
 */
export async function getBalance() {
  if (!TOKEN) throw new Error('FIVESIM_TOKEN not set');
  const resp = await apiRequest('GET', '/user/profile');
  return resp.balance;
}

// CLI
if (process.argv[1]?.includes('sms-verifier.mjs')) {
  const cmd = process.argv[2];
  if (cmd === 'balance') {
    getBalance().then(b => console.log(`5sim balance: $${b}`)).catch(e => console.error(e.message));
  } else if (cmd === 'verify') {
    const service = process.argv[3] || 'google';
    const country = process.argv[4] || 'us';
    verify(service, country)
      .then(r => console.log(`Phone: ${r.phone} | Code: ${r.code}`))
      .catch(e => console.error(e.message));
  } else {
    console.log('Usage: node sms-verifier.mjs <balance|verify> [service] [country]');
  }
}
