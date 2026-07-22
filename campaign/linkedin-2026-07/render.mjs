import { chromium } from '../../../newwebsite/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const campaignRoot = path.resolve(import.meta.dirname);
const outputRoot = path.join(campaignRoot, 'posts');
const chromiumPath = '/nix/store/cyw9j7gm65p1768q6vhaax20jlkvpb27-chromium-149.0.7827.114/bin/chromium';
const baseUrl = process.env.TYPE2LEARN_CAMPAIGN_URL || 'http://127.0.0.1:8013/campaign/linkedin-2026-07/';

fs.mkdirSync(outputRoot, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: chromiumPath,
  args: ['--no-sandbox']
});

const page = await browser.newPage({ viewport: { width: 1400, height: 1600 }, deviceScaleFactor: 1 });
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

const posts = await page.locator('.post').all();
for (let index = 0; index < posts.length; index += 1) {
  const post = posts[index];
  const slug = await post.getAttribute('data-slug');
  const prefix = String(index + 1).padStart(2, '0');
  await post.screenshot({
    path: path.join(outputRoot, `${prefix}-${slug}.jpg`),
    type: 'jpeg',
    quality: 96
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
await page.screenshot({
  path: path.join(campaignRoot, 'campaign-contact-sheet.jpg'),
  type: 'jpeg',
  quality: 94,
  fullPage: true
});

await browser.close();
console.log(`Exported ${posts.length} posts to ${outputRoot}`);
