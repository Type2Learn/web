import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { legacyNeurodivergentMarkdown, migratedLegacyTheoryCourse } from '../../server/legacy-neurodivergent-migration.mjs';
import { createCourseCatalogService } from '../../server/course-catalog-service.mjs';

const sourceUrl = new URL('../../course/authoring/neurodivergent-conditions.v1.md', import.meta.url);

test('the current Neurodivergent Conditions course uses a reviewed Markdown source through the bilingual contract', async () => {
  const migrated = migratedLegacyTheoryCourse();
  const markdown = await readFile(sourceUrl, 'utf8');
  assert.equal(legacyNeurodivergentMarkdown(), markdown);
  assert.match(markdown, /^format: type2learn-theory-course\/v1/m);
  assert.equal(migrated.validation.valid, true);
  assert.equal(migrated.learnerManifest.id, 'course-1-neurodivergent-conditions-v2');
  assert.equal(migrated.learnerManifest.modules.length, 11);
  assert.equal(migrated.learnerManifest.finalExam.en.length, 10);
  assert.equal(migrated.learnerManifest.finalExam.ur.length, 10);
});

test('the migrated learner manifest has no answer key while the private review manifest keeps one key per four-option check', () => {
  const migrated = migratedLegacyTheoryCourse();
  assert.equal(JSON.stringify(migrated.learnerManifest).includes('correctOption'), false);
  assert.equal(migrated.privateManifest.answerKeys.modules.length, 11);
  assert.equal(migrated.privateManifest.answerKeys.modules.every((entry) => Number.isInteger(entry.en.correctOption) && Number.isInteger(entry.ur.correctOption)), true);
  assert.equal(migrated.privateManifest.answerKeys.finalExam.en.every((entry) => Number.isInteger(entry.correctOption)), true);
});

test('the catalogue serves the reviewed legacy Markdown as a normal learner-safe manifest', async () => {
  const service = createCourseCatalogService({
    firebase: { available: true, firestore: {} },
    config: { educatorWorkspaceEnabled: true },
    access: { accountFor: async () => ({ uid: 'learner-1', roles: ['learner'], organisations: [] }) }
  });
  const result = await service.manifest({ authorization: 'Bearer test', courseId: 'course-1-neurodivergent-conditions-v2', version: '1.1' });
  assert.equal(result.legacy, false);
  assert.equal(result.manifest.modules.length, 11);
  assert.equal(JSON.stringify(result.manifest).includes('correctOption'), false);
  assert.equal(JSON.stringify(result).includes('privateManifest'), false);
});

test('catalogue-selected legacy links use the generic manifest player while the bare historical route remains compatible', async () => {
  const router = await readFile(new URL('../../course/course-router.js', import.meta.url), 'utf8');
  assert.match(router, /if \(!requested\) await import\('\.\/course\.js/);
  assert.match(router, /else await import\('\.\/dynamic-course\.js/);
});
