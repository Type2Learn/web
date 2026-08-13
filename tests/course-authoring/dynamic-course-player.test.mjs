import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const player = await readFile(join(root, 'course', 'dynamic-course.js'), 'utf8');
const styles = await readFile(join(root, 'course', 'dynamic-course.css'), 'utf8');
const backupService = await readFile(join(root, 'server', 'course-backup-service.mjs'), 'utf8');

test('the generic theory player resolves the shared learner support settings instead of creating a second settings model', () => {
  assert.match(player, /loadLearnerSettings, resolveSettings/);
  assert.match(player, /supportSettings = resolveSettings\(loadLearnerSettings\(user\.uid\)\)/);
  assert.match(player, /setting\('smallerSections'\)/);
  assert.match(player, /setting\('textSize', 'standard'\)/);
  assert.match(player, /setting\('spacing', 'standard'\)/);
  assert.match(player, /setting\('readingWidth', 'comfortable'\)/);
});

test('small sections, motion, and visual-support preferences have a concrete generic course presentation', () => {
  assert.match(player, /data-action="previous-section"/);
  assert.match(player, /data-action="next-section"/);
  assert.match(player, /setting\('contentTransitions'\)/);
  assert.match(player, /setting\('reducedMotion'\)/);
  assert.match(styles, /dynamic-course--spacing-relaxed/);
  assert.match(styles, /dynamic-course--width-narrow/);
  assert.match(styles, /dynamic-course--high-contrast/);
  assert.match(styles, /data-transitions="on"/);
});

test('voice input is distinct from alternative response choices and is exposed only when speech-to-text is enabled', () => {
  assert.match(player, /setting\('speechToText'\) \?/);
  assert.match(player, /setting\('alternativeInput'\) \|\| setting\('alternativeResponses'\)/);
  assert.match(player, /SpeechRecognition \|\| window\.webkitSpeechRecognition/);
  assert.match(player, /data-action="speak-input"/);
});

test('the learner player never receives answer keys and validates checks through the protected server route', () => {
  assert.equal(player.includes('correctOption'), false);
  assert.match(player, /\/api\/v1\/courses\/check-answer/);
  assert.match(player, /scope: 'module'/);
  assert.match(player, /scope: 'final'/);
});

test('backup verification cannot skip directly from review to a release receipt', () => {
  assert.match(backupService, /record\.status !== 'backups-pending'/);
  assert.match(backupService, /BACKUP_STAGE_REQUIRED/);
});
