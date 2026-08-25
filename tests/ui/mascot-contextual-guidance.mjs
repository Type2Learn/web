import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

// Live DOM regression for the two entry points that must use the bunny's
// compact Course AI surface: I’m stuck and the bubble's contextual help.
const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const courseId = 'course-1-neurodivergent-conditions-v2';
const screenshotDirectory = path.resolve('screenshots', 'mascot-contextual-guidance');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.TYPE2LEARN_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.TYPE2LEARN_PLAYWRIGHT_EXECUTABLE } : {}),
  args: ['--no-sandbox']
});

await mkdir(screenshotDirectory, { recursive: true });
try {
  const guestId = 'guest-mascot-contextual-guidance';
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'type2learn_guest_id', value: guestId, url: baseUrl }]);
  const page = await context.newPage();
  const requests = [];
  await page.route('**/api/v1/health', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ai: { available: true, guestAccess: true, requiresSignIn: false },
      speechToText: { available: false, textToSpeech: { available: false } },
      behaviouralPartner: { available: false }
    })
  }));
  await page.route('**/api/v1/ai/chat', (route) => {
    const request = JSON.parse(route.request().postData() || '{}');
    requests.push(request);
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ reply: 'Would you like me to rephrase this step, make the first part smaller, explain it in short chunks, or show one brief example?' })
    });
  });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `type2learn-course-preferences-v1:guest-${guestId}:${courseId}`,
    value: {
      version: 2, courseId, complete: true,
      choices: {
        'learning-language': 'english', colours: 'balanced', layout: 'open', encouragement: 'subtle', animations: 'still',
        'background-noise': 'off', 'text-to-speech': 'off', mascot: 'on', 'learning-partner': 'on',
        'mascot-role': 'learning-partner', 'mascot-presence': 'available', 'mascot-proactive': 'on'
      }
    }
  });
  await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });
  await page.locator('[data-action="stuck"]').click();
  await page.locator('[data-action="help-open-ai"]').click();
  await page.waitForFunction(() => document.querySelector('[data-companion-bubble]')?.textContent?.includes('Would you like me'));
  assert.equal(await page.locator('.course-help-modal').count(), 0, 'mascot help closes the barrier sheet instead of layering another modal');
  assert.equal(requests.length, 1, 'I’m stuck sends one automatic current-step request');
  assert.equal(requests[0]?.companionRole, 'learning-partner', 'the mascot role reaches the shared Course AI endpoint');
  assert.match(requests[0]?.message || '', /I need guidance with this current page/);
  assert.match(requests[0]?.message || '', /rephrase it, make the first part smaller, explain it in short chunks/);
  assert.equal(await page.locator('[data-companion-bubble] [data-action="companion-use"]').count(), 0, 'after the contextual reply, the learner chooses their next help in the centred mascot dock instead of seeing a duplicate button');
  assert.equal(await page.locator('[data-action="companion-why"], [data-action="companion-dismiss"]').count(), 0, 'the bubble has no confusing why/not-now controls');
  await page.screenshot({ path: path.join(screenshotDirectory, 'guided-mascot-response.png'), fullPage: false });
  await context.close();
  process.stdout.write('mascot contextual guidance workflow passed\n');
} finally {
  await browser.close();
}
