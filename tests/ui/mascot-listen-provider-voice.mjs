import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

// Browser regression for the exact failure reported by learners: a visible
// Listen button must turn a configured provider WAV response into a started
// Web Audio source.  The provider endpoint is intercepted—no voice key or
// learner account is needed for this repeatable UI check.
const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const courseId = 'course-1-neurodivergent-conditions-v2';
const screenshotDirectory = path.resolve('screenshots', 'mascot-listen-provider-voice');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.TYPE2LEARN_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.TYPE2LEARN_PLAYWRIGHT_EXECUTABLE } : {}),
  args: ['--no-sandbox']
});

await mkdir(screenshotDirectory, { recursive: true });
try {
  const guestId = 'guest-mascot-provider-voice';
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'type2learn_guest_id', value: guestId, url: baseUrl }]);
  const page = await context.newPage();
  await page.addInitScript(() => {
    class TestAudioContext {
      constructor() { this.state = 'suspended'; this.destination = {}; }
      async resume() { this.state = 'running'; }
      async close() { this.state = 'closed'; }
      async decodeAudioData() { return { fakeProviderAudio: true }; }
      createBufferSource() {
        const listeners = new Map();
        return {
          connect() {}, disconnect() {}, stop() {},
          addEventListener(name, listener) { listeners.set(name, listener); },
          start() { window.__type2learnProviderVoiceStarted = true; }
        };
      }
    }
    window.AudioContext = TestAudioContext;
  });
  await page.route('**/api/v1/health', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ai: { available: true, guestAccess: true, requiresSignIn: false },
      speechToText: { available: false, textToSpeech: { available: true, language: 'en', voice: 'sarah', guestAccess: true } },
      behaviouralPartner: { available: false }
    })
  }));
  let ttsRequest = null;
  await page.route('**/api/v1/speech/synthesise', (route) => {
    ttsRequest = JSON.parse(route.request().postData() || '{}');
    // A valid WAV header is enough for the browser-side decoded-audio mock.
    return route.fulfill({
      status: 200,
      contentType: 'audio/wav',
      body: Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(32)])
    });
  });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `type2learn-course-preferences-v1:guest-${guestId}:${courseId}`,
    value: {
      version: 2, courseId, complete: true,
      choices: {
        'learning-language': 'english', colours: 'balanced', layout: 'open', encouragement: 'subtle', animations: 'still',
        'background-noise': 'off', 'text-to-speech': 'on', mascot: 'on', 'learning-partner': 'off'
      }
    }
  });
  await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });
  const listen = page.locator('[data-course-mascot] [data-action="mascot-speak"]');
  await listen.waitFor();
  await listen.click();
  await page.waitForFunction(() => window.__type2learnProviderVoiceStarted === true);
  assert.equal(ttsRequest?.language, 'en');
  assert.ok(String(ttsRequest?.text || '').length > 0, 'the exact visible mascot reply is supplied to the configured provider');
  assert.equal(await listen.textContent(), 'Stop voice');
  await page.screenshot({ path: path.join(screenshotDirectory, 'provider-voice-started.png'), fullPage: false });
  await context.close();
  process.stdout.write('mascot configured-provider Listen workflow passed\n');
} finally {
  await browser.close();
}
