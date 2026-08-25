import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [course, css, setup, mascot] = await Promise.all([
  read('../../course/course.js'),
  read('../../course/course.css'),
  read('../../learn/learn.js'),
  read('../../course/mascot-2d.js')
]);

test('profile settings use a modal with explicit categories and a backdrop close action', () => {
  assert.match(course, /course-settings-backdrop" data-action="close-settings-menu"/);
  assert.match(course, /tabButton\('general', 'General'/);
  assert.match(course, /tabButton\('reading', 'Reading & input'/);
  assert.match(course, /tabButton\('partner', 'Learning partner'/);
  assert.match(course, /tabButton\('privacy', 'Data & privacy'/);
  assert.match(course, /const settingsTab = event\.target\.closest\('\[data-settings-tab\]'/);
  assert.match(css, /\.course-settings-layout\s*\{/);
  assert.match(css, /grid-template-columns: 220px minmax\(0, 1fr\)/);
  assert.match(css, /\.course-settings-backdrop \.course-settings-menu[\s\S]*display: flex;[\s\S]*height: min\(720px, calc\(100dvh - 48px\)\)/);
  assert.match(css, /\.course-settings-layout[\s\S]*min-height: 0;[\s\S]*flex: 1 1 auto;[\s\S]*overflow: hidden/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.course-settings-backdrop \{ align-items: center; padding: 10px; \}/);
});

test('starting preferences explicitly include privacy-aware support and partner behaviour controls', () => {
  assert.match(setup, /id: 'adaptive-learning'/);
  assert.match(setup, /id: 'learning-partner'/);
  assert.match(setup, /const partnerRoleControl/);
  assert.match(setup, /const partnerPresenceControl/);
  assert.match(setup, /const partnerProactiveControl/);
  assert.match(setup, /\{ id: 'learning-partner' \}, \{ id: 'mascot-role' \}, \{ id: 'mascot-presence' \}, \{ id: 'mascot-proactive' \}/);
});

test('mascot role selection changes its immediate visual state and written dialogue', () => {
  assert.match(course, /const mascotRolePreviewCopy/);
  assert.match(course, /refreshMascotRolePreview\(\)/);
  assert.match(mascot, /target\.dataset\.mascotRole = presentation\.behaviour/);
  assert.match(css, /data-mascot-role="learning-partner"/);
  assert.match(css, /data-mascot-role="self-challenge"/);
  assert.match(css, /data-mascot-role="visual-co-explorer"/);
});

test('mascot presence keeps encouragement inside the task rather than creating a popup', () => {
  assert.match(course, /const isPopup = .*?!mascotCanAppear\(\)/s);
  assert.match(course, /const popupPresentation = .*?!mascotCanAppear\(\)/s);
});

test('browser recognition failures stop clearly and never schedule a reconnect loop', () => {
  assert.match(course, /Live browser recognition lost its connection\. Try Speak again/);
  assert.match(course, /recognition\.onend = \(\) =>[\s\S]*Live browser recognition stopped/);
  assert.doesNotMatch(course, /scheduleVoiceRecognitionRestart/);
});
