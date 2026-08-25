import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

// Browser regression: the mascot dock must be a real compact Course AI
// surface for a guest, not a decorative input that opens a sign-in modal.
const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const courseId = 'course-1-neurodivergent-conditions-v2';
const screenshotDirectory = path.resolve('screenshots', 'guest-companion-ai');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.TYPE2LEARN_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.TYPE2LEARN_PLAYWRIGHT_EXECUTABLE } : {}),
  args: ['--no-sandbox']
});

await mkdir(screenshotDirectory, { recursive: true });
try {
  const guestId = 'guest-companion-workflow-proof';
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'type2learn_guest_id', value: guestId, url: baseUrl }]);
  const page = await context.newPage();
  let receivedRequest = null;
  await page.route('**/api/v1/health', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ai: { available: true, guestAccess: true, requiresSignIn: false },
      speechToText: { available: false, textToSpeech: { available: false } },
      behaviouralPartner: { available: false }
    })
  }));
  await page.route('**/api/v1/ai/chat', (route) => {
    receivedRequest = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ reply: 'I am your Learning Partner. I can help you connect one idea at a time.' }) });
  });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `type2learn-course-preferences-v1:guest-${guestId}:${courseId}`,
    value: {
      version: 1,
      courseId,
      complete: true,
      choices: {
        'learning-language': 'english', colours: 'balanced', layout: 'open', encouragement: 'subtle', animations: 'still',
        'background-noise': 'off', 'text-to-speech': 'off', mascot: 'on', 'learning-partner': 'on',
        'mascot-role': 'learning-partner', 'mascot-presence': 'available', 'mascot-proactive': 'on', 'mascot-voice': 'text'
      }
    }
  });
  await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });
  const dock = page.locator('[data-companion-dock]');
  await dock.waitFor({ state: 'visible', timeout: 15000 });
  const image = page.locator('.course-mascot-image').first();
  await image.waitFor({ state: 'visible', timeout: 15000 });
  const [dockBox, mascotBox] = await Promise.all([dock.boundingBox(), image.boundingBox()]);
  assert.ok(dockBox && mascotBox, 'the dock and mascot must both have visual bounds');
  assert.ok(Math.abs((dockBox.x + dockBox.width / 2) - (mascotBox.x + mascotBox.width / 2)) <= 3, 'the dock midpoint must align to the mascot midpoint');
  assert.ok(dockBox.width >= 400, 'the dock must be wide enough for a useful written response');
  await page.screenshot({ path: path.join(screenshotDirectory, 'before-send.png'), fullPage: false });
  await page.locator('[data-companion-input]').fill('Can you help me understand this idea?');
  await page.locator('[data-action="companion-send"]').click();
  await page.locator('[data-companion-bubble]').waitFor({ state: 'visible', timeout: 10000 });
  assert.match(await page.locator('[data-companion-bubble]').innerText(), /Learning Partner/, 'the model reply must become the bunny speech bubble');
  assert.equal(receivedRequest?.companionRole, 'learning-partner', 'the selected role must reach the shared Course AI request');
  assert.equal(receivedRequest?.message, 'Can you help me understand this idea?', 'the learner message must reach Course AI unchanged for this session');
  assert.equal(await page.locator('#guest-ai-title').count(), 0, 'sending from the dock must not detour through a guest sign-in gate');
  assert.equal(await page.locator('[data-companion-input]').inputValue(), '', 'the dock clears only after the message has been sent');
  await page.screenshot({ path: path.join(screenshotDirectory, 'after-send.png'), fullPage: false });
  await context.close();
  process.stdout.write('guest companion Course AI workflow and visual alignment passed\n');
} finally {
  await browser.close();
}
