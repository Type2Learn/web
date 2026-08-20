/**
 * Manual end-to-end evidence for explicit offline download and guest learning.
 * It downloads the public course package, disables networking, and confirms
 * that the cached guest course still renders. It never tests or caches AI,
 * private teacher content, account tokens, or assessment answers.
 */
import { chromium } from 'playwright';

const baseUrl = process.env.TYPE2LEARN_BASE_URL || 'http://127.0.0.1:4176';
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  const downloaded = await page.evaluate(async () => {
    const offline = await import('/offline-client.js');
    await offline.registerOffline();
    return offline.downloadLearningForOffline();
  });
  if (!downloaded.ok || downloaded.failures?.length) throw new Error(`Offline download was incomplete: ${JSON.stringify(downloaded)}`);

  const guestReady = await page.evaluate(async () => (await import('/guest-session.js')).createType2LearnGuest());
  if (!guestReady) throw new Error('A local guest session could not be created.');

  await page.goto(`${baseUrl}/course/`, { waitUntil: 'networkidle' });
  await context.setOffline(true);
  await page.goto(`${baseUrl}/course/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('#course-app', { timeout: 8000 });
  const content = await page.locator('body').innerText();
  if (!/One small step at a time|Choose one course|learning/i.test(content)) throw new Error('The cached course did not render while offline.');
  console.log(JSON.stringify({ ok: true, cachedAssets: downloaded.completed, currentUrl: page.url() }, null, 2));
} finally {
  await browser.close();
}
