import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const courseId = 'course-1-neurodivergent-conditions-v2';
const screenshotDirectory = path.resolve('screenshots', 'website-schemes');
const screens = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 }
];
const views = screens.flatMap((screen) => ['balanced', 'playful', 'calm'].map((scheme) => ({
  ...screen,
  scheme,
  name: `${screen.name}-${scheme}`
})));

const savedChoices = (scheme) => ({
  'website-scheme': scheme,
  'urdu-mode': 'off',
  colours: 'balanced',
  layout: 'balanced',
  encouragement: 'expressive',
  animations: 'gentle',
  'background-noise': 'off',
  'text-to-speech': 'off',
  mascot: 'on',
  'mascot-language': 'english',
  'mascot-voice': 'text',
  'mascot-voice-language': 'english'
});

await mkdir(screenshotDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const view of views) {
    const guestId = `website-scheme-${view.name}-20260807`;
    const preferenceKey = `type2learn-course-preferences-v1:guest-${guestId}:${courseId}`;
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height } });
    await context.addCookies([{ name: 'type2learn_guest_id', value: guestId, url: baseUrl }]);

    const setup = await context.newPage();
    await setup.addInitScript(({ scheme }) => localStorage.setItem('type2learn-website-scheme', scheme), { scheme: view.scheme });
    await setup.goto(`${baseUrl}/afterlogin/?course=${courseId}`, { waitUntil: 'networkidle' });
    await setup.locator('[data-preference="website-scheme"]').first().waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await setup.locator('[data-preference="website-scheme"]').count(), 3, `${view.name}: setup must offer all three website schemes.`);
    assert.equal(await setup.locator('[data-preference="learning-language"]').count(), 0, `${view.name}: legacy language picker must not be shown.`);
    await setup.locator(`[data-preference="website-scheme"][data-value="${view.scheme}"]`).click();
    await setup.waitForFunction((scheme) => document.documentElement.dataset.websiteScheme === scheme, view.scheme);
    assert.equal(await setup.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${view.name}: scheme setup must not overflow.`);
    await setup.screenshot({ path: path.join(screenshotDirectory, `${view.name}-scheme-setup.png`), fullPage: false });
    await setup.locator('[data-advance-setup="scheme"]').click();
    await setup.locator('[data-preference="urdu-mode"]').first().waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await setup.locator('[data-preference="urdu-mode"]').count() >= 2, true, `${view.name}: Urdu mode must be offered in the normal preferences.`);
    await setup.screenshot({ path: path.join(screenshotDirectory, `${view.name}-preferences.png`), fullPage: false });
    await setup.close();

    const course = await context.newPage();
    await course.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: preferenceKey,
      value: { version: 2, courseId, complete: true, choices: savedChoices(view.scheme) }
    });
    await course.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });
    await course.locator('[data-action="preview-complete"]').waitFor({ state: 'visible', timeout: 15000 });
    await course.locator('[data-action="preview-complete"]').click();
    await course.waitForFunction((scheme) => document.documentElement.dataset.websiteScheme === scheme, view.scheme);
    assert.equal(await course.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${view.name}: course shell must not overflow.`);
    await course.locator('.course-support-popup').waitFor({ state: 'visible', timeout: 15000 });
    await course.screenshot({ path: path.join(screenshotDirectory, `${view.name}-course-encouragement.png`), fullPage: false });
    // Capture the settled course separately from the timed encouragement
    // overlay. It verifies both states without judging the entry frame as the
    // normal page design.
    await course.waitForTimeout(5500);
    await course.screenshot({ path: path.join(screenshotDirectory, `${view.name}-course.png`), fullPage: false });
    await course.locator('[data-action="toggle-settings-menu"]').click();
    await course.locator('[data-settings-choice="website-scheme"]').first().waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await course.locator('[data-settings-choice="website-scheme"]').count(), 3, `${view.name}: website scheme must stay editable from settings.`);
    await course.waitForTimeout(650);
    await course.screenshot({ path: path.join(screenshotDirectory, `${view.name}-course-settings.png`), fullPage: false });
    await context.close();
    process.stdout.write(`checked website scheme on ${view.name}\n`);
  }
} finally {
  await browser.close();
}
