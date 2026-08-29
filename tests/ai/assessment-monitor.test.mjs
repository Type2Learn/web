import assert from 'node:assert/strict';
import test from 'node:test';
import { assessmentLearningSignals, assessmentProgressDecision, prioritiseAssessmentItems } from '../../server/assessment-monitor.mjs';

test('assessment monitor prioritises explanation after a brief interaction without assigning a learner score', () => {
  const signals = assessmentLearningSignals({ metrics: { activeMs: 22_000, typingCharacters: 20, rereads: 0 }, support: {} });
  const ordered = prioritiseAssessmentItems({
    runId: 'stable-run', signals,
    items: [{ id: 'choice', responseMode: 'mcq' }, { id: 'explanation', responseMode: 'open' }]
  });
  assert.equal(signals.courseInteraction, 'brief');
  assert.deepEqual(ordered, ['explanation', 'choice']);
  assert.equal(Object.hasOwn(signals, 'score'), false);
});

test('assessment monitor returns one specific review route when objective evidence is incomplete', () => {
  const curriculum = { objectives: [{ id: 'm01-a' }, { id: 'm01-b' }] };
  const decision = assessmentProgressDecision({
    curriculum,
    outcomes: [{ outcome: 'demonstrated', demonstratedObjectiveIds: ['m01-a'], needsReviewObjectiveIds: [] }, { outcome: 'needs-review', demonstratedObjectiveIds: [], needsReviewObjectiveIds: ['m01-b'] }]
  });
  assert.equal(decision.completionKind, 'review');
  assert.equal(decision.reviewFocusObjectiveId, 'm01-b');
  assert.equal(decision.reviewModuleIndex, 0);
  assert.deepEqual(decision.missingObjectiveIds, ['m01-b']);
  assert.equal(Object.hasOwn(decision, 'score'), false);
});

test('assessment monitor accepts objective coverage without turning every question into a visible grade', () => {
  const curriculum = { objectives: [{ id: 'm02-a' }, { id: 'm02-b' }] };
  const decision = assessmentProgressDecision({
    curriculum,
    outcomes: [{ outcome: 'demonstrated', demonstratedObjectiveIds: ['m02-a', 'm02-b'], needsReviewObjectiveIds: [] }]
  });
  assert.equal(decision.completionKind, 'ready');
  assert.equal(decision.nextAction, 'continue');
  assert.deepEqual(decision.missingObjectiveIds, []);
});

test('assessment monitor routes an uncertain answer to the objective that was asked', () => {
  const decision = assessmentProgressDecision({
    curriculum: { objectives: [{ id: 'm01-a' }, { id: 'm03-c' }] },
    outcomes: [
      { outcome: 'demonstrated', demonstratedObjectiveIds: ['m01-a'], needsReviewObjectiveIds: [] },
      { outcome: 'uncertain', askedObjectiveIds: ['m03-c'], demonstratedObjectiveIds: [], needsReviewObjectiveIds: [] }
    ]
  });
  assert.equal(decision.completionKind, 'review');
  assert.equal(decision.reviewFocusObjectiveId, 'm03-c');
  assert.equal(decision.reviewModuleIndex, 2);
});

test('assessment monitor allows exactly two learner-led rechecks before retaining only the review route', () => {
  const input = {
    curriculum: { objectives: [{ id: 'm04-a' }] },
    outcomes: [{ outcome: 'needs-review', askedObjectiveIds: ['m04-a'], demonstratedObjectiveIds: [], needsReviewObjectiveIds: ['m04-a'] }]
  };
  const first = assessmentProgressDecision({ ...input, recheckNumber: 0, maxRechecks: 2 });
  const second = assessmentProgressDecision({ ...input, recheckNumber: 1, maxRechecks: 2 });
  const final = assessmentProgressDecision({ ...input, recheckNumber: 2, maxRechecks: 2 });
  assert.equal(first.recheckAvailable, true);
  assert.equal(second.recheckAvailable, true);
  assert.equal(final.recheckAvailable, false);
  assert.equal(final.nextAction, 'continue-with-review-note');
  assert.equal(Object.hasOwn(final, 'score'), false);
});

test('assessment monitor uses bounded navigation aggregates only to order reviewed question formats', () => {
  const revisiting = assessmentLearningSignals({
    metrics: { activeMs: 180_000, rereads: 1, readingSectionBacktracks: 2, scrollBacktracks: 1 },
    support: {}
  });
  const steady = assessmentLearningSignals({
    metrics: { activeMs: 180_000, rereads: 0, readingSectionBacktracks: 0, scrollBacktracks: 0 },
    support: {}
  });
  assert.equal(revisiting.navigationPattern, 'revisiting');
  assert.equal(steady.navigationPattern, 'direct');
  assert.equal(Object.hasOwn(revisiting, 'score'), false);
  assert.equal(Object.hasOwn(revisiting, 'learnerLabel'), false);
});

test('assessment monitor treats typing re-entry as a reason to place an approved open question first', () => {
  const signals = assessmentLearningSignals({
    metrics: { activeMs: 180_000, typingBursts: 9, typingFocusReturns: 2 },
    support: {}
  });
  const ordered = prioritiseAssessmentItems({
    runId: 're-entry-run', signals,
    items: [{ id: 'choice', responseMode: 'mcq' }, { id: 'explanation', responseMode: 'open' }]
  });
  assert.equal(signals.expressionPattern, 're-entering');
  assert.equal(ordered[0], 'explanation');
  assert.equal(Object.hasOwn(signals, 'answer'), false);
});

test('a realistic bounded module summary can order an approved quiz without changing its evidence decision', () => {
  const summary = {
    metrics: {
      activeMs: 7 * 60 * 1000,
      rereads: 2,
      readingSectionBacktracks: 2,
      scrollBacktracks: 3,
      typingBursts: 10,
      typingFocusReturns: 3
    },
    support: { textToSpeech: true, visualOpened: true },
    behaviour: { states: ['re-reading', 'working-through-typing'] }
  };
  const signals = assessmentLearningSignals(summary);
  const ordered = prioritiseAssessmentItems({
    runId: 'realistic-module-summary',
    signals,
    items: [
      { id: 'reviewed-open', responseMode: 'open', objectiveIds: ['m01-a'] },
      { id: 'reviewed-mcq', responseMode: 'mcq', objectiveIds: ['m01-a'] }
    ]
  });
  const decision = assessmentProgressDecision({
    curriculum: { objectives: [{ id: 'm01-a' }] },
    outcomes: [{ outcome: 'demonstrated', demonstratedObjectiveIds: ['m01-a'], needsReviewObjectiveIds: [] }]
  });

  assert.equal(signals.navigationPattern, 'revisiting');
  assert.equal(signals.expressionPattern, 're-entering');
  assert.equal(signals.supportState, 'expression');
  assert.deepEqual(ordered, ['reviewed-mcq', 'reviewed-open']);
  assert.equal(decision.completionKind, 'ready');
  assert.equal(Object.hasOwn(decision, 'behaviourScore'), false);
  assert.equal(JSON.stringify(signals).includes('rawAnswer'), false);
});
