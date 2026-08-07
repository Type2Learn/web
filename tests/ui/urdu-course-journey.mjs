import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const courseId = 'course-1-neurodivergent-conditions-v2';
const screenshotDirectory = path.resolve('screenshots', 'urdu-course-journey');
const views = [
  { name: 'desktop-focused-flat-balanced', width: 1440, height: 900, layout: 'focused', colours: 'flat', encouragement: 'balanced', popup: 'focused' },
  { name: 'tablet-balanced-balanced-expressive', width: 768, height: 1024, layout: 'balanced', colours: 'balanced', encouragement: 'expressive', popup: 'balanced' },
  { name: 'mobile-open-vivid-subtle', width: 390, height: 844, layout: 'open', colours: 'vivid', encouragement: 'subtle', popup: '' }
];

const choices = (view) => ({
  'website-scheme': 'balanced',
  'urdu-mode': 'on',
  colours: view.colours,
  layout: view.layout,
  encouragement: view.encouragement,
  animations: 'still',
  'background-noise': 'off',
  'text-to-speech': 'on',
  mascot: 'on',
  'mascot-language': 'urdu',
  'mascot-voice': 'text',
  'mascot-voice-language': 'urdu'
});

await mkdir(screenshotDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const view of views) {
    const guestId = `urdu-journey-${view.name}-20260807`;
    const preferenceKey = `type2learn-course-preferences-v1:guest-${guestId}:${courseId}`;
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height } });
    await context.addCookies([{ name: 'type2learn_guest_id', value: guestId, url: baseUrl }]);
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__urduNarrationTracks = [];
      HTMLMediaElement.prototype.load = function loadRecordedTrack() {
        window.setTimeout(() => {
          this.dispatchEvent(new Event('loadedmetadata'));
          this.dispatchEvent(new Event('canplay'));
        }, 0);
      };
      HTMLMediaElement.prototype.play = function playRecordedTrack() {
        window.__urduNarrationTracks.push(this.src);
        window.setTimeout(() => this.dispatchEvent(new Event('ended')), 25);
        return Promise.resolve();
      };
    });
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: preferenceKey,
      value: { version: 1, courseId, complete: true, choices: choices(view) }
    });
    await page.goto(`${baseUrl}/course/?course=${courseId}&start=course`, { waitUntil: 'networkidle' });

    for (let moduleIndex = 0; moduleIndex < 11; moduleIndex += 1) {
      await page.locator('[data-action="preview-complete"]').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('[data-action="preview-complete"]').click();
      await page.locator('[data-task-narration-control]').waitFor({ state: 'visible', timeout: 15000 });
      const pageAudit = await page.evaluate(() => ({
        direction: document.documentElement.dir,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        latinWords: Array.from(document.querySelectorAll('#course-app *'))
          .filter((node) => node.children.length === 0 && !node.closest('.typing-target, textarea'))
          .flatMap((node) => (node.textContent || '').match(/\b[A-Za-z]{2,}\b/g) || [])
          .filter((word) => !['TYPE', 'LEARN'].includes(word.toUpperCase()))
      }));
      assert.equal(pageAudit.direction, 'rtl', `${view.name} module ${moduleIndex + 1}: Urdu course must stay RTL.`);
      assert.equal(pageAudit.overflow, false, `${view.name} module ${moduleIndex + 1}: must not overflow horizontally.`);
      assert.deepEqual(pageAudit.latinWords, [], `${view.name} module ${moduleIndex + 1}: reading UI must not expose English text.`);

      await page.evaluate(() => { window.__urduNarrationTracks = []; });
      await page.locator('[data-task-narration-control]').click();
      await page.waitForFunction(() => window.__urduNarrationTracks.length >= 3, null, { timeout: 15000 });
      const tracks = await page.evaluate(() => window.__urduNarrationTracks.slice());
      assert.ok(tracks.every((source) => source.includes('/urdu-pk/')), `${view.name} module ${moduleIndex + 1}: narration must use Urdu recordings only.`);
      assert.equal(new Set(tracks).size, tracks.length, `${view.name} module ${moduleIndex + 1}: narration must advance to a new recording instead of repeating a line. Tracks: ${tracks.join(' | ')}`);
      await page.screenshot({ path: path.join(screenshotDirectory, `${view.name}-module-${String(moduleIndex + 1).padStart(2, '0')}-read.png`), fullPage: false });

      const skip = page.locator('[data-action="guest-skip-module"]');
      await skip.waitFor({ state: 'visible', timeout: 15000 });
      await skip.click();
      if (moduleIndex < 10) {
        await page.locator('[data-action="preview-complete"]').waitFor({ state: 'visible', timeout: 15000 });
        const popup = page.locator('.course-support-popup');
        if (view.popup) {
          await popup.waitFor({ state: 'visible', timeout: 15000 });
          assert.equal(await popup.evaluate((node, expected) => node.classList.contains(`course-support-popup--${expected}`), view.popup), true, `${view.name}: popup must retain its matching layout.`);
        } else {
          assert.equal(await popup.count(), 0, `${view.name}: subtle encouragement must remain inline, not overlay the task.`);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${view.name} module ${moduleIndex + 1}: skip transition must not overflow.`);
        // Review the settled support treatment, not its entry animation frame.
        await page.waitForTimeout(650);
        await page.screenshot({ path: path.join(screenshotDirectory, `${view.name}-module-${String(moduleIndex + 2).padStart(2, '0')}-skip-feedback.png`), fullPage: false });
      }
    }
    await page.locator('[data-action="start-final-exam"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.screenshot({ path: path.join(screenshotDirectory, `${view.name}-final-exam.png`), fullPage: false });
    await context.close();
    process.stdout.write(`checked all Urdu modules for ${view.name}\n`);
  }
} finally {
  await browser.close();
}
