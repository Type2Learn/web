import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { chromium } from '@playwright/test';
import { loadRuntimeConfig } from '../../server/config.mjs';
import { createFirebaseRuntime } from '../../server/firebase-runtime.mjs';

const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const courseId = 'course-1-neurodivergent-conditions-v2';
const testUid = 'codex-browser-stt-fallback-20260807';
const screenshotDirectory = path.resolve('screenshots', 'browser-stt-fallback');

const choices = {
  'learning-language': 'english',
  colours: 'balanced',
  layout: 'balanced',
  encouragement: 'subtle',
  animations: 'still',
  'background-noise': 'off',
  'text-to-speech': 'off',
  mascot: 'off',
  'mascot-language': 'english',
  'mascot-voice': 'text',
  'mascot-voice-language': 'english'
};

const signInTestLearner = async (page, token) => page.evaluate(async (customToken) => {
  const [{ signInWithCustomToken }, { getType2LearnAuth }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js'),
    import('/firebase-auth.js?v=20260801-courseflow1')
  ]);
  await signInWithCustomToken(getType2LearnAuth(), customToken);
}, token);

await mkdir(screenshotDirectory, { recursive: true });
const config = await loadRuntimeConfig();
createFirebaseRuntime(config);
const adminAuth = getAuth(getApp('type2learn-ai-service'));
const customToken = await adminAuth.createCustomToken(testUid);
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 820 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    class BrowserSpeechRecognition {
      start() {
        window.setTimeout(() => {
          const alternative = { transcript: String(window.__type2learnTestTranscript || '') };
          const result = [alternative];
          result.isFinal = true;
          this.onresult?.({ resultIndex: 0, results: [result] });
        }, Number(window.__type2learnTestSpeechDelay) || 40);
      }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }
    class BrowserMediaRecorder {
      static isTypeSupported() { return true; }
      constructor(_stream, options = {}) {
        this.mimeType = options.mimeType || 'audio/webm';
        this.state = 'inactive';
        this.listeners = new Map();
      }
      addEventListener(name, listener) { this.listeners.set(name, listener); }
      start() { this.state = 'recording'; }
      stop() {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        this.listeners.get('dataavailable')?.({ data: new Blob(['audio'], { type: this.mimeType }) });
        this.listeners.get('stop')?.();
      }
    }
    window.SpeechRecognition = BrowserSpeechRecognition;
    window.MediaRecorder = BrowserMediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) }
    });
  });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `type2learn-course-preferences-v1:${encodeURIComponent(testUid)}:${courseId}`,
    value: { version: 1, courseId, complete: true, choices }
  });
  let speechmaticsAvailable = false;
  await page.route('**/api/v1/health', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ai: { available: true },
      speechToText: { available: speechmaticsAvailable, textToSpeech: { available: false } }
    })
  }));
  await page.route('**/api/v1/speech/transcribe', async (route) => route.fulfill({
    status: 502,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'SPEECH_UPSTREAM_ERROR', message: 'Voice input could not start.' } })
  }));

  await page.goto(`${baseUrl}/login/`, { waitUntil: 'domcontentloaded' });
  await signInTestLearner(page, customToken);
  await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="preview-complete"]').click();
  await page.locator('[data-action="read-complete"]').click();
  const reference = (await page.locator('#typing-reference').innerText()).replace(/^Text to type:\s*/, '').trim();
  await page.evaluate((text) => { window.__type2learnTestTranscript = text.replace(/ADHD/g, 'A D H D'); }, reference);
  await page.locator('[data-action="start-voice-input"]').click();
  await page.locator('[data-typing-input]').waitFor({ state: 'visible' });
  await page.waitForFunction((target) => document.querySelector('[data-typing-input]')?.value === target, reference, { timeout: 5000 });
  assert.equal(await page.locator('[data-typing-input]').inputValue(), reference, 'browser fallback must apply the deterministic visible-reference fixer');
  await page.screenshot({ path: path.join(screenshotDirectory, 'typing-browser-fallback.png'), fullPage: false });
  await page.locator('[data-action="stop-voice-input"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.typing-tester').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'mobile browser fallback must not create horizontal overflow');
  await page.screenshot({ path: path.join(screenshotDirectory, 'typing-browser-fallback-mobile.png'), fullPage: false });

  await page.locator('[data-action="call-ai"]').click();
  const compose = page.locator('[data-ai-chat-input]');
  await compose.waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-action="ai-dictation-toggle"]').isDisabled(), false, 'Course AI Speak must remain available when Speechmatics is unavailable');
  await page.evaluate(() => { window.__type2learnTestTranscript = 'Who made Type2Learn?'; });
  await page.locator('[data-action="ai-dictation-toggle"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ai-chat-input]')?.value === 'Who made Type2Learn?', null, { timeout: 5000 });
  await page.screenshot({ path: path.join(screenshotDirectory, 'ai-browser-fallback.png'), fullPage: false });
  await page.locator('[data-action="ai-dictation-toggle"]').click();
  await page.locator('[data-action="close-ai-chat"]').click();

  // Simulate the service failing after a recording has been made. The browser
  // cannot transcribe the finished recording, so it must take over immediately
  // and the learner repeats the response into a fresh native-recognition turn.
  speechmaticsAvailable = true;
  await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="call-ai"]').click();
  await page.evaluate(() => {
    window.__type2learnTestTranscript = 'Who made Type2Learn?';
    window.__type2learnTestSpeechDelay = 2500;
  });
  await page.locator('[data-action="ai-dictation-toggle"]').click();
  await page.locator('[data-action="ai-dictation-toggle"]').click();
  await page.getByText('Speechmatics could not transcribe that recording. Browser speech recognition is listening now; please repeat your question.').waitFor({ state: 'visible', timeout: 5000 });
  await page.screenshot({ path: path.join(screenshotDirectory, 'ai-speechmatics-error-browser-fallback.png'), fullPage: false });
  await page.waitForFunction(() => document.querySelector('[data-ai-chat-input]')?.value === 'Who made Type2Learn?', null, { timeout: 5000 });
  await page.locator('[data-action="ai-dictation-toggle"]').click();
  await page.locator('[data-action="close-ai-chat"]').click();

  await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="preview-complete"]').click();
  await page.locator('[data-action="read-complete"]').click();
  const secondReference = (await page.locator('#typing-reference').innerText()).replace(/^Text to type:\s*/, '').trim();
  await page.evaluate((text) => {
    window.__type2learnTestTranscript = text.replace(/ADHD/g, 'A D H D');
    window.__type2learnTestSpeechDelay = 2500;
  }, secondReference);
  await page.locator('[data-action="start-voice-input"]').click();
  await page.locator('[data-action="stop-voice-input"]').click();
  await page.getByText('Speechmatics could not transcribe that recording. Browser speech recognition is ready; please repeat your response.').waitFor({ state: 'visible', timeout: 5000 });
  await page.screenshot({ path: path.join(screenshotDirectory, 'typing-speechmatics-error-browser-fallback.png'), fullPage: true });
  await page.waitForFunction((target) => document.querySelector('[data-typing-input]')?.value === target, secondReference, { timeout: 5000 });
  await context.close();
} finally {
  await browser.close();
  await adminAuth.deleteUser(testUid).catch(() => {});
}
