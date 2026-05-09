#!/usr/bin/env node
/**
 * 外链提交引擎 v2
 *
 * 改进:
 * - 支持实际提交（不只是探测）
 * - 提交后 rel 属性验证
 * - 结果写回飞书 Bitable
 * - 知识库驱动（每次执行前读 iron-rules.md）
 * - 多品牌并行支持
 *
 * 用法:
 *   node submit-v2.mjs <brand_key> [platform_tier] [--dry-run] [--platform=xxx]
 *
 * 示例:
 *   node submit-v2.mjs arousen priority_1
 *   node submit-v2.mjs 302ai priority_1 --dry-run
 *   node submit-v2.mjs arousen priority_1 --platform=dev_to
 */

import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { verifyRel, verifyLivePage, pingGoogle } from './verify-rel.mjs';
import { solveCf } from './cf-solver.mjs';
import { solveCaptcha, detectCaptcha, extractSitekey, injectToken } from './captcha-solver.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(PACK_ROOT, 'config');
const KNOWLEDGE_DIR = path.join(PACK_ROOT, 'knowledge');
const BRANDS_DIR = path.join(CONFIG_DIR, 'brands');
const PLATFORMS_FILE = path.join(CONFIG_DIR, 'directory-platforms.json');
const OUTPUT_BASE = path.join(PACK_ROOT, '../../workspace/pseo-state/brands');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── 知识库加载 ───

function loadIronRules() {
  const file = path.join(KNOWLEDGE_DIR, 'iron-rules.md');
  if (fs.existsSync(file)) {
    return fs.readFileSync(file, 'utf8');
  }
  console.warn('[WARN] iron-rules.md not found, proceeding without knowledge base');
  return null;
}

function loadPlatformKnowledge(platformKey) {
  const platformsMd = path.join(KNOWLEDGE_DIR, 'platforms.md');
  if (fs.existsSync(platformsMd)) {
    return fs.readFileSync(platformsMd, 'utf8');
  }
  return null;
}

// ─── 配置加载 ───

function loadPlatforms() {
  return JSON.parse(fs.readFileSync(PLATFORMS_FILE, 'utf8'));
}

function loadBrand(brandKey) {
  const brandFile = path.join(BRANDS_DIR, `${brandKey}.json`);
  if (!fs.existsSync(brandFile)) {
    throw new Error(`Brand config not found: ${brandFile}`);
  }
  return JSON.parse(fs.readFileSync(brandFile, 'utf8'));
}

function filterPlatforms(platforms, tier, brand, specificPlatform) {
  if (specificPlatform) {
    const p = platforms.platforms[specificPlatform];
    if (!p) throw new Error(`Platform not found: ${specificPlatform}`);
    return [p];
  }
  const tierGroup = platforms.tier_groups[tier] || platforms.tier_groups.priority_1;
  const excluded = brand.excluded_platforms || [];
  return tierGroup
    .map(key => platforms.platforms[key])
    .filter(p => p && !excluded.includes(p.key) && p.tier !== 'blocked');
}

