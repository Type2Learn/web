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
const screenshotDirectory = path.resolve('screenshots', 'urdu-ai-chat');
const testUid = 'codex-urdu-ai-chat-20260807';
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
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 }
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    let requestLanguage = '';
    await page.route('**/api/v1/health', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ai: { available: true, requiresSignIn: true }, speechToText: { available: false } })
    }));
    await page.route('**/api/v1/ai/chat', (route) => {
      requestLanguage = route.request().postDataJSON()?.language || '';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: 'محمد طٰہٰ بن زعیم نے ٹائپ ٹو لرن کی بنیاد رکھی۔ یہ صفحہ توجہ، منصوبہ بندی اور روزمرہ مدد کے بارے میں ہے۔' })
      });
    });
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: `type2learn-course-preferences-v1:${encodeURIComponent(testUid)}:${courseId}`,
      value: { version: 1, courseId, complete: true, choices }
    });
    await page.goto(`${baseUrl}/login/`, { waitUntil: 'networkidle' });
    await signInTestLearner(page, customToken);
    // Firebase can retain an authenticated background connection, so a
    // network-idle wait is not a reliable readiness signal after sign-in.
    await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'domcontentloaded' });
    const trigger = page.locator('[data-action="call-ai"]');
    await trigger.waitFor({ state: 'visible', timeout: 15000 });
    await trigger.click();
    const chat = page.locator('[data-course-ai-chat]');
    await chat.waitFor({ state: 'visible', timeout: 15000 });
    const inspection = await chat.evaluate((node) => ({
      language: node.lang,
      direction: node.dir,
      overflow: document.documentElement.scrollWidth > window.innerWidth
    }));
    assert.equal(inspection.language, 'ur', `${viewport.name}: Course AI must use Urdu language metadata.`);
    assert.equal(inspection.direction, 'rtl', `${viewport.name}: Course AI must mirror right-to-left in Urdu.`);
    assert.equal(inspection.overflow, false, `${viewport.name}: Course AI must not introduce horizontal overflow.`);
    await page.locator('[data-ai-chat-input]').fill('اس صفحے کا مرکزی خیال کیا ہے؟');
    await page.locator('[data-action="ai-send"]').click();
    await page.getByText('محمد طٰہٰ بن زعیم نے ٹائپ ٹو لرن کی بنیاد رکھی۔ یہ صفحہ توجہ، منصوبہ بندی اور روزمرہ مدد کے بارے میں ہے۔').waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(requestLanguage, 'ur', `${viewport.name}: Course AI requests must identify Urdu mode to the service.`);
    assert.equal(await chat.locator('[data-action="ai-speak-message"]').count(), 0, `${viewport.name}: written Urdu replies must not offer unsupported English-only reply audio.`);
    await page.screenshot({ path: path.join(screenshotDirectory, `${viewport.name}.png`), fullPage: false });
    await context.close();
    process.stdout.write(`checked Urdu Course AI on ${viewport.name}\n`);
  }
} finally {
  await browser.close();
  await adminAuth.deleteUser(testUid).catch(() => {});
}
