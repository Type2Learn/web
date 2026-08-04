import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const screenshotDirectory = path.resolve('screenshots', 'ai-chat');
const courseId = 'course-1-neurodivergent-conditions-v2';

// These cover the desktop mascot breakpoint, both tablet orientations, two
// phone widths, and an RTL compact surface. Screens use Still only to make a
// visual baseline deterministic; the WebP itself remains an animated source.
const views = [
  { name: 'desktop-threshold', width: 1181, height: 850, surface: 'rail' },
  { name: 'desktop-laptop', width: 1366, height: 768, surface: 'rail' },
  { name: 'desktop-wide', width: 1920, height: 1080, surface: 'rail' },
  { name: 'tablet-landscape', width: 1024, height: 768, surface: 'page' },
  { name: 'tablet-portrait', width: 768, height: 1024, surface: 'page' },
  { name: 'mobile-390', width: 390, height: 844, surface: 'page' },
  { name: 'mobile-360', width: 360, height: 800, surface: 'page' },
  { name: 'mobile-urdu', width: 390, height: 844, surface: 'page', language: 'urdu', expectedLabel: 'AI کو بلائیں' },
  { name: 'desktop-reduced-motion', width: 1366, height: 768, surface: 'page', animations: 'gentle', reducedMotion: 'reduce' }
];

const preferencesFor = (guestId, { language = 'english', animations = 'still' } = {}) => ({
  preferenceKey: `type2learn-course-preferences-v1:guest-${guestId}:${courseId}`,
  preference: {
    version: 1,
    courseId,
    complete: true,
    choices: {
      'learning-language': language,
      colours: 'balanced',
      layout: 'balanced',
      encouragement: 'subtle',
      animations,
      'background-noise': 'off',
      'text-to-speech': 'off',
      mascot: 'on',
      'mascot-language': language,
      'mascot-voice': 'text',
      'mascot-voice-language': language
    }
  }
});

const surfaceSelector = (surface) => `[data-course-ai-surface="${surface}"]`;

const waitForUiSettled = async (page, selector) => {
  await page.locator(selector).waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction((targetSelector) => {
    const target = document.querySelector(targetSelector);
    if (!target) return false;
    const box = target.getBoundingClientRect();
    const opacity = Number.parseFloat(getComputedStyle(target).opacity || '1');
    const running = target.getAnimations({ subtree: true }).some((animation) => ['pending', 'running'].includes(animation.playState));
    return box.width > 0 && box.height > 0 && opacity >= .99 && !running;
  }, selector, { timeout: 15000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};

const inspectOpenChat = async (page, surface) => page.evaluate((nextSurface) => {
  const chat = document.querySelector(`[data-course-ai-surface="${nextSurface}"]`);
  const button = document.querySelector('[data-action="call-ai"]');
  const mascot = chat?.querySelector('[data-ai-chat-mascot] img');
  const chatRect = chat?.getBoundingClientRect();
  const mascotRect = mascot?.getBoundingClientRect();
  const mascotPath = mascot ? new URL(mascot.currentSrc || mascot.src, window.location.origin).pathname : '';
  return {
    chatExists: Boolean(chat),
    chatWithinViewport: Boolean(chatRect && chatRect.left >= -1 && chatRect.top >= -1 && chatRect.right <= window.innerWidth + 1 && chatRect.bottom <= window.innerHeight + 1),
    noDocumentOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
    mascotInsideChat: Boolean(chat && mascot && chat.contains(mascot)),
    mascotLoaded: Boolean(mascot && mascot.complete && mascot.naturalWidth > 0),
    mascotWithinChat: Boolean(chatRect && mascotRect && mascotRect.left >= chatRect.left - 1 && mascotRect.right <= chatRect.right + 1 && mascotRect.top >= chatRect.top - 1 && mascotRect.bottom <= chatRect.bottom + 1),
    mascotPath,
    isDedicatedPage: Boolean(document.querySelector('[data-course-ai-page]')),
    hasLegacyModal: Boolean(document.querySelector('.course-modal-backdrop')),
    callAiLabel: button?.textContent?.trim() || '',
    direction: document.documentElement.dir
  };
}, surface);

const prepareCourse = async (context, view) => {
  const guestId = `visual${view.width}${view.height}${view.language || 'english'}type2learn`;
  const { preferenceKey, preference } = preferencesFor(guestId, view);
  await context.addCookies([{ name: 'type2learn_guest_id', value: guestId, url: baseUrl }]);
  const page = await context.newPage();
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: preferenceKey, value: preference });
  await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });
  await page.locator('[data-action="call-ai"]').waitFor({ state: 'visible', timeout: 15000 });
  return page;
};

