/**
 * Rel Verification Module
 * 提交后验证链接的 rel 属性（Dofollow vs Nofollow）
 *
 * 用法:
 *   import { verifyRel } from './verify-rel.mjs';
 *   const result = await verifyRel(page, 'yourdomain.com');
 */

/**
 * 验证页面上指向目标域名的所有链接的 rel 属性
 * @param {import('puppeteer').Page} page - Puppeteer/Playwright page 对象
 * @param {string} domain - 目标域名（不含协议）
 * @returns {Promise<{isDofollow: boolean, links: Array, summary: string}>}
 */
export async function verifyRel(page, domain) {
  const links = await page.evaluate((targetDomain) => {
    const anchors = document.querySelectorAll(`a[href*="${targetDomain}"]`);
    return Array.from(anchors).map(a => ({
      href: a.href,
      rel: a.rel || 'EMPTY',
      text: a.textContent.slice(0, 50),
      isDofollow: !a.rel || a.rel === '' || (!a.rel.includes('nofollow') && !a.rel.includes('sponsored') && !a.rel.includes('ugc'))
    }));
  }, domain);

  const dofollowLinks = links.filter(l => l.isDofollow);
  const nofollowLinks = links.filter(l => !l.isDofollow);

  const result = {
    isDofollow: dofollowLinks.length > 0,
    totalLinks: links.length,
    dofollowCount: dofollowLinks.length,
    nofollowCount: nofollowLinks.length,
    links,
    summary: `Found ${links.length} link(s): ${dofollowLinks.length} dofollow, ${nofollowLinks.length} nofollow`
  };

  console.log(`  [REL CHECK] ${result.summary}`);
  links.forEach(l => {
    console.log(`    ${l.isDofollow ? '✓ DOFOLLOW' : '✗ NOFOLLOW'} | rel="${l.rel}" | ${l.href.slice(0, 80)}`);
  });

  return result;
}

/**
 * 验证特定 URL 页面上的链接（用于检查已提交的 live 页面）
 * @param {import('puppeteer').Browser} browser - Browser 实例
 * @param {string} liveUrl - 要检查的 live 页面 URL
 * @param {string} domain - 目标域名
 * @returns {Promise<object>}
 */
export async function verifyLivePage(browser, liveUrl, domain) {
  const page = await browser.newPage();
  try {
    await page.goto(liveUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    const result = await verifyRel(page, domain);
    result.liveUrl = liveUrl;
    result.verified = true;
    return result;
  } catch (e) {
    console.error(`  [REL CHECK] Failed to verify ${liveUrl}: ${e.message}`);
    return {
      liveUrl,
      verified: false,
      error: e.message,
      isDofollow: null,
      totalLinks: 0,
      links: []
    };
  } finally {
    await page.close();
  }
}

/**
 * Ping Google 通知新页面
 * @param {string} pageUrl - 新创建的页面 URL
 */
export async function pingGoogle(pageUrl) {
  try {
    const https = await import('https');
    const url = `https://www.google.com/ping?sitemap=${encodeURIComponent(pageUrl)}`;
    await new Promise((resolve, reject) => {
      https.get(url, res => {
        console.log(`  [PING] Google ping: ${res.statusCode}`);
        resolve();
      }).on('error', reject);
    });
  } catch (e) {
    console.log(`  [PING] Google ping failed: ${e.message}`);
  }
}
