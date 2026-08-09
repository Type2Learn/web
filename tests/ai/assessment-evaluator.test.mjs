import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicAssessmentEvaluation, constrainAssessmentEvaluation } from '../../server/assessment-evaluator.mjs';

const curriculum = { source: 'ADHD can affect attention, planning, memory, time management, and impulse control. Clear written instructions and smaller steps can support participation.' };
const item = { objectiveIds: ['m01-attention-support'], answerGuide: 'Explain a respectful support for task management.', rubric: ['Use a course-grounded support.', 'Keep learner choice visible.'] };

test('deterministic assessment evaluator recognises a substantive course-grounded response without storing it', () => {
  const result = deterministicAssessmentEvaluation({ item, curriculum, answer: 'Clear written instructions and smaller planning steps can support attention and task management while keeping the learner in control.' });
  assert.equal(result.outcome, 'demonstrated');
  assert.equal(result.demonstratedObjectiveIds[0], 'm01-attention-support');
  assert.equal(result.signal.courseGrounding, 'strong');
});

test('deterministic evaluator sends an unrelated response to calm review rather than inventing success', () => {
  const result = deterministicAssessmentEvaluation({ item, curriculum, answer: 'My favourite colour is blue and I enjoy walking outside with friends every weekend.' });
  assert.equal(result.outcome, 'needs-review');
  assert.deepEqual(result.needsReviewObjectiveIds, ['m01-attention-support']);
});

test('model output cannot promote a response that is too small to assess', () => {
  const deterministic = deterministicAssessmentEvaluation({ item, curriculum, answer: 'help please' });
  const result = constrainAssessmentEvaluation({ candidate: { outcome: 'demonstrated', demonstratedObjectiveIds: ['m01-attention-support'], needsReviewObjectiveIds: [], feedback: 'You showed the idea clearly.' }, deterministic, item });
  assert.equal(result.outcome, 'uncertain');
});
