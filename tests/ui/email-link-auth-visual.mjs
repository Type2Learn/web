import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.TYPE2LEARN_TEST_URL || 'http://127.0.0.1:4173';
const screenshotDirectory = path.resolve('screenshots', 'email-link-auth');
const views = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'mobile', width: 390, height: 844 }
];

await mkdir(screenshotDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const view of views) {
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/login/`, { waitUntil: 'commit', timeout: 15000 });
    await page.locator('[data-auth-mode="email-link"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-auth-mode="email-link"]').click();
    await page.locator('[data-auth-form="email-link"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => {
      const form = document.querySelector('[data-auth-form="email-link"]');
      const opacity = Number.parseFloat(form ? getComputedStyle(form).opacity : '0');
      const animating = form?.getAnimations({ subtree: true }).some((animation) => ['pending', 'running'].includes(animation.playState));
      return Boolean(form && opacity >= .99 && !animating);
    }, { timeout: 15000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(screenshotDirectory, `${view.name}.png`), fullPage: false });
    const inspection = await page.evaluate(() => {
      const form = document.querySelector('[data-auth-form="email-link"]');
      const input = document.getElementById('email-link-email');
      const submit = document.querySelector('[data-email-link-submit]');
      const formBox = form?.getBoundingClientRect();
      return {
        visible: Boolean(formBox && formBox.width > 0 && formBox.height > 0),
        emailInput: input?.type === 'email' && input.required,
        requestLabel: submit?.textContent?.trim() || '',
        passwordVisible: Boolean(form?.querySelector('input[type="password"]')),
        withinViewport: Boolean(formBox && formBox.left >= -1 && formBox.top >= -1 && formBox.right <= window.innerWidth + 1 && formBox.bottom <= window.innerHeight + 1),
        noOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1
      };
    });
    assert.equal(inspection.visible, true, `${view.name}: email-link form is not visible`);
    assert.equal(inspection.emailInput, true, `${view.name}: email-link form lacks a required email input`);
    assert.equal(inspection.requestLabel, 'Email me a sign-in link', `${view.name}: email-link request label is wrong`);
    assert.equal(inspection.passwordVisible, false, `${view.name}: password appears in passwordless sign-in`);
    assert.equal(inspection.withinViewport, true, `${view.name}: email-link form escapes the viewport`);
    assert.equal(inspection.noOverflow, true, `${view.name}: email-link view has horizontal overflow`);
    await context.close();
    process.stdout.write(`checked ${view.name}\n`);
  }
} finally {
  await browser.close();
}
