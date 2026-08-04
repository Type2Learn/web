import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const courseId = 'course-1-neurodivergent-conditions-v2';
const guestId = 'typing-narration-visual';
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

await mkdir(path.resolve('screenshots', 'typing-narration'), { recursive: true });
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
  await page.locator('[data-action="read-complete"]').click();
  await page.locator('[data-typing-input]').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('link[data-type2learn-next-narration][href*="02-dyslexia/read-ava-timed.mp3"]'), null, { timeout: 15000 });
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((entry) => String(entry.name).includes('/assets/audio/typing-tts/Male%201/I%20will%20tell%20you%20what%20you%20need%20to%20type!...And%20I%20will%20tell%20you%20what%20you%20actually%20typed!...mp3')), null, { timeout: 15000 });
  await page.locator('[data-typing-input]').fill('A');
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((entry) => String(entry.name).includes('/assets/audio/typing-tts/Female%201/Alphabets/A.mp3')), null, { timeout: 15000 });
  const beforePlay = await page.evaluate(() => {
    const control = document.querySelector('[data-task-narration-control]');
    const callAi = document.querySelector('[data-action="call-ai"]');
    const controlRect = control?.getBoundingClientRect();
    const aiRect = callAi?.getBoundingClientRect();
    return {
      visible: Boolean(controlRect && controlRect.width && controlRect.height),
      beforeCallAi: Boolean(controlRect && aiRect && controlRect.left < aiRect.left),
      expectedPreloaded: performance.getEntriesByType('resource').some((entry) => String(entry.name).includes('/assets/audio/typing-tts/Male%201/Alphabets/A.mp3')),
      responsePreloaded: performance.getEntriesByType('resource').some((entry) => String(entry.name).includes('/assets/audio/typing-tts/Female%201/Alphabets/A.mp3')),
      nextModuleQueued: Boolean(document.querySelector('link[data-type2learn-next-narration][href*="02-dyslexia/read-ava-timed.mp3"]')),
      overflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });
  assert.equal(beforePlay.visible, true, 'Typing must show the same audio button.');
  assert.equal(beforePlay.beforeCallAi, true, 'Typing audio control must sit before Call AI.');
  assert.equal(beforePlay.expectedPreloaded, true, 'Expected typing characters must preload before playback.');
  assert.equal(beforePlay.responsePreloaded, true, 'Typed characters must warm immediately after input.');
  assert.equal(beforePlay.nextModuleQueued, true, 'The next module recording must queue after current-page audio is warm.');
  assert.equal(beforePlay.overflow, false, 'Typing narration controls must not overflow the page.');
  await page.locator('[data-task-narration-control]').click();
  await page.waitForFunction(() => document.querySelector('[data-task-narration-control]')?.textContent?.includes('Pause audio'), null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.__type2learnSpeechSynthesisCalls), 0, 'Typing narration must not use browser speech.');
  await page.screenshot({ path: path.resolve('screenshots', 'typing-narration', 'typing-audio-playing.png'), fullPage: false });
  process.stdout.write('checked typing narration\n');
  await context.close();

  const urduGuestId = 'typing-narration-urdu-visual';
  const urduPreferenceKey = `type2learn-course-preferences-v1:guest-${urduGuestId}:${courseId}`;
  const urduPreferences = {
    ...preferences,
    choices: { ...preferences.choices, 'learning-language': 'urdu', 'mascot-language': 'urdu', 'mascot-voice-language': 'urdu' }
  };
  const urduContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await urduContext.addCookies([{ name: 'type2learn_guest_id', value: urduGuestId, url: baseUrl }]);
  const urduPage = await urduContext.newPage();
  await urduPage.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: urduPreferenceKey, value: urduPreferences });
  await urduPage.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });
  await urduPage.locator('[data-action="preview-complete"]').click();
  await urduPage.locator('[data-action="read-complete"]').click();
  await urduPage.locator('[data-task-narration-control]').waitFor({ state: 'visible', timeout: 15000 });
  await urduPage.waitForFunction(() => performance.getEntriesByType('resource').some((entry) => String(entry.name).includes('/assets/audio/typing-tts/Male%201/Hindi_male_voice_1.mp3')), null, { timeout: 15000 });
  const urduInspection = await urduPage.evaluate(() => ({
    direction: document.documentElement.dir,
    hasControl: Boolean(document.querySelector('[data-task-narration-control]')),
    overflow: document.documentElement.scrollWidth > window.innerWidth
  }));
  assert.equal(urduInspection.direction, 'rtl', 'Urdu typing must retain right-to-left layout.');
  assert.equal(urduInspection.hasControl, true, 'Urdu typing must show the same audio control.');
  assert.equal(urduInspection.overflow, false, 'Urdu typing narration must not overflow a mobile screen.');
  await urduPage.screenshot({ path: path.resolve('screenshots', 'typing-narration', 'typing-audio-urdu-mobile.png'), fullPage: false });
  process.stdout.write('checked Urdu typing narration\n');
  await urduContext.close();
} finally {
  await browser.close();
}
