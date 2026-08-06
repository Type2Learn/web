import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const courseId = 'course-1-neurodivergent-conditions-v2';
const screenshotDirectory = path.resolve('screenshots', 'guest-access-and-skip');

const choices = (layout) => ({
  'learning-language': 'english',
  colours: 'balanced',
  layout,
  encouragement: 'subtle',
  animations: 'still',
  'background-noise': 'off',
  'text-to-speech': 'on',
  mascot: 'off',
  'mascot-language': 'english',
  'mascot-voice': 'text',
  'mascot-voice-language': 'english'
});

await mkdir(screenshotDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const view of [
    { name: 'desktop-open', width: 1366, height: 820, layout: 'open' },
    { name: 'tablet-balanced', width: 768, height: 1024, layout: 'balanced' },
    { name: 'mobile-open', width: 390, height: 844, layout: 'open' }
  ]) {
    const guestId = `guest-access-${view.name}`;
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height } });
    await context.addCookies([{ name: 'type2learn_guest_id', value: guestId, url: baseUrl }]);
    const page = await context.newPage();
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: `type2learn-course-preferences-v1:guest-${guestId}:${courseId}`,
      value: { version: 1, courseId, complete: true, choices: choices(view.layout) }
    });
    await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });
    const callAi = page.locator('[data-action="call-ai"]');
    await callAi.waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await callAi.isDisabled(), true, `${view.name}: Call AI must be disabled for a guest`);
    assert.equal(await page.locator('[data-course-ai-chat]').count(), 0, `${view.name}: a guest must not open the chat`);
    const tooltip = await page.locator('.course-ai-login-gate').evaluate((node) => getComputedStyle(node, '::after').content);
    assert.match(tooltip, /Log in required/, `${view.name}: guest AI control needs a login explanation`);
    assert.equal(await page.locator('[data-action="start-voice-input"]').count(), 0, `${view.name}: guest typing voice input must not be exposed`);
    assert.equal(await page.locator('[data-action="skip-course"]').count(), 1, `${view.name}: open and balanced layouts need Skip course for now`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${view.name}: must not create horizontal overflow`);
    await page.screenshot({ path: path.join(screenshotDirectory, `${view.name}-before-skip.png`), fullPage: false });
    await page.locator('[data-action="skip-course"]').click();
    await page.waitForFunction(() => document.querySelector('.course-dashboard') && !document.querySelector('[data-action="skip-course"]'));
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), `type2learn-course-prototype-v1:guest-${guestId}:${courseId}`);
    assert.equal(saved.coursePaused, true, `${view.name}: skipping must preserve a paused resume snapshot`);
    await page.screenshot({ path: path.join(screenshotDirectory, `${view.name}-after-skip.png`), fullPage: false });
    await context.close();
    process.stdout.write(`checked ${view.name}\n`);
  }
} finally {
  await browser.close();
}
