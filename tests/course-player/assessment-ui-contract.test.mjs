import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../course/course.js', import.meta.url), 'utf8');

test('open understanding-check answers offer editable browser speech input without a target text', () => {
  assert.match(source, /data-action="assessment-dictation"/);
  assert.match(source, /Your spoken words appear here for you to review and edit before submitting/);
  assert.match(source, /There is no target text, timer, or score/);
  assert.match(source, /recognition\.lang = courseUsesUrdu\(\) \? 'ur-PK' : 'en-US'/);
});

test('assessment speech writes only the editable response rather than raw behavioural telemetry', () => {
  const dictation = source.slice(source.indexOf('const startAssessmentDictation'), source.indexOf('const renderUnderstandingCheck'));
  assert.match(dictation, /understandingCheck\.response/);
  assert.doesNotMatch(dictation, /recordUnifiedBehaviourAction\('typing'/);
  assert.doesNotMatch(dictation, /telemetry\.action\('assessment-answer'/);
  assert.match(dictation, /recordUnifiedBehaviourAction\('speech-start'\)/);
  assert.match(dictation, /recordUnifiedBehaviourAction\('speech-complete'\)/);
});

test('assessment typing contributes only bounded rhythm aggregates to the unified context', () => {
  const inputHandler = source.slice(source.indexOf("if (event.target.matches('[data-assessment-response]'))"), source.indexOf("if (!event.target.matches('[data-typing-input]')) return;"));
  assert.match(inputHandler, /insertedLength/);
  assert.match(inputHandler, /removedLength/);
  assert.match(inputHandler, /pauseMs/);
  assert.match(inputHandler, /recordUnifiedBehaviourAction\('typing', aggregate\)/);
  assert.doesNotMatch(inputHandler, /response:\s*nextResponse/);
  assert.doesNotMatch(inputHandler, /telemetry\.action\('assessment-answer'/);
});

test('all consented course surfaces enter behaviour data through one aggregate-only helper', () => {
  assert.match(source, /const recordUnifiedBehaviourAction = \(kind, detail = \{\}\) => \{/);
  assert.match(source, /adaptiveLearning\.telemetry\?\.action\(kind, detail\)/);
  assert.match(source, /recordBehaviourAction\(kind, detail\)/);
  assert.match(source, /recordUnifiedBehaviourAction\('ai-open'\)/);
  assert.match(source, /recordUnifiedBehaviourAction\('tts-start'\)/);
  assert.match(source, /recordUnifiedBehaviourAction\('visual-open'\)/);
  assert.match(source, /recordUnifiedBehaviourAction\('typing-retry'\)/);
});

test('the guarded understanding-check route takes precedence over the older reviewed final screen', () => {
  const finalRoute = source.slice(source.indexOf('const startNextStep = () =>'), source.indexOf('const isGuestModuleNavigationAvailable'));
  const protectedIndex = finalRoute.indexOf("if (understandingChecksAvailable())");
  const legacyFallbackIndex = finalRoute.indexOf('else if (reviewedManifestFinalAvailable())');
  assert.equal(protectedIndex >= 0, true);
  assert.equal(legacyFallbackIndex > protectedIndex, true);
  assert.match(finalRoute, /openUnderstandingCheck\(\{ scope: 'final' \}\)/);
  assert.match(finalRoute, /startFinalExam\(\);/);
});

test('a targeted review keeps the saved no-score assessment available for its bounded recheck', () => {
  assert.match(source, /const returnToUnderstandingCheck = async \(\) =>/);
  assert.match(source, /data-action="return-to-understanding-check"/);
  assert.match(source, /acknowledgeUnderstandingReview/);
  assert.match(source, /case 'return-to-understanding-check': void returnToUnderstandingCheck\(\);/);
  assert.match(source, /state\.progress\.phase = 'assessment';/);
});

test('reviewed teacher-created courses produce the same compact module summary before their assessment', () => {
  const completeReviewed = source.slice(source.indexOf('const completeReviewedModule = () =>'), source.indexOf('const continueCheck = () =>'));
  assert.match(completeReviewed, /void finishAdaptiveModuleSummary\(\)/);
  assert.match(completeReviewed, /courseId \+ courseVersion/);
  const review = source.slice(source.indexOf('const reviewUnderstandingModule = () =>'), source.indexOf('const restartUnderstandingCheck = () =>'));
  assert.match(review, /recordUnifiedBehaviourAction\('reread'\)/);
  assert.match(review, /recordUnifiedBehaviourAction\('return'\)/);
});

test('a live understanding check is the next module gate, while save-and-exit stays available', () => {
  const completion = source.slice(source.indexOf('const completeTask = () =>'), source.indexOf('const finalModuleCompleteTask ='));
  assert.match(completion, /Continue to understanding check/);
  assert.match(completion, /const nextStepAction = assessmentAction\s*\? ''/);
  assert.match(completion, /data-action="save-exit"/);
  assert.match(completion, /one calm understanding check before the next module/);
});

test('a review outcome cannot use the ordinary finish action to bypass a targeted revisit', () => {
  const finish = source.slice(source.indexOf('const finishUnderstandingCheck = () =>'), source.indexOf('const reviewUnderstandingModule = () =>'));
  assert.match(finish, /understandingCheck\.run\?\.completionKind === 'review'/);
  assert.match(finish, /reviewUnderstandingModule\(\);/);
  const completedMarkup = source.slice(source.indexOf('const understandingCheckTask = () =>'), source.indexOf('const completeTask = () =>'));
  assert.match(completedMarkup, /const completionAction = needsReview/);
  assert.match(completedMarkup, /data-action="review-understanding-module"/);
  assert.match(completedMarkup, /run\.recheckAvailable[\s\S]{0,320}data-action="restart-understanding-check"/);
});
