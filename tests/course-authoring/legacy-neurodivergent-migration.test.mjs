import assert from 'node:assert/strict';
import test from 'node:test';
import { COURSE_CONTENT } from '../../course/course-content.js';
import { legacyNeurodivergentMarkdown, migratedLegacyTheoryCourse } from '../../server/legacy-neurodivergent-migration.mjs';

test('the current Neurodivergent Conditions course deterministically migrates through the bilingual Markdown contract', () => {
  const migrated = migratedLegacyTheoryCourse();
  assert.match(legacyNeurodivergentMarkdown(), /^format: type2learn-theory-course\/v1/m);
  assert.equal(migrated.validation.valid, true);
  assert.equal(migrated.learnerManifest.id, COURSE_CONTENT.id);
  assert.equal(migrated.learnerManifest.modules.length, COURSE_CONTENT.steps.length);
  assert.equal(migrated.learnerManifest.finalExam.en.length, COURSE_CONTENT.finalExam.questions.length);
  assert.equal(migrated.learnerManifest.finalExam.ur.length, COURSE_CONTENT.finalExam.questions.length);
});

test('the migrated learner manifest has no answer key while the private review manifest keeps one key per four-option check', () => {
  const migrated = migratedLegacyTheoryCourse();
  assert.equal(JSON.stringify(migrated.learnerManifest).includes('correctOption'), false);
  assert.equal(migrated.privateManifest.answerKeys.modules.length, COURSE_CONTENT.steps.length);
  assert.equal(migrated.privateManifest.answerKeys.modules.every((entry) => Number.isInteger(entry.en.correctOption) && Number.isInteger(entry.ur.correctOption)), true);
  assert.equal(migrated.privateManifest.answerKeys.finalExam.en.every((entry) => Number.isInteger(entry.correctOption)), true);
});
