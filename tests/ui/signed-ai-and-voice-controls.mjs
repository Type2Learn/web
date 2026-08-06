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
const screenshotDirectory = path.resolve('screenshots', 'signed-ai-and-voice');
const testUid = 'codex-ui-probe-20260806';

const choices = (layout) => ({
  'learning-language': 'english',
  colours: 'balanced',
  layout,
  encouragement: 'subtle',
  animations: 'still',
  'background-noise': 'off',
  'text-to-speech': 'on',
  mascot: 'off',
  'mascot-language': 'english',
  'mascot-voice': 'text',
  'mascot-voice-language': 'english'
});

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
  for (const view of [
    { name: 'desktop', width: 1366, height: 820, layout: 'open' },
    { name: 'mobile', width: 390, height: 844, layout: 'balanced' }
  ]) {
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height } });
    const page = await context.newPage();
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: `type2learn-course-preferences-v1:${encodeURIComponent(testUid)}:${courseId}`,
      value: { version: 1, courseId, complete: true, choices: choices(view.layout) }
    });
    await page.goto(`${baseUrl}/login/`, { waitUntil: 'networkidle' });
    await signInTestLearner(page, customToken);
    await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });

    await page.locator('[data-action="call-ai"]').waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await page.locator('[data-action="call-ai"]').isDisabled(), false, `${view.name}: signed-in learner must be allowed to open Course AI`);
    await page.locator('[data-action="call-ai"]').click();
    const composer = page.locator('[data-ai-chat-input]');
    await composer.waitFor({ state: 'visible', timeout: 15000 });
    await composer.fill('What is the main idea on this page?');
    assert.equal(await page.locator('[data-action="ai-send"]').isDisabled(), false, `${view.name}: Send must enable after the learner types`);
    await page.locator('[data-action="ai-send"]').click();
    await page.locator('.course-ai-chat-status.is-error').waitFor({ state: 'visible', timeout: 20000 });
    await page.screenshot({ path: path.join(screenshotDirectory, `${view.name}-ai-send.png`), fullPage: false });

    // Firestore is intentionally disabled in the local project at the time of
    // this check, so verify the reply-audio interface with a bounded page-only
    // reply while the real Speechmatics audio endpoint remains in use.
    await page.route('**/api/v1/ai/chat', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: 'ADHD can affect attention, planning, and energy. This page introduces those everyday experiences.' })
    }));
    await composer.fill('Can you explain the main idea briefly?');
    await page.locator('[data-action="ai-send"]').click();
    await page.getByText('ADHD can affect attention, planning, and energy. This page introduces those everyday experiences.').waitFor({ state: 'visible', timeout: 15000 });
    const listen = page.locator('[data-action="ai-speak-message"]');
    await listen.waitFor({ state: 'visible', timeout: 15000 });
    await listen.click();
    await page.waitForFunction(() => document.querySelector('[data-action="ai-speak-message"]')?.textContent?.includes('Stop audio') || Boolean(document.querySelector('.course-ai-chat-status.is-error')), null, { timeout: 20000 });
    assert.equal(await page.locator('.course-ai-chat-status.is-error').count(), 0, `${view.name}: reply audio should play without a UI error`);
    await page.screenshot({ path: path.join(screenshotDirectory, `${view.name}-ai-reply-audio.png`), fullPage: false });
    await page.unroute('**/api/v1/ai/chat');
    await page.locator('[data-action="close-ai-chat"]').click();

    await page.locator('[data-action="preview-complete"]').click();
    await page.locator('[data-action="read-complete"]').click();
    const speak = page.locator('[data-action="start-voice-input"]');
    await speak.waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await speak.isDisabled(), false, `${view.name}: signed-in typing activity must show Speak`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${view.name}: signed-in controls must not overflow horizontally`);
    await page.screenshot({ path: path.join(screenshotDirectory, `${view.name}-typing-speak.png`), fullPage: false });
    await context.close();
    process.stdout.write(`checked ${view.name}\n`);
  }
} finally {
  await browser.close();
  await adminAuth.deleteUser(testUid).catch(() => {});
}