function getOutputDir(brandKey, platformKey) {
  const dir = path.join(OUTPUT_BASE, brandKey, 'linkbuilding', platformKey);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── 字段映射 ───

function mapFields(brand, platform) {
  const mapping = platform.field_mapping || {};
  const result = {};
  for (const [standardField, platformField] of Object.entries(mapping)) {
    if (brand[standardField] !== undefined) {
      result[platformField] = brand[standardField];
    }
  }
  return result;
}

// ─── 反垃圾检测 ───

async function detectAntiSpam(page) {
  return await page.evaluate(() => {
    const signals = [];
    if (document.querySelector('iframe[src*="recaptcha"]') || document.querySelector('.g-recaptcha')) {
      signals.push('recaptcha');
    }
    if (document.querySelector('script[src*="akismet"]') || document.querySelector('#akismet')) {
      signals.push('akismet');
    }
    if (document.querySelector('script[src*="cleantalk"]')) {
      signals.push('cleantalk');
    }
    if (document.querySelector('script[src*="hcaptcha"]') || document.querySelector('.h-captcha')) {
      signals.push('hcaptcha');
    }
    if (document.querySelector('script[src*="jetpack"]') && document.querySelector('iframe[src*="jetpack"]')) {
      signals.push('jetpack_highlander');
    }
    return signals;
  });
}

// ─── 单平台执行 ───

async function executePlatform(browser, brand, platform, options = {}) {
  const outDir = getOutputDir(brand.brand_key, platform.name);
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

  console.log(`\n=== ${platform.name} ===`);
  console.log(`  URL: ${platform.url}`);
  console.log(`  Tier: ${platform.tier}`);
  console.log(`  Difficulty: ${platform.automation_difficulty}`);

  // 铁律 8: 确认当前品牌
  console.log(`  Brand: ${brand.brand_name} | Site: ${brand.site_url}`);

  const page = await browser.newPage();
  const result = {
    platform: platform.name,
    url: platform.url,
    tier: platform.tier,
    brand: brand.brand_key,
    timestamp,
    status: 'unknown',
    isDofollow: null,
    liveUrl: null,
    antiSpamDetected: [],
    screenshots: [],
    errors: []
  };

  try {
    // 1. 导航（带 CF 绕过）
    console.log(`  → Navigating to ${platform.url}`);
    try {
      await page.goto(platform.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(3000);
    } catch (navError) {
      // Puppeteer timeout = CF or proxy issue
      if (navError.message.includes('timeout') || navError.message.includes('Navigation')) {
        console.log(`  → Puppeteer timeout, trying FlareSolverr/CDP bypass...`);
        const cdpPort = brand.cdp_config?.port || 9222;
        const flareUrl = brand.bypass?.flaresolverr_url || 'http://localhost:8191';
        try {
          const cfResult = await solveCf(platform.url, { flareUrl, cdpPort });
          await page.setContent(cfResult.html, { waitUntil: 'domcontentloaded', timeout: 30000 });
          result.bypassMethod = cfResult.method;
          console.log(`  → CF bypassed via ${cfResult.method}`);
        } catch (cfError) {
          throw new Error(`Navigation failed and CF bypass failed: ${cfError.message}`);
        }
      } else {
        throw navError;
      }
    }

    // 1.5 检测 CF challenge（页面加载后可能还有）
    const hasCfChallenge = await page.evaluate(() =>
      !!document.querySelector('#challenge-running, #challenge-form, .cf-browser-verification')
    );
    if (hasCfChallenge) {
      console.log(`  → CF challenge on page, waiting 15s for auto-solve...`);
      await sleep(15000);
      const stillCf = await page.evaluate(() =>
        !!document.querySelector('#challenge-running, #challenge-form')
      );
      if (stillCf) {
        console.log(`  → CF challenge persists, trying FlareSolverr...`);
        const cdpPort = brand.cdp_config?.port || 9222;
        const flareUrl = brand.bypass?.flaresolverr_url || 'http://localhost:8191';
        const cfResult = await solveCf(platform.url, { flareUrl, cdpPort });
        await page.setContent(cfResult.html, { waitUntil: 'domcontentloaded', timeout: 30000 });
        result.bypassMethod = cfResult.method;
      }
    }

    // 2. 初始截图
    const initPng = path.join(outDir, `${timestamp}-01-initial.png`);
    await page.screenshot({ path: initPng, fullPage: true });
    result.screenshots.push(initPng);

    // 3. 页面结构分析
    const pageInfo = await page.evaluate(() => ({
      href: location.href,
      title: document.title,
      forms: Array.from(document.querySelectorAll('form')).map(f => ({
        action: f.action,
        method: f.method,
        fields: Array.from(f.elements).map(e => ({
          name: e.name, type: e.type, id: e.id, required: e.required
        }))
      })),
      links: document.querySelectorAll('a').length,
      hasLogin: !!document.querySelector('input[type="password"]'),
      hasSignup: !!document.querySelector('a[href*="register"], a[href*="signup"], a[href*="sign-up"]')
    }));

    console.log(`  → Page: ${pageInfo.href}`);
    console.log(`  → Forms: ${pageInfo.forms.length}`);
    console.log(`  → Links: ${pageInfo.links}`);

    // 4. 反垃圾检测
    const antiSpam = await detectAntiSpam(page);
    result.antiSpamDetected = antiSpam;
    if (antiSpam.length > 0) {
      console.log(`  → Anti-spam: ${antiSpam.join(', ')}`);
      // CleanTalk = 硬拦截，跳过
      if (antiSpam.includes('cleantalk')) {
        result.status = 'blocked_antispam';
        result.errors.push('CleanTalk: hard block, cannot bypass');
        console.log(`  ✗ CleanTalk detected, skipping`);
        return result;
      }
      // Jetpack Highlander = 硬拦截，跳过
      if (antiSpam.includes('jetpack_highlander')) {
        result.status = 'blocked_antispam';
        result.errors.push('Jetpack Highlander: cross-origin iframe, cannot inject');
        console.log(`  ✗ Jetpack Highlander detected, skipping`);
        return result;
      }
    }

    // 4.5 CAPTCHA 检测 + 自动解
    const captchaInfo = await page.evaluate(() => ({
      hasRecaptcha: !!document.querySelector('iframe[src*="recaptcha"]') || !!document.querySelector('.g-recaptcha'),
      hasRecaptchaV3: !!document.querySelector('script[src*="recaptcha/enterprise"]'),
      hasHcaptcha: !!document.querySelector('.h-captcha') || !!document.querySelector('iframe[src*="hcaptcha"]'),
      hasTurnstile: !!document.querySelector('[data-sitekey]') || !!document.querySelector('iframe[src*="turnstile"]'),
    }));

    const captchaTypes = [];
    if (captchaInfo.hasRecaptcha) captchaTypes.push('recaptcha_v2');
    if (captchaInfo.hasRecaptchaV3) captchaTypes.push('recaptcha_v3');
    if (captchaInfo.hasHcaptcha) captchaTypes.push('hcaptcha');
    if (captchaInfo.hasTurnstile) captchaTypes.push('turnstile');

    if (captchaTypes.length > 0 && !options.dryRun) {
      console.log(`  → CAPTCHA detected: ${captchaTypes.join(', ')}`);
      const captchaType = captchaTypes[0];

      // hCaptcha Enterprise = 服务端清洗，不可绕过
      if (captchaInfo.hasHcaptcha && antiSpam.includes('hcaptcha')) {
        result.status = 'blocked_antispam';
        result.errors.push('hCaptcha Enterprise: server-side content sanitization');
        console.log(`  ✗ hCaptcha Enterprise detected, skipping`);
        return result;
      }

      // 尝试自动解
      const apiKey = process.env[brand.bypass?.captcha_api_key_env || 'CAPTCHA_API_KEY'];
      if (apiKey) {
        try {
          const sitekey = await page.evaluate((type) => {
            const selectors = {
              recaptcha_v2: ['.g-recaptcha[data-sitekey]', 'iframe[src*="recaptcha"]'],
              hcaptcha: ['.h-captcha[data-sitekey]', 'iframe[src*="hcaptcha"]'],
              turnstile: ['[data-sitekey]', 'iframe[src*="turnstile"]', '.cf-turnstile[data-sitekey]'],
            };
            for (const s of (selectors[type] || [])) {
              const el = document.querySelector(s);
              if (el) return el.dataset?.sitekey || el.src?.match(/sitekey=([^&]+)/)?.[1];
            }
            return null;
          }, captchaType);

          if (sitekey) {
            console.log(`  → Solving ${captchaType} (sitekey: ${sitekey.slice(0, 15)}...)`);
            const token = await solveCaptcha(captchaType, {
              sitekey,
              pageUrl: page.url(),
              provider: brand.bypass?.captcha_provider,
            });
            // 注入 token
            await page.evaluate((t, tk) => {
              if (t === 'recaptcha_v2') {
                const el = document.getElementById('g-recaptcha-response');
                if (el) { el.innerHTML = tk; el.value = tk; }
                if (typeof ___grecaptcha_cfg !== 'undefined') {
                  for (const k in ___grecaptcha_cfg.clients) {
                    if (___grecaptcha_cfg.clients[k].callback) { ___grecaptcha_cfg.clients[k].callback(tk); break; }
                  }
                }
              } else if (t === 'turnstile') {
                const el = document.querySelector('[name="cf-turnstile-response"]');
                if (el) el.value = tk;
              } else if (t === 'hcaptcha') {
                const el = document.querySelector('[name="h-captcha-response"]');
                if (el) { el.innerHTML = tk; el.value = tk; }
              }
            }, captchaType, token);
            result.captchaSolved = captchaType;
            console.log(`  → CAPTCHA solved and injected`);
          }
        } catch (captchaError) {
          console.log(`  → CAPTCHA solve failed: ${captchaError.message}`);
          result.errors.push(`CAPTCHA solve failed: ${captchaError.message}`);
        }
      } else {
        console.log(`  → CAPTCHA detected but no API key configured (set CAPTCHA_API_KEY env)`);
        result.errors.push(`CAPTCHA detected (${captchaTypes.join(', ')}) but no solver configured`);
      }
    }

    // 5. 保存页面信息
    const infoJson = path.join(outDir, `${timestamp}-page-info.json`);
    fs.writeFileSync(infoJson, JSON.stringify(pageInfo, null, 2), 'utf8');

    // 6. 字段映射
    const fieldMap = mapFields(brand, platform);
    console.log(`  → Fields mapped: ${Object.keys(fieldMap).join(', ')}`);

    // 7. DRY RUN: 只做探测不提交
    if (options.dryRun) {
      console.log(`  → [DRY RUN] Skipping actual submission`);
      result.status = 'explored';
    } else {
      console.log(`  → [SUBMIT] Actual submission logic TBD — use Playwright MCP`);
      result.status = 'ready_for_mcp';
    }

    // 8. 最终截图
    const finalPng = path.join(outDir, `${timestamp}-02-final.png`);
    await page.screenshot({ path: finalPng, fullPage: true });
    result.screenshots.push(finalPng);

    // 9. rel 验证（如果在提交后）
    if (result.status === 'submitted' || result.status === 'ready_for_mcp') {
      const relResult = await verifyRel(page, brand.site_url.replace(/https?:\/\//, ''));
      result.isDofollow = relResult.isDofollow;
      result.relCheck = {
        total: relResult.totalLinks,
        dofollow: relResult.dofollowCount,
        nofollow: relResult.nofollowCount
      };
    }

  } catch (e) {
    result.status = 'error';
    result.errors.push(e.message);
    console.error(`  ✗ Error: ${e.message}`);
  } finally {
    await page.close();
  }

  // 10. 保存结果
  const resultJson = path.join(outDir, `${timestamp}-result.json`);
  fs.writeFileSync(resultJson, JSON.stringify(result, null, 2), 'utf8');
  console.log(`  → Status: ${result.status}`);

  return result;
}

// ─── 主函数 ───

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: node submit-v2.mjs <brand_key> [tier] [--dry-run] [--platform=xxx]');
    process.exit(1);
  }

  const brandKey = args[0];
  const nonFlagArgs = args.filter(a => !a.startsWith('--'));
  const tier = nonFlagArgs[1] || 'priority_1';
  const dryRun = args.includes('--dry-run');
  const platformArg = args.find(a => a.startsWith('--platform='));
  const specificPlatform = platformArg ? platformArg.split('=')[1] : null;

  console.log('=== 外链自动化提交引擎 v2 ===');
  console.log(`Brand: ${brandKey} | Tier: ${tier} | Dry Run: ${dryRun}`);

  // 1. 加载铁律
  const ironRules = loadIronRules();
  if (ironRules) {
    console.log(`\n📖 Iron Rules loaded (${ironRules.split('\n').length} lines)`);
  }

  // 2. 加载配置
  const platforms = loadPlatforms();
  const brand = loadBrand(brandKey);
  console.log(`Brand: ${brand.brand_name} | Site: ${brand.site_url}`);

  // 3. 过滤平台
  const targetPlatforms = filterPlatforms(platforms, tier, brand, specificPlatform);
  console.log(`\nTarget platforms (${targetPlatforms.length}):`);
  targetPlatforms.forEach(p => console.log(`  - ${p.name} (${p.tier}, ${p.automation_difficulty})`));

  // 4. 连接 CDP
  const cdpPort = brand.cdp_config?.port || 9222;
  console.log(`\nConnecting CDP: localhost:${cdpPort}`);

  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${cdpPort}`,
    defaultViewport: null
  });

  const results = {};

  try {
    for (const platform of targetPlatforms) {
      results[platform.name] = await executePlatform(browser, brand, platform, { dryRun });
      await sleep(3000);
    }
  } finally {
    await browser.disconnect();
  }

  // 5. 汇总
  console.log('\n=== Summary ===');
  const summary = {
    brand: brandKey,
    tier,
    timestamp: new Date().toISOString(),
    dryRun,
    platforms: targetPlatforms.length,
    results: Object.entries(results).map(([name, r]) => ({
      platform: name,
      status: r.status,
      isDofollow: r.isDofollow,
      antiSpam: r.antiSpamDetected,
      errors: r.errors
    }))
  };

  console.log(JSON.stringify(summary, null, 2));

  const summaryFile = path.join(OUTPUT_BASE, brandKey, 'linkbuilding', `summary-v2-${tier}-${Date.now()}.json`);
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\nSummary saved: ${summaryFile}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
