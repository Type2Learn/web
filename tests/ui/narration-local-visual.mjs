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
  await page.addInitScript(() => {
    window.__type2learnSpeechSynthesisCalls = 0;
    const originalSpeak = window.speechSynthesis?.speak?.bind(window.speechSynthesis);
    if (originalSpeak) window.speechSynthesis.speak = (...args) => {
      window.__type2learnSpeechSynthesisCalls += 1;
      return originalSpeak(...args);
    };
  });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: preferenceKey, value: preferences });
  await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });
  await page.locator('[data-action="preview-complete"]').click();
  await page.locator('[data-task-narration-control]').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('link[data-type2learn-narration-preload][href*="/course/audio/edge-ava/neurodivergent/01-adhd/read-ava-timed.mp3"]'), null, { timeout: 15000 });
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((entry) => String(entry.name).includes('/course/audio/edge-ava/neurodivergent/01-adhd/read-ava-timed.mp3')), null, { timeout: 15000 });
  const inspection = await page.evaluate(() => {
    const play = document.querySelector('[data-task-narration-control]');
    const callAi = document.querySelector('[data-action="call-ai"]');
    const playRect = play?.getBoundingClientRect();
    const aiRect = callAi?.getBoundingClientRect();
    return {
      text: play?.textContent?.trim() || '',
      hasPlayControl: Boolean(playRect && playRect.width && playRect.height),
      beforeCallAi: Boolean(playRect && aiRect && playRect.left < aiRect.left),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      recordedAudioPreloaded: performance.getEntriesByType('resource').some((entry) => String(entry.name).includes('/course/audio/edge-ava/neurodivergent/01-adhd/read-ava-timed.mp3'))
    };
  });
  assert.equal(inspection.hasPlayControl, true, 'Text-to-speech enabled in course setup must show a play control.');
  assert.equal(inspection.beforeCallAi, true, 'The play control must be positioned before Call AI.');
  assert.equal(inspection.overflow, false, 'Narration controls must not create horizontal overflow.');
  assert.equal(inspection.recordedAudioPreloaded, true, 'The page recording must preload before the learner presses Play.');
  await page.locator('[data-task-narration-control]').click();
  await page.waitForFunction(() => document.querySelector('[data-task-narration-control]')?.textContent?.includes('Pause audio'), null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.__type2learnSpeechSynthesisCalls), 0, 'Course narration must not fall back to the browser synthetic voice.');
  await page.screenshot({ path: path.resolve('screenshots', 'narration', 'local-text-to-speech-enabled.png'), fullPage: false });
  process.stdout.write(`checked narration control: ${inspection.text}\n`);
  await context.close();
} finally {
  await browser.close();
}
