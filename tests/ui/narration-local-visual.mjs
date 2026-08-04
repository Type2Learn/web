import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const courseId = 'course-1-neurodivergent-conditions-v2';
const guestId = 'narration-local-visual';
const preferenceKey = `type2learn-course-preferences-v1:guest-${guestId}:${courseId}`;
const preferences = {
  version: 1,
  courseId,
  complete: true,
  choices: {
    'learning-language': 'english',
    colours: 'balanced',
    layout: 'balanced',
    encouragement: 'subtle',
    animations: 'still',
    'background-noise': 'off',
    'text-to-speech': 'on',
    mascot: 'on',
    'mascot-language': 'english',
    'mascot-voice': 'text',
    'mascot-voice-language': 'english'
  }
};

await mkdir(path.resolve('screenshots', 'narration'), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  await context.addCookies([{ name: 'type2learn_guest_id', value: guestId, url: baseUrl }]);
  const page = await context.newPage();
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: preferenceKey, value: preferences });
  await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });
  await page.locator('[data-task-narration-control]').waitFor({ state: 'visible', timeout: 15000 });
  const inspection = await page.evaluate(() => {
    const play = document.querySelector('[data-task-narration-control]');
    const callAi = document.querySelector('[data-action="call-ai"]');
    const playRect = play?.getBoundingClientRect();
    const aiRect = callAi?.getBoundingClientRect();
    return {
      text: play?.textContent?.trim() || '',
      hasPlayControl: Boolean(playRect && playRect.width && playRect.height),
      beforeCallAi: Boolean(playRect && aiRect && playRect.left < aiRect.left),
      overflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });
  assert.equal(inspection.hasPlayControl, true, 'Text-to-speech enabled in course setup must show a play control.');
  assert.equal(inspection.beforeCallAi, true, 'The play control must be positioned before Call AI.');
  assert.equal(inspection.overflow, false, 'Narration controls must not create horizontal overflow.');
  await page.screenshot({ path: path.resolve('screenshots', 'narration', 'local-text-to-speech-enabled.png'), fullPage: false });
  process.stdout.write(`checked narration control: ${inspection.text}\n`);
  await context.close();
} finally {
  await browser.close();
}
