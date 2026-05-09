#!/usr/bin/env node
/**
 * 通用目录提交引擎
 * 基于品牌配置 + 平台配置 → CDP 自动填表提交 → 截图存证
 *
 * ��法:
 *   node submit-directories.mjs <brand_key> [platform_tier]
 *
 * 示例:
 *   node submit-directories.mjs arousen priority_1
 *   node submit-directories.mjs 302ai priority_1
 */

import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_ROOT = path.resolve(__dirname, '../..');
const CONFIG_DIR = path.join(PACK_ROOT, 'config');
const BRANDS_DIR = path.join(CONFIG_DIR, 'brands');
const PLATFORMS_FILE = path.join(CONFIG_DIR, 'directory-platforms.json');
const OUTPUT_BASE = path.join(PACK_ROOT, '../../workspace/pseo-state/brands');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 加载平台配置
function loadPlatforms() {
  const data = fs.readFileSync(PLATFORMS_FILE, 'utf8');
  return JSON.parse(data);
}

// 加载品牌配置
function loadBrand(brandKey) {
  const brandFile = path.join(BRANDS_DIR, `${brandKey}.json`);
  if (!fs.existsSync(brandFile)) {
    throw new Error(`品牌配置不存在: ${brandFile}`);
  }
  return JSON.parse(fs.readFileSync(brandFile, 'utf8'));
}

// 过滤平台列表
function filterPlatforms(platforms, tier, brand) {
  const tierGroup = platforms.tier_groups[tier] || platforms.tier_groups.priority_1;
  const excluded = brand.excluded_platforms || [];

  return tierGroup
    .map(key => platforms.platforms[key])
    .filter(p => p && !excluded.includes(p.key) && p.tier !== 'blocked');
}

