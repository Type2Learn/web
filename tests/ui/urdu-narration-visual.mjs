import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const courseId = 'course-1-neurodivergent-conditions-v2';
const screenshotDir = path.resolve('screenshots', 'urdu-narration');
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 }
];

const choices = {
  'learning-language': 'urdu',
  colours: 'balanced',
  layout: 'balanced',
  encouragement: 'subtle',
  animations: 'still',
  'background-noise': 'off',
  'text-to-speech': 'on',
  mascot: 'on',
  'mascot-language': 'urdu',
  'mascot-voice': 'text',
  'mascot-voice-language': 'urdu'
};

await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const guestId = `urdu-narration-${viewport.name}-20260806`;
    const preferenceKey = `type2learn-course-preferences-v1:guest-${guestId}:${courseId}`;
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    await context.addCookies([{ name: 'type2learn_guest_id', value: guestId, url: baseUrl }]);
    const page = await context.newPage();
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: preferenceKey,
      value: { version: 1, courseId, complete: true, choices }
    });
    await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });
    await page.locator('[data-action="preview-complete"]').click();
    await page.waitForFunction(() => document.querySelector('link[data-type2learn-narration-preload][href*="/01-adhd/urdu-pk/title-ava.mp3"]'), null, { timeout: 15000 });
    const inspection = await page.evaluate(() => {
      const control = document.querySelector('[data-task-narration-control]');
      const rect = control?.getBoundingClientRect();
      return {
        direction: document.documentElement.dir,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        hasAudioControl: Boolean(rect && rect.width > 0 && rect.height > 0),
        controlOnScreen: Boolean(rect && rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight),
        urduPreloaded: Boolean(document.querySelector('link[data-type2learn-narration-preload][href*="/01-adhd/urdu-pk/title-ava.mp3"]'))
      };
    });
    assert.equal(inspection.direction, 'rtl', `${viewport.name}: Urdu page must be right-to-left.`);
    assert.equal(inspection.overflow, false, `${viewport.name}: Urdu reading page must not overflow horizontally.`);
    assert.equal(inspection.hasAudioControl, true, `${viewport.name}: narration control must be visible.`);
    assert.equal(inspection.controlOnScreen, true, `${viewport.name}: narration control must stay on screen.`);
    assert.equal(inspection.urduPreloaded, true, `${viewport.name}: new Pakistani Urdu title audio must preload.`);
    await page.screenshot({ path: path.join(screenshotDir, `urdu-narration-${viewport.name}.png`), fullPage: false });
    await context.close();
  }
  process.stdout.write('captured Urdu narration desktop, tablet, and mobile screens\n');
} finally {
  await browser.close();
}
