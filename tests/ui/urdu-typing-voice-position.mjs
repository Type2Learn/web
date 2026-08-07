import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const courseId = 'course-1-neurodivergent-conditions-v2';
const screenshots = path.resolve('screenshots', 'urdu-typing-voice-position');
const screens = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 }
];

const choices = {
  'website-scheme': 'calm',
  'urdu-mode': 'on',
  colours: 'balanced',
  layout: 'balanced',
  encouragement: 'subtle',
  animations: 'still',
  'background-noise': 'off',
  'text-to-speech': 'off',
  mascot: 'off',
  'mascot-language': 'urdu',
  'mascot-voice': 'text',
  'mascot-voice-language': 'urdu'
};

const authStub = [
  'export const waitForType2LearnUser = async () => ({',
  "  uid: 'voice-layout-fixture',",
  "  email: 'voice-layout@example.test',",
  '  getIdToken: async () => \'voice-layout-token\'',
  '});',
  'export const signOutType2LearnUser = async () => {};'
].join('\n');

await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const screen of screens) {
    const context = await browser.newContext({ viewport: { width: screen.width, height: screen.height } });
    await context.route('**/firebase-auth.js*', (route) => route.fulfill({
      contentType: 'application/javascript',
      body: authStub
    }));
    const page = await context.newPage();
    const preferenceKey = `type2learn-course-preferences-v1:voice-layout-fixture:${courseId}`;
    await page.addInitScript(({ key, savedChoices }) => localStorage.setItem(key, JSON.stringify({
      version: 2,
      courseId: 'course-1-neurodivergent-conditions-v2',
      complete: true,
      choices: savedChoices
    })), { key: preferenceKey, savedChoices: choices });
    await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });
    await page.locator('[data-action="preview-complete"]').click();
    await page.locator('[data-action="read-complete"]').click();
    await page.locator('[data-action="start-voice-input"]').waitFor({ state: 'visible', timeout: 15000 });

    const layout = await page.evaluate(() => {
      const button = document.querySelector('[data-action="start-voice-input"]');
      const field = document.querySelector('.typing-tester');
      const controls = document.querySelector('[data-voice-input-controls]');
      const heading = document.querySelector('.course-task-top h2');
      const headerControls = document.querySelector('.course-task-header-controls');
      const buttonRect = button?.getBoundingClientRect();
      const fieldRect = field?.getBoundingClientRect();
      const headingRect = heading?.getBoundingClientRect();
      const headerControlsRect = headerControls?.getBoundingClientRect();
      const headerControlsOverlapHeading = Boolean(headingRect && headerControlsRect
        && headingRect.left < headerControlsRect.right
        && headingRect.right > headerControlsRect.left
        && headingRect.top < headerControlsRect.bottom
        && headingRect.bottom > headerControlsRect.top);
      return {
        pageDirection: document.documentElement.dir,
        controlDirection: controls ? getComputedStyle(controls).direction : '',
        buttonLeft: buttonRect?.left ?? 0,
        buttonRight: buttonRect?.right ?? 0,
        buttonBottom: buttonRect?.bottom ?? 0,
        fieldLeft: fieldRect?.left ?? 0,
        fieldRight: fieldRect?.right ?? 0,
        fieldTop: fieldRect?.top ?? 0,
        headerControlsOverlapHeading,
        overflow: document.documentElement.scrollWidth > window.innerWidth
      };
    });

    assert.equal(layout.pageDirection, 'rtl', `${screen.name}: Urdu page direction must remain RTL.`);
    assert.equal(layout.controlDirection, 'ltr', `${screen.name}: English typing controls must use a physical LTR alignment.`);
    assert.ok(layout.buttonRight <= layout.fieldRight + 1, `${screen.name}: Speak must not exceed the typing field's right edge.`);
    assert.ok(layout.buttonRight >= layout.fieldRight - 3, `${screen.name}: Speak must align with the typing field's top-right edge.`);
    assert.ok(layout.buttonLeft >= layout.fieldLeft - 1, `${screen.name}: Speak must remain above the typing field.`);
    assert.ok(layout.buttonBottom <= layout.fieldTop, `${screen.name}: Speak must remain above, not inside, the typing field.`);
    assert.equal(layout.headerControlsOverlapHeading, false, `${screen.name}: page-support controls must never overlap the task heading.`);
    assert.equal(layout.overflow, false, `${screen.name}: typing controls must not cause horizontal overflow.`);
    await page.screenshot({ path: path.join(screenshots, `${screen.name}.png`), fullPage: false });
    await context.close();
    process.stdout.write(`checked Urdu typing Speak position on ${screen.name}\n`);
  }
} finally {
  await browser.close();
}