// 获取平台输出目录
function getOutputDir(brandKey, platformKey) {
  const dir = path.join(OUTPUT_BASE, brandKey, 'linkbuilding', platformKey);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// 品牌字段 → 平台字段映射
function mapFields(brand, platform) {
  const mapping = platform.field_mapping || {};
  const result = {};

  for (const [standardField, platformField] of Object.entries(mapping)) {
    // 直接从品牌配置取值
    if (brand[standardField] !== undefined) {
      result[platformField] = brand[standardField];
      continue;
    }

    // 嵌套对象处理
    if (standardField === 'article_content') {
      result[platformField] = generateArticleContent(brand, platform);
    } else if (standardField === 'article_title') {
      result[platformField] = generateArticleTitle(brand, platform);
    } else if (standardField === 'logo_url') {
      result[platformField] = brand.logo_url || null;
    }
  }

  return result;
}

// 生成教育型文章标题
function generateArticleTitle(brand, platform) {
  const templates = [
    `Why ${brand.brand_name} Focuses on Body-Safe Design`,
    `A Wellness-First Approach to Modern ${brand.category_safe || 'Care'}`,
    `What to Look for in Quality ${brand.keywords_tags?.[0] || 'Wellness Products'}`,
    `The Importance of Education in ${brand.keywords_tags?.[0] || 'Self-Care'}`
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

// 生成教育型文章内容
function generateArticleContent(brand, platform) {
  const safeKeywords = brand.adult_policy?.safe_keywords || ['wellness', 'self-care'];
  const keyword1 = safeKeywords[0];
  const keyword2 = safeKeywords[1] || 'quality';

  return `
# ${brand.brand_name}: A ${keyword1}-First Approach

When it comes to ${brand.keywords_tags?.[0] || 'modern wellness'}, the conversation shouldn't just be about products—it should be about education, confidence, and making informed choices.

## What ${keyword1} Actually Means

${keyword1.charAt(0).toUpperCase() + keyword1.slice(1)} isn't just a buzzword. It means:

- **Transparency** about materials and design
- **Education** that empowers rather than overwhelms
- **Quality** that you can trust

## Why ${keyword2} Matters

The market is flooded with options, but not all are created equal. Taking time to understand what goes into your ${brand.keywords_tags?.[0] || 'wellness choices'} matters for your confidence and peace of mind.

At [${brand.brand_name}](${brand.site_url}), we believe that ${keyword1} and ${keyword2} should go hand in hand.

## Making Informed Choices

Here's what to look for:

1. Clear information about materials and design
2. Educational resources that answer your questions
3. A brand that prioritizes your comfort and confidence

---

*This article is for educational purposes only. Learn more at [${brand.brand_name}](${brand.site_url}).*
  `.trim();
}

// 单平台执行
async function executePlatform(browser, brand, platform) {
  const outDir = getOutputDir(brand.brand_key, platform.name);
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

  console.log(`\n=== ${platform.name} ===`);
  console.log(`  URL: ${platform.url}`);
  console.log(`  Tier: ${platform.tier}`);
  console.log(`  Difficulty: ${platform.automation_difficulty}`);

  const page = await browser.newPage();
  const result = {
    platform: platform.name,
    url: platform.url,
    timestamp,
    status: 'unknown',
    live_url: null,
    screenshots: [],
    errors: []
  };

  try {
    // 导航到平台
    console.log(`  → 导航到 ${platform.url}`);
    await page.goto(platform.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);

    // 截图：初始状态
    const initPng = path.join(outDir, `${timestamp}-01-initial.png`);
    await page.screenshot({ path: initPng, fullPage: true });
    result.screenshots.push(initPng);

    // 提取页面信息
    const pageInfo = await page.evaluate(() => ({
      href: location.href,
      title: document.title,
      forms: Array.from(document.querySelectorAll('form')).map(f => ({
        action: f.action,
        method: f.method,
        fields: Array.from(f.elements).map(e => ({
          name: e.name,
          type: e.type,
          id: e.id
        }))
      }))
    }));

    console.log(`  → 当前页面: ${pageInfo.href}`);
    console.log(`  → 表单数量: ${pageInfo.forms.length}`);

    // 保存页面信息
    const infoJson = path.join(outDir, `${timestamp}-page-info.json`);
    fs.writeFileSync(infoJson, JSON.stringify(pageInfo, null, 2), 'utf8');

    // 获取字段映射
    const fieldMap = mapFields(brand, platform);
    console.log(`  → 字段映射:`, Object.keys(fieldMap));

    // 检测障碍
    const blockers = platform.blockers || [];
    for (const blocker of blockers) {
      if (blocker === 'captcha' && await detectCaptcha(page)) {
        result.status = 'blocked';
        result.errors.push('需要人工处理验证码');
        console.log(`  ✗ 检测到验证码，跳过`);
        break;
      }
      if (blocker === 'account_eligibility' && !pageInfo.href.includes('add')) {
        result.status = 'blocked';
        result.errors.push('账号资格不足');
        console.log(`  ✗ 账号资格不足`);
        break;
      }
    }

    // 尝试填表（简化版，实际需要针对每个平台定制选择器）
    if (result.status !== 'blocked' && pageInfo.forms.length > 0) {
      console.log(`  → 检测到表单，尝试填写...`);
      // TODO: 这里需要针对每个平台写特定的选择器逻辑
      // 当前版本只做探测和截图，不实际提交
    }

    // 最终截图
    const finalPng = path.join(outDir, `${timestamp}-02-final.png`);
    await page.screenshot({ path: finalPng, fullPage: true });
    result.screenshots.push(finalPng);

    if (result.status !== 'blocked') {
      result.status = 'explored';
    }

  } catch (e) {
    result.status = 'error';
    result.errors.push(e.message);
    console.error(`  ✗ 错误: ${e.message}`);
  } finally {
    await page.close();
  }

  // 保存结果
  const resultJson = path.join(outDir, `${timestamp}-result.json`);
  fs.writeFileSync(resultJson, JSON.stringify(result, null, 2), 'utf8');

  console.log(`  → 状态: ${result.status}`);
  return result;
}

// 检测验证码
async function detectCaptcha(page) {
  try {
    // 检测常见的验证码元素
    const captchaSelectors = [
      'iframe[src*="recaptcha"]',
      'div[class*="captcha"]',
      'div[id*="captcha"]',
      '.g-recaptcha'
    ];
    for (const selector of captchaSelectors) {
      const element = await page.$(selector);
      if (element) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('用法: node submit-directories.mjs <brand_key> [tier]');
    console.log('示例: node submit-directories.mjs arousen priority_1');
    process.exit(1);
  }

  const brandKey = args[0];
  const tier = args[1] || 'priority_1';

  console.log('=== 外链自动化目录提交引擎 ===');
  console.log(`品牌: ${brandKey}`);
  console.log(`梯队: ${tier}`);

  // 加载配置
  const platforms = loadPlatforms();
  const brand = loadBrand(brandKey);

  console.log(`\n品牌信息:`);
  console.log(`  名称: ${brand.brand_name}`);
  console.log(`  站点: ${brand.site_url}`);
  console.log(`  邮箱: ${brand.primary_email}`);

  // 过滤平台
  const targetPlatforms = filterPlatforms(platforms, tier, brand);
  console.log(`\n目标平台 (${targetPlatforms.length} 个):`);
  targetPlatforms.forEach(p => console.log(`  - ${p.name} (${p.tier}, ${p.automation_difficulty})`));

  // 连接 CDP
  const cdpPort = brand.cdp_config?.port || 9222;
  console.log(`\n连接 CDP: localhost:${cdpPort}`);

  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${cdpPort}`,
    defaultViewport: null
  });

  const results = {};

  try {
    for (const platform of targetPlatforms) {
      results[platform.name] = await executePlatform(browser, brand, platform);
      await sleep(3000); // 平台间隔
    }
  } finally {
    await browser.disconnect();
  }

  // 汇总报告
  console.log('\n=== 执行汇总 ===');
  const summary = {
    brand: brandKey,
    tier,
    timestamp: new Date().toISOString(),
    platforms: targetPlatforms.length,
    results: Object.entries(results).map(([name, r]) => ({
      platform: name,
      status: r.status,
      screenshots: r.screenshots.length,
      errors: r.errors
    }))
  };

  console.log(JSON.stringify(summary, null, 2));

  // 保存汇总
  const summaryFile = path.join(OUTPUT_BASE, brandKey, 'linkbuilding', `summary-${tier}-${Date.now()}.json`);
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\n汇总已保存: ${summaryFile}`);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
