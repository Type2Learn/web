import { chromium } from '../../../newwebsite/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const campaignRoot = path.resolve(import.meta.dirname);
const outputRoot = path.join(campaignRoot, 'posts');
const chromiumPath = '/nix/store/cyw9j7gm65p1768q6vhaax20jlkvpb27-chromium-149.0.7827.114/bin/chromium';
const baseUrl = process.env.TYPE2LEARN_CAMPAIGN_URL || 'http://127.0.0.1:8013/campaign/linkedin-2026-07/';

fs.mkdirSync(outputRoot, { recursive: true });

async function waitForImages(page) {
  await page.evaluate(async () => {
    await Promise.all([...document.images].map(async (image) => {
      if (!image.complete) {
        await new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
      }
      if (typeof image.decode === 'function') {
        await image.decode().catch(() => {});
      }
    }));
  });
}

const browser = await chromium.launch({
  headless: true,
  executablePath: chromiumPath,
  args: ['--no-sandbox']
});

const page = await browser.newPage({ viewport: { width: 1400, height: 1600 }, deviceScaleFactor: 2 });
const failedRequests = [];
const browserErrors = [];
page.on('requestfailed', (request) => failedRequests.push(`${request.url()} · ${request.failure()?.errorText || 'failed'}`));
page.on('pageerror', (error) => browserErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') browserErrors.push(message.text());
});
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await waitForImages(page);

const sourceQa = await page.evaluate(() => {
  const articles = [...document.querySelectorAll('.post')];
  const mascotImages = [...document.querySelectorAll('.footer-mascot img')];
  return {
    posts: articles.length,
    logos: document.querySelectorAll('.brand-lockup img').length,
    mascots: mascotImages.length,
    mascotSources: new Set(mascotImages.map((image) => image.currentSrc)).size,
    lowResolutionMascots: mascotImages
      .filter((image) => image.naturalWidth < 1024 || image.naturalHeight < 1448)
      .map((image) => ({ source: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight })),
    invitations: [...document.querySelectorAll('.footer-email')]
      .filter((node) => node.textContent.trim() === 'contact@type2learn.tech').length,
    useCases: document.querySelectorAll('.use-case').length,
    featuredSessions: document.querySelector('.featured-reach')?.textContent.includes('1,959') ?? false,
    overflow: articles
      .filter((article) => article.scrollWidth > article.clientWidth || article.scrollHeight > article.clientHeight)
      .map((article) => article.dataset.slug),
    failedImages: [...document.images].filter((image) => !image.naturalWidth).map((image) => image.src)
  };
});

if (
  sourceQa.posts !== 16
  || sourceQa.logos !== 16
  || sourceQa.mascots !== 16
  || sourceQa.mascotSources !== 16
  || sourceQa.lowResolutionMascots.length
  || sourceQa.invitations !== 16
  || sourceQa.useCases !== 16
  || !sourceQa.featuredSessions
  || sourceQa.overflow.length
  || sourceQa.failedImages.length
  || failedRequests.length
  || browserErrors.length
) {
  throw new Error(`Campaign source QA failed: ${JSON.stringify({ ...sourceQa, failedRequests, browserErrors })}`);
}

const posts = await page.locator('.post').all();
for (let index = 0; index < posts.length; index += 1) {
  const post = posts[index];
  const slug = await post.getAttribute('data-slug');
  const prefix = String(index + 1).padStart(2, '0');
  await post.screenshot({
    path: path.join(outputRoot, `${prefix}-${slug}.jpg`),
    type: 'jpeg',
    quality: 100,
    scale: 'device'
  });
}

const exportedFiles = fs.readdirSync(outputRoot).filter((file) => file.endsWith('.jpg')).sort();
await page.setViewportSize({ width: 1280, height: 1640 });
await page.setContent(`<!doctype html><style>
  body{margin:0;padding:24px;background:#0a1630;color:#fff;font:14px Manrope,Arial,sans-serif}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
  .card{min-width:0}.card img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;background:#fff;border-radius:8px}
  .card p{margin:7px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style><div class="grid">${exportedFiles.map((file) => `
  <div class="card"><img src="${baseUrl}posts/${file}" alt=""><p>${file}</p></div>`).join('')}
</div>`, { waitUntil: 'networkidle' });
await waitForImages(page);

const exportQa = await page.locator('.card img').evaluateAll((images) => images.map((image) => ({
  source: image.currentSrc,
  width: image.naturalWidth,
  height: image.naturalHeight
})));
const invalidExports = exportQa.filter((image) => image.width !== 2400 || image.height !== 3000);
if (exportQa.length !== 16 || invalidExports.length) {
  throw new Error(`Campaign export QA failed: ${JSON.stringify({ count: exportQa.length, invalidExports })}`);
}

await page.screenshot({
  path: path.join(campaignRoot, 'campaign-contact-sheet.jpg'),
  type: 'jpeg',
  quality: 94,
  fullPage: true
});

await browser.close();
console.log(`Exported ${posts.length} posts at 2400 × 3000 to ${outputRoot}`);
console.log('QA passed: 16 logos, 16 distinct high-resolution mascot poses, 16 invitations, 16 neuroinclusive use cases, no overflow or browser errors, all exports 2400 × 3000');
