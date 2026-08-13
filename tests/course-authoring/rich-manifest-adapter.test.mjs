import assert from 'node:assert/strict';
import test from 'node:test';
import { migratedLegacyTheoryCourse } from '../../server/legacy-neurodivergent-migration.mjs';
import { adaptReviewedManifestForRichCourse, isReviewedLearnerManifest } from '../../course/reviewed-manifest.js';

test('the rich course adapter accepts only a learner-safe reviewed manifest', () => {
  const { learnerManifest } = migratedLegacyTheoryCourse();
  assert.equal(isReviewedLearnerManifest(learnerManifest), true);
  const adapted = adaptReviewedManifestForRichCourse(learnerManifest);
  assert.equal(adapted.course.manifestBacked, true);
  assert.equal(adapted.course.steps.length, learnerManifest.modules.length);
  assert.equal(adapted.urdu.steps.length, learnerManifest.modules.length);
  assert.equal(adapted.course.steps[0].manifestModuleId, learnerManifest.modules[0].id);
});

test('the rich course adapter never places private answer keys into browser options', () => {
  const { learnerManifest } = migratedLegacyTheoryCourse();
  const adapted = adaptReviewedManifestForRichCourse(learnerManifest);
  assert.equal(JSON.stringify(adapted).includes('correctOption'), false);
  assert.equal(adapted.course.steps.every((step) => step.check.options.every(([, correct]) => correct === false)), true);
  assert.equal(adapted.course.finalExam.questions.every((question) => question.options.every(([, correct]) => correct === false)), true);
});

test('the rich course adapter preserves reviewed guided typing as display phrases', () => {
  const { learnerManifest } = migratedLegacyTheoryCourse();
  const adapted = adaptReviewedManifestForRichCourse(learnerManifest);
  const guided = adapted.course.steps.find((step) => step.typing.level === 'Guided typing');
  assert.ok(guided);
  assert.equal(guided.typing.target, '');
  assert.equal(Array.isArray(guided.typing.phrases), true);
  assert.ok(guided.typing.phrases.length > 0);
  assert.equal(guided.typing.phrases.every((phrase) => phrase.length > 0), true);
});

test('the rich course adapter rejects a manifest that accidentally contains a private key', () => {
  const { learnerManifest } = migratedLegacyTheoryCourse();
  const unsafe = structuredClone(learnerManifest);
  unsafe.modules[0].en.check.correctOption = 1;
  assert.throws(() => adaptReviewedManifestForRichCourse(unsafe), /private answer key/);
});

test('all reviewed modules map to the established rich-course contract', () => {
  const { learnerManifest } = migratedLegacyTheoryCourse();
  const adapted = adaptReviewedManifestForRichCourse(learnerManifest);
  for (const step of [...adapted.course.steps, ...adapted.urdu.steps]) {
    assert.match(step.manifestModuleId, /^[a-z0-9-]+$/i);
    assert.ok(step.read.length >= 3);
    assert.equal(step.check.options.length, 4);
    assert.ok(step.check.options.every(([, answer]) => answer === false));
    if (step.typing.level === 'Guided typing') assert.ok(step.typing.phrases.length >= 1);
    if (step.typing.level === 'Recall typing') assert.equal(step.typing.target, '');
  }
});

test('manifest final checks remain learner-safe and have matching bilingual shape', () => {
  const { learnerManifest } = migratedLegacyTheoryCourse();
  const adapted = adaptReviewedManifestForRichCourse(learnerManifest);
  assert.equal(adapted.course.finalExam.questions.length, adapted.urdu.finalExam.questions.length);
  assert.ok(adapted.course.finalExam.questions.length > 0);
  for (const question of adapted.course.finalExam.questions) {
    assert.equal(question.options.length, 4);
    assert.ok(question.options.every(([, answer]) => answer === false));
  }
});
