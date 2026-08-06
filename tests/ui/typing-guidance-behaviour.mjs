import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const courseId = 'course-1-neurodivergent-conditions-v2';

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

const openTyping = async (browser, suffix) => {
  const guestId = `typing-guidance-${suffix}-20260806`;
  const preferenceKey = `type2learn-course-preferences-v1:guest-${guestId}:${courseId}`;
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await context.addCookies([{ name: 'type2learn_guest_id', value: guestId, url: baseUrl }]);
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__typingGuidancePlays = [];
    window.__typingGuidanceSpeechCalls = 0;
    HTMLMediaElement.prototype.play = function playRecordedGuidance() {
      window.__typingGuidancePlays.push(this.src);
      window.setTimeout(() => this.dispatchEvent(new Event('ended')), 35);
      return Promise.resolve();
    };
    const originalSpeak = window.speechSynthesis?.speak?.bind(window.speechSynthesis);
    if (originalSpeak) window.speechSynthesis.speak = (...args) => {
      window.__typingGuidanceSpeechCalls += 1;
      return originalSpeak(...args);
    };
  });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: preferenceKey,
    value: { version: 1, courseId, complete: true, choices }
  });
  await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });
  await page.locator('[data-action="preview-complete"]').click();
  await page.locator('[data-action="read-complete"]').click();
  await page.locator('[data-typing-input]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-task-narration-control]').click();
  await page.waitForTimeout(180);
  return { context, page };
};

const browser = await chromium.launch({ headless: true });
try {
  const first = await openTyping(browser, 'slow-typo');
  const intro = await first.page.evaluate(() => window.__typingGuidancePlays.slice());
  assert.deepEqual(intro.map((source) => source.split('/').slice(-2).join('/')), [
    'guidance/male-instruction-en.mp3',
    'guidance/click-inside-box-en.mp3'
  ], 'Guidance must introduce the male target voice, then the click instruction.');
  await first.page.locator('[data-typing-input]').focus();
  await first.page.waitForTimeout(75);
  assert.equal(await first.page.evaluate(() => window.__typingGuidancePlays.some((source) => source.endsWith('/Male%201/Alphabets/A.mp3'))), true, 'Focusing the typing box must prompt the first expected character.');
  await first.page.locator('[data-typing-input]').fill('B');
  await first.page.waitForTimeout(130);
  const typoPlays = await first.page.evaluate(() => window.__typingGuidancePlays.slice());
  assert.equal(typoPlays.some((source) => source.includes('/Female%201/')), false, 'Typing guidance must not narrate the learner’s typed characters.');
  assert.equal(typoPlays.filter((source) => source.endsWith('/Male%201/Alphabets/A.mp3')).length >= 2, true, 'The male voice must repeat the expected character after a slow typo.');
  assert.equal(await first.page.evaluate(() => window.__typingGuidanceSpeechCalls), 0, 'Typing guidance must never use browser speech synthesis.');
  await first.context.close();

  const fast = await openTyping(browser, 'fast');
  await fast.page.locator('[data-typing-input]').focus();
  await fast.page.waitForTimeout(75);
  await fast.page.evaluate(() => { window.__typingGuidancePlays = []; });
  await fast.page.locator('[data-typing-input]').type('AD', { delay: 0 });
  await fast.page.waitForTimeout(230);
  const fastPlays = await fast.page.evaluate(() => window.__typingGuidancePlays.slice());
  assert.equal(fastPlays.some((source) => source.includes('/Female%201/')), false, 'Fast typing must not add female typed-character feedback.');
  assert.equal(fastPlays.some((source) => source.endsWith('/Male%201/Alphabets/D.mp3')), false, 'Fast typing must suppress the next male prompt.');
  await fast.context.close();

  const fastError = await openTyping(browser, 'fast-error');
  await fastError.page.locator('[data-typing-input]').focus();
  await fastError.page.waitForTimeout(75);
  await fastError.page.evaluate(() => { window.__typingGuidancePlays = []; });
  await fastError.page.locator('[data-typing-input]').type('XB', { delay: 0 });
  await fastError.page.waitForTimeout(180);
  const fastErrorPlays = await fastError.page.evaluate(() => window.__typingGuidancePlays.slice());
  assert.equal(fastErrorPlays.some((source) => source.includes('/Female%201/')), false, 'Fast wrong input must not add female feedback.');
  assert.equal(fastErrorPlays.some((source) => source.endsWith('/Male%201/Alphabets/D.mp3')), true, 'Fast wrong input must say the expected character with the male voice.');
  await fastError.context.close();
  process.stdout.write('checked guided typing narration behaviour\n');
} finally {
  await browser.close();
}
