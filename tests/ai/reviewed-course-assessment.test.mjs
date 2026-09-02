import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { compileTheoryCourse, parseTheoryMarkdown, validateTheoryCourse } from '../../server/theory-course-markdown.mjs';
import { assessmentCurriculumFromManifest, isReviewedTheoryManifest, publicAssessmentItem, validateAssessmentBank } from '../../server/assessment-schemas.mjs';
import { createFallbackAssessmentBank } from '../../server/fallback-assessment-bank.mjs';
import { assessmentProgressDecision, objectiveFocusFromModuleEvidence, prioritiseAssessmentItems } from '../../server/assessment-monitor.mjs';

const reviewedMarkdown = `---
format: type2learn-theory-course/v1
id: water-learning-lab
version: 2.3.0
title.en: Learning about water
title.ur: پانی کے بارے میں سیکھنا
label.en: Educational course
label.ur: تعلیمی کورس
notice.en: Reviewed educational information.
notice.ur: جائزہ شدہ تعلیمی معلومات۔
---
# Module: water-cycle
## English
### Title
The water cycle
### Definition
Water can move between land, water, and air.
### Daily life
Rain can refill a water source.
### Strengths
Learners can notice patterns in weather.
### Challenges
- Some words can be unfamiliar.
### Supports
- Use a labelled diagram.
### Simple
Water moves around and can come back as rain.
### Example
A puddle can slowly dry after sunshine.
### Hint
Think about where water goes after it dries.
### Typing
level: Key idea typing
prompt: Type the key idea.
target: Water can move between land, water, and air.
### Check
question: Which statement fits the water cycle?
- [x] Water can move between land, water, and air.
- [ ] Water stays in exactly one place.
- [ ] Rain is unrelated to water.
- [ ] Diagrams cannot show a process.
## Urdu
### Title
پانی کا چکر
### Definition
پانی زمین، پانی کے ذخیرے اور ہوا کے درمیان حرکت کر سکتا ہے۔
### Daily life
بارش پانی کے ذخیرے کو دوبارہ بھر سکتی ہے۔
### Strengths
سیکھنے والے موسم کے نمونوں کو دیکھ سکتے ہیں۔
### Challenges
- کچھ الفاظ نئے ہو سکتے ہیں۔
### Supports
- ناموں والا خاکہ استعمال کریں۔
### Simple
پانی حرکت کرتا ہے اور بارش بن کر واپس آ سکتا ہے۔
### Example
دھوپ کے بعد گڑھے کا پانی خشک ہو سکتا ہے۔
### Hint
سوچیں خشک ہونے کے بعد پانی کہاں جاتا ہے۔
### Typing
level: Key idea typing
prompt: اہم بات لکھیں۔
target: پانی زمین، پانی کے ذخیرے اور ہوا کے درمیان حرکت کر سکتا ہے۔
### Check
question: کون سا بیان پانی کے چکر کو ظاہر کرتا ہے؟
- [x] پانی زمین، پانی کے ذخیرے اور ہوا کے درمیان حرکت کر سکتا ہے۔
- [ ] پانی ہمیشہ ایک ہی جگہ رہتا ہے۔
- [ ] بارش کا پانی سے تعلق نہیں ہے۔
- [ ] خاکے عمل نہیں دکھا سکتے۔
# Final exam
## English
### Question 1
question: What can rain do?
- [x] Refill a water source.
- [ ] Remove all water from Earth.
- [ ] Stop every cloud.
- [ ] Turn water into rock.
## Urdu
### Question 1
question: بارش کیا کر سکتی ہے؟
- [x] پانی کے ذخیرے کو دوبارہ بھر سکتی ہے۔
- [ ] زمین سے تمام پانی ہٹا سکتی ہے۔
- [ ] ہر بادل کو روک سکتی ہے۔
- [ ] پانی کو پتھر بنا سکتی ہے۔`;

const compiledManifest = () => compileTheoryCourse(validateTheoryCourse(parseTheoryMarkdown(reviewedMarkdown)));
const manifest = () => compiledManifest().learnerManifest;

