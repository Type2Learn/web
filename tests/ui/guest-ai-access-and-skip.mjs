import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox } from '@playwright/test';

const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const courseId = 'course-1-neurodivergent-conditions-v2';
const screenshotDirectory = path.resolve('screenshots', 'guest-module-navigation');

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

await mkdir(screenshotDirectory, { recursive: true });
// CI normally uses Playwright's managed browser. A locally supplied path lets
// the same smoke test run on a workstation whose bundled browser revision is
// already installed, without changing what production code loads.
const browserEngine = process.env.TYPE2LEARN_PLAYWRIGHT_BROWSER === 'firefox' ? firefox : chromium;
const browser = await browserEngine.launch({
  headless: true,
  ...(process.env.TYPE2LEARN_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.TYPE2LEARN_PLAYWRIGHT_EXECUTABLE } : {})
});
try {
  for (const view of [
    { name: 'desktop-open', width: 1366, height: 820, layout: 'open' },
    { name: 'tablet-balanced', width: 768, height: 1024, layout: 'balanced' },
    { name: 'mobile-open', width: 390, height: 844, layout: 'open' }
  ]) {
    const guestId = `guest-access-${view.name}`;
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height } });
    await context.addCookies([{ name: 'type2learn_guest_id', value: guestId, url: baseUrl }]);
    const page = await context.newPage();
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: `type2learn-course-preferences-v1:guest-${guestId}:${courseId}`,
      value: { version: 1, courseId, complete: true, choices: choices(view.layout) }
    });
    await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });
    const callAi = page.locator('[data-action="call-ai"]');
    await callAi.waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await callAi.isDisabled(), true, `${view.name}: Call AI must be disabled for a guest`);
    assert.equal(await page.locator('[data-course-ai-chat]').count(), 0, `${view.name}: a guest must not open the chat`);
    const tooltip = await page.locator('.course-ai-login-gate').evaluate((node) => getComputedStyle(node, '::after').content);
    assert.match(tooltip, /Log in required/, `${view.name}: guest AI control needs a login explanation`);
    assert.equal(await page.locator('[data-action="start-voice-input"]').count(), 0, `${view.name}: guest typing voice input must not be exposed`);
    assert.equal(await page.locator('[data-action="skip-course"]').count(), 0, `${view.name}: course pausing must not be offered as module navigation`);
    const skipModule = page.locator('[data-action="guest-skip-module"]');
    assert.equal(await skipModule.count(), 1, `${view.name}: guests need one skip-this-module control beside the task action`);
    assert.equal(await page.locator('[data-guest-module-navigation]').evaluate((node) => node.parentElement?.classList.contains('course-task-actions')), true, `${view.name}: module navigation must live beside the current task action`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${view.name}: must not create horizontal overflow`);
    await page.screenshot({ path: path.join(screenshotDirectory, `${view.name}-before-skip.png`), fullPage: false });
    await skipModule.click();
    await page.waitForFunction(() => document.querySelector('.course-module-list li.is-active strong')?.textContent?.includes('Dyslexia'));
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), `type2learn-course-prototype-v1:guest-${guestId}:${courseId}`);
    assert.equal(saved.coursePaused, false, `${view.name}: skipping a module must keep the course open`);
    assert.equal(saved.progress.lessonIndex, 1, `${view.name}: skipping ADHD must open Dyslexia`);
    assert.equal(saved.progress.completedSteps.includes(0), false, `${view.name}: skipping must not incorrectly mark ADHD complete`);
    assert.equal(saved.progress.moduleSnapshots['0']?.phase, 'preview', `${view.name}: skipping must preserve the module being left`);
    assert.equal(await page.locator('[data-action="guest-previous-module"]').count(), 1, `${view.name}: a later module must offer a route back to the previous module`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${view.name}: moving forward must not create horizontal overflow`);
    await page.screenshot({ path: path.join(screenshotDirectory, `${view.name}-after-skip.png`), fullPage: false });
    await page.locator('[data-action="guest-previous-module"]').click();
    await page.waitForFunction(() => document.querySelector('.course-module-list li.is-active strong')?.textContent?.includes('ADHD'));
    const returned = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), `type2learn-course-prototype-v1:guest-${guestId}:${courseId}`);
    assert.equal(returned.progress.lessonIndex, 0, `${view.name}: Previous module must return to ADHD`);
    assert.equal(returned.progress.phase, 'preview', `${view.name}: Previous module must restore the saved ADHD task`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${view.name}: moving back must not create horizontal overflow`);
    await context.close();
    process.stdout.write(`checked ${view.name}\n`);
  }
} finally {
  await browser.close();
}
