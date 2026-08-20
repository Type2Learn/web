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
