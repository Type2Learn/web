import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const courseId = 'course-1-neurodivergent-conditions-v2';
const guestId = 'urdu-paired-narration-20260806';
const preferenceKey = `type2learn-course-preferences-v1:guest-${guestId}:${courseId}`;
const choices = {
  'learning-language': 'urdu',
  colours: 'balanced',
  layout: 'balanced',
  encouragement: 'subtle',
  animations: 'still',
  'background-noise': 'off',
  'text-to-speech': 'on',
  mascot: 'off',
  'mascot-language': 'urdu',
  'mascot-voice': 'text',
  'mascot-voice-language': 'urdu'
};

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await context.addCookies([{ name: 'type2learn_guest_id', value: guestId, url: baseUrl }]);
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__urduNarrationTracks = [];
    window.__urduNarrationSpeechCalls = 0;
    HTMLMediaElement.prototype.load = function loadRecordedTrack() {
      window.setTimeout(() => {
        this.dispatchEvent(new Event('loadedmetadata'));
        this.dispatchEvent(new Event('canplay'));
      }, 0);
    };
    HTMLMediaElement.prototype.play = function playRecordedTrack() {
      window.__urduNarrationTracks.push(this.src);
      window.setTimeout(() => this.dispatchEvent(new Event('ended')), 30);
      return Promise.resolve();
    };
    const originalSpeak = window.speechSynthesis?.speak?.bind(window.speechSynthesis);
    if (originalSpeak) window.speechSynthesis.speak = (...args) => {
      window.__urduNarrationSpeechCalls += 1;
      return originalSpeak(...args);
    };
  });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: preferenceKey,
    value: { version: 1, courseId, complete: true, choices }
  });
  await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });
  await page.locator('[data-action="preview-complete"]').click();
  await page.waitForFunction(() => document.querySelector('link[data-type2learn-narration-preload][href*="/01-adhd/urdu/title-ava.mp3"]'), null, { timeout: 15000 });
  const inspection = await page.evaluate(() => ({
    direction: document.documentElement.dir,
    hasUrduPreload: Boolean(document.querySelector('link[data-type2learn-narration-preload][href*="/01-adhd/urdu/title-ava.mp3"]')),
    overflow: document.documentElement.scrollWidth > window.innerWidth
  }));
  assert.equal(inspection.direction, 'rtl', 'Urdu reading must preserve right-to-left layout.');
  assert.equal(inspection.hasUrduPreload, true, 'The Urdu title recording must preload before Play.');
  assert.equal(inspection.overflow, false, 'Urdu narration controls must not cause page overflow.');
  await page.locator('[data-task-narration-control]').click();
  await page.waitForFunction(() => window.__urduNarrationTracks.length >= 6, null, { timeout: 15000 });
  const tracks = await page.evaluate(() => window.__urduNarrationTracks.slice(0, 6));
  assert.equal(tracks[0].includes('/01-adhd/read-ava-timed.mp3'), true, 'Narration must begin with the English title recording.');
  assert.equal(tracks[1].includes('/01-adhd/urdu/title-ava.mp3'), true, 'The Urdu title must follow the English title.');
  assert.equal(tracks[2].includes('/01-adhd/read-ava-timed.mp3'), true, 'The English heading must follow its Urdu title translation.');
  assert.equal(tracks[3].includes('/01-adhd/urdu/section-1-heading-ava.mp3'), true, 'The Urdu heading must follow the English heading.');
  assert.equal(tracks[4].includes('/01-adhd/read-ava-timed.mp3'), true, 'The English explanation must follow its heading translation.');
  assert.equal(tracks[5].includes('/01-adhd/urdu/section-1-answer-ava.mp3'), true, 'The Urdu explanation must follow the English explanation.');
  assert.equal(await page.evaluate(() => window.__urduNarrationSpeechCalls), 0, 'Urdu narration must use recorded audio, never browser speech synthesis.');
  await context.close();
  process.stdout.write('checked paired Urdu narration\n');
} finally {
  await browser.close();
}