test('a reviewed teacher manifest becomes a versioned assessment curriculum without a private answer key', () => {
  const learnerManifest = manifest();
  const curriculum = assessmentCurriculumFromManifest(learnerManifest, 0, 'en');
  assert.equal(isReviewedTheoryManifest(learnerManifest), true);
  assert.equal(curriculum.courseId, 'water-learning-lab');
  assert.equal(curriculum.curriculumVersion, '2.3.0');
  assert.equal(curriculum.objectives[0].id, 'm01-water-cycle');
  assert.match(curriculum.source, /Water can move between land, water, and air/);
  assert.equal(JSON.stringify(curriculum).includes('correctOption'), false);
});

test('published theory module reserve is bounded, deterministic, and public-safe', () => {
  const compiled = compiledManifest();
  const curriculum = assessmentCurriculumFromManifest(compiled.learnerManifest, 0, 'en', { privateManifest: compiled.privateManifest });
  const first = validateAssessmentBank(createFallbackAssessmentBank(curriculum), curriculum);
  const second = validateAssessmentBank(createFallbackAssessmentBank(curriculum), curriculum);
  assert.deepEqual(first, second);
  assert.equal(first.items.filter((item) => item.responseMode === 'open').length, 4);
  assert.equal(first.items.filter((item) => item.responseMode === 'mcq').length, 5);
  const publicItem = publicAssessmentItem(first.items[0]);
  assert.equal(Object.hasOwn(publicItem, 'correctOptionIndex'), false);
  assert.equal(Object.hasOwn(publicItem, 'answerGuide'), false);
  assert.equal(Object.hasOwn(publicItem, 'rubric'), false);
  const authoredMcq = first.items.find((item) => item.id === 'module-check-1');
  assert.equal(authoredMcq.prompt, 'Which statement fits the water cycle?');
  assert.equal(authoredMcq.correctOptionIndex, 0);
  assert.equal(JSON.stringify(publicItem).includes('correctOption'), false);
});

test('a short reviewed course still gets a valid final assessment from its own approved objective', () => {
  const compiled = compiledManifest();
  const curriculum = assessmentCurriculumFromManifest(compiled.learnerManifest, 'final', 'en', { privateManifest: compiled.privateManifest });
  const bank = validateAssessmentBank(createFallbackAssessmentBank(curriculum), curriculum);
  assert.equal(bank.items.filter((item) => item.responseMode === 'open').length, 9);
  assert.equal(bank.items.filter((item) => item.responseMode === 'mcq').length, 12);
  assert.equal(bank.coverageMap.length, 1);
  assert.equal(bank.coverageMap[0].objectiveId, 'm01-water-cycle');
  assert.equal(bank.items.some((item) => item.prompt === 'What can rain do?'), true);
});

test('review routing stays tied to the reviewed manifest module rather than the legacy course', () => {
  const curriculum = assessmentCurriculumFromManifest(manifest(), 'final', 'en');
  const outcome = assessmentProgressDecision({
    curriculum,
    outcomes: [{ outcome: 'needs-review', askedObjectiveIds: ['m01-water-cycle'], demonstratedObjectiveIds: [], needsReviewObjectiveIds: ['m01-water-cycle'] }]
  });
  assert.equal(outcome.completionKind, 'review');
  assert.equal(outcome.reviewModuleIndex, 0);
  assert.equal(outcome.reviewFocusObjectiveId, 'm01-water-cycle');
  assert.equal(Object.hasOwn(outcome, 'score'), false);
});

