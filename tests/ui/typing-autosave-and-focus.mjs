import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const courseId = 'course-1-neurodivergent-conditions-v2';
const guestId = 'typing-autosave-and-focus-20260806';
const preferenceKey = `type2learn-course-preferences-v1:guest-${guestId}:${courseId}`;
const choices = {
  'learning-language': 'english',
  colours: 'balanced',
  layout: 'balanced',
  encouragement: 'subtle',
  animations: 'still',
  'background-noise': 'off',
  'text-to-speech': 'on',
  mascot: 'off',
  'mascot-language': 'english',
  'mascot-voice': 'text',
  'mascot-voice-language': 'english'
};

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([{ name: 'type2learn_guest_id', value: guestId, url: baseUrl }]);
  const page = await context.newPage();
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: preferenceKey,
    value: { version: 1, courseId, complete: true, choices }
  });
  await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });
  await page.locator('[data-action="preview-complete"]').click();
  await page.locator('[data-action="read-complete"]').click();

  const input = page.locator('[data-typing-input]');
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.evaluate((node) => node.blur());
  await page.waitForFunction(() => {
    const curtain = document.querySelector('[data-typing-focus-curtain]');
    return Boolean(curtain && !curtain.hidden);
  });
  await page.locator('[data-typing-focus-curtain]').click();
  assert.equal(await input.evaluate((node) => document.activeElement === node), true, 'The focus curtain must return focus to the typing field.');

  const firstReference = await page.locator('#typing-reference').textContent();
  const firstText = String(firstReference || '').replace(/^Text to type:\s*/, '');
  await input.fill(firstText);
  await page.waitForFunction(() => document.querySelector('.course-input-label')?.textContent?.includes('Section 2 of 5'), null, { timeout: 3000 });
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), `type2learn-course-prototype-v1:guest-${guestId}:${courseId}`);
  assert.equal(saved.progress?.attempt?.guidedIndex, 1, 'An accurate completed section must auto-submit and persist the next section.');

  const secondInput = page.locator('[data-typing-input]');
  const secondReference = await page.locator('#typing-reference').textContent();
  const secondText = String(secondReference || '').replace(/^Text to type:\s*/, '');
  await secondInput.fill('x'.repeat(Array.from(secondText).length));
  await page.waitForTimeout(5300);
  const lowAccuracyAttempt = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}').progress?.attempt || {}, `type2learn-course-prototype-v1:guest-${guestId}:${courseId}`);
  assert.equal(Boolean(lowAccuracyAttempt.feedback), true, 'A low-accuracy completed response must be auto-checked after the short grace period.');
  assert.equal(await page.locator('[data-typing-input]').count() > 0, true, 'A low-accuracy auto-check must leave the typing task available for correction.');

  await context.close();
  process.stdout.write('checked typing focus curtain and automatic submission\n');
} finally {
  await browser.close();
}