await mkdir(screenshotDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const view of views) {
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: 1, reducedMotion: view.reducedMotion || 'no-preference' });
    const page = await prepareCourse(context, view);
    await page.locator('[data-action="call-ai"]').click();
    await waitForUiSettled(page, surfaceSelector(view.surface));
    await page.locator('[data-ai-chat-mascot] img').waitFor({ state: 'visible', timeout: 15000 });
    await page.screenshot({ path: path.join(screenshotDirectory, `${view.name}.png`), fullPage: false });
    const inspection = await inspectOpenChat(page, view.surface);
    assert.equal(inspection.chatExists, true, `${view.name}: assistant surface is missing`);
    assert.equal(inspection.chatWithinViewport, true, `${view.name}: assistant escaped the viewport`);
    assert.equal(inspection.noDocumentOverflow, true, `${view.name}: document has horizontal overflow`);
    assert.equal(inspection.mascotInsideChat, true, `${view.name}: mascot is outside the assistant box`);
    assert.equal(inspection.mascotLoaded, true, `${view.name}: blinking mascot did not load`);
    assert.equal(inspection.mascotWithinChat, true, `${view.name}: mascot escaped the assistant box`);
    assert.equal(inspection.mascotPath.endsWith('/assets/2D%20Mascot/blinking.webp'), true, `${view.name}: assistant is not using blinking.webp`);
    assert.equal(inspection.callAiLabel, view.expectedLabel || 'Call AI', `${view.name}: Call AI control has the wrong label`);
    assert.equal(inspection.direction, view.language === 'urdu' ? 'rtl' : 'ltr', `${view.name}: page direction is wrong`);
    if (view.surface === 'page') {
      assert.equal(inspection.isDedicatedPage, true, `${view.name}: compact assistant did not use its dedicated page`);
      assert.equal(inspection.hasLegacyModal, false, `${view.name}: compact assistant still used a legacy modal`);
      assert.equal(await page.locator('.course-ai-chat-back').count(), 1, `${view.name}: compact assistant is missing its return control`);
    } else {
      assert.equal(inspection.isDedicatedPage, false, `${view.name}: desktop unexpectedly opened a compact page`);
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction((selector) => !document.querySelector(selector), surfaceSelector(view.surface), { timeout: 15000 });
    await page.waitForFunction(() => document.activeElement?.matches?.('[data-action="call-ai"]') || false, null, { timeout: 15000 });
    await context.close();
    process.stdout.write(`checked ${view.name}\n`);
  }

  // Ensure an open assistant follows a real desktop → tablet → desktop resize
  // without disappearing or leaving an orphaned background surface.
  const resizeContext = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const resizePage = await prepareCourse(resizeContext, { width: 1366, height: 768 });
  await resizePage.locator('[data-action="call-ai"]').click();
  await waitForUiSettled(resizePage, surfaceSelector('rail'));
  await resizePage.setViewportSize({ width: 1024, height: 768 });
  await waitForUiSettled(resizePage, surfaceSelector('page'));
  assert.equal(await resizePage.locator('[data-course-ai-page]').count(), 1, 'desktop to tablet resize: dedicated page did not appear');
  await resizePage.setViewportSize({ width: 1366, height: 768 });
  await waitForUiSettled(resizePage, surfaceSelector('rail'));
  assert.equal(await resizePage.locator('[data-course-ai-page]').count(), 0, 'tablet to desktop resize: dedicated page was not removed');
  await resizeContext.close();
} finally {
  await browser.close();
}