test('final checks prioritise only unresolved reviewed objectives from module evidence', () => {
  const curriculum = {
    objectives: [{ id: 'm01-water' }, { id: 'm02-weather' }, { id: 'm03-rivers' }]
  };
  const focus = objectiveFocusFromModuleEvidence({
    curriculum,
    moduleRuns: [
      { outcomes: [{ outcome: 'needs-review', askedObjectiveIds: ['m02-weather'], demonstratedObjectiveIds: [], needsReviewObjectiveIds: ['m02-weather'] }] },
      { outcomes: [{ outcome: 'demonstrated', askedObjectiveIds: ['m01-water'], demonstratedObjectiveIds: ['m01-water'], needsReviewObjectiveIds: [] }] },
      // Demonstrated evidence supersedes an older review state for the same objective.
      { outcomes: [{ outcome: 'demonstrated', askedObjectiveIds: ['m02-weather'], demonstratedObjectiveIds: ['m02-weather'], needsReviewObjectiveIds: [] }] }
    ]
  });
  assert.deepEqual(focus.focusObjectiveIds, ['m03-rivers']);
  const order = prioritiseAssessmentItems({
    runId: 'reviewed-final-run',
    signals: { objectiveFocusIds: focus.focusObjectiveIds },
    items: [
      { id: 'known', responseMode: 'mcq', objectiveIds: ['m01-water'] },
      { id: 'gap', responseMode: 'open', objectiveIds: ['m03-rivers'] }
    ]
  });
  assert.equal(order[0], 'gap');
  assert.equal(JSON.stringify(focus).includes('score'), false);
});

test('a reviewed curriculum without a server-only key still has a subject-neutral deterministic reserve', () => {
  const curriculum = assessmentCurriculumFromManifest(manifest(), 0, 'en');
  const bank = validateAssessmentBank(createFallbackAssessmentBank(curriculum), curriculum);
  const copy = JSON.stringify(bank);
  assert.equal(bank.items.filter((item) => item.responseMode === 'open').length, 4);
  assert.equal(bank.items.filter((item) => item.responseMode === 'mcq').length, 5);
  assert.match(copy, /water|reviewed lesson/i);
  assert.doesNotMatch(copy, /diagnos|learner dignity|private information/i);
});

test('assessment recovery is explicitly bounded and requires a reviewed-module acknowledgement before a new run', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../../server/assessment-service.mjs', import.meta.url), 'utf8');
  assert.match(source, /latestReview && !latestReview\.reviewAcknowledgedAt/);
  assert.match(source, /ASSESSMENT_REVIEW_REQUIRED/);
  assert.match(source, /const acknowledgeReview = async/);
  assert.match(source, /reviewAcknowledged: completed/);
});

test('assessment outcomes share the 90-day consented-record lifecycle and reject an expired run', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../../server/assessment-service.mjs', import.meta.url), 'utf8');
  assert.match(source, /const retentionDays = \(\) =>/);
  assert.match(source, /const runExpiry =/);
  assert.match(source, /const trimExpiredRuns = async/);
  assert.match(source, /expiresAt: runExpiry\(\)/);
  assert.match(source, /ASSESSMENT_RUN_EXPIRED/);
  assert.match(source, /retentionField: 'expiresAt'/);
  assert.match(source, /filter\(\(summary\) => !isExpired\(summary\)\)/);
});

test('review candidates use one bounded AI deadline and transparently retain a valid reviewed-source reserve', async () => {
  const source = await readFile(new URL('../../server/assessment-service.mjs', import.meta.url), 'utf8');
  assert.match(source, /timeoutMs: 12_000/);
  assert.match(source, /createFallbackAssessmentBank\(curriculum\)/);
  assert.match(source, /provider: 'deterministic', model: 'reviewed-source-reserve'/);
  assert.match(source, /fallbackReason = 'model-generation-unavailable-or-invalid'/);
  assert.match(source, /generationMode: fallbackReason \? 'deterministic-fallback' : 'ai'/);
});

test('the server retains an objective-specific evidence trace without storing a learner answer or score', async () => {
  const source = await readFile(new URL('../../server/assessment-service.mjs', import.meta.url), 'utf8');
  const answerSection = source.slice(source.indexOf('const outcomes = ['), source.indexOf('const nextIndex =', source.indexOf('const outcomes = [')));

  assert.match(answerSection, /objectiveTermsMatched/);
  assert.doesNotMatch(answerSection, /(?:^|\n)\s*(?:answer|rawAnswer|score)\s*:/m);
});
