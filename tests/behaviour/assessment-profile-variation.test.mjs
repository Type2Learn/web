import assert from 'node:assert/strict';
import test from 'node:test';
import { assessmentLearningSignals, prioritiseAssessmentItems } from '../../server/assessment-monitor.mjs';

// These profiles model only compact, consented course aggregates. They are
// deliberately not learner labels, not raw answers, and not scores. Every
// profile receives the exact same reviewed items; its signals may only change
// their order and whether an open response or MCQ is introduced earlier.
const reviewedItems = [
  { id: 'open-sir-syed', responseMode: 'open', objectiveIds: ['m01-sir-syed'] },
  { id: 'mcq-sir-syed', responseMode: 'mcq', objectiveIds: ['m01-sir-syed'] },
  { id: 'open-aligarh', responseMode: 'open', objectiveIds: ['m01-aligarh'] },
  { id: 'mcq-aligarh', responseMode: 'mcq', objectiveIds: ['m01-aligarh'] },
  { id: 'open-language', responseMode: 'open', objectiveIds: ['m01-language'] },
  { id: 'mcq-language', responseMode: 'mcq', objectiveIds: ['m01-language'] },
  { id: 'mcq-education', responseMode: 'mcq', objectiveIds: ['m01-education'] },
  { id: 'mcq-context', responseMode: 'mcq', objectiveIds: ['m01-context'] },
  { id: 'mcq-connection', responseMode: 'mcq', objectiveIds: ['m01-connection'] }
];

const profiles = [
  { name: 'brief-direct', metrics: { activeMs: 30_000 } },
  { name: 'brief-quick-expression', metrics: { activeMs: 50_000, typingCharacters: 320 } },
  { name: 'extended-rereading', metrics: { activeMs: 9 * 60_000, rereads: 3, readingSectionBacktracks: 2 } },
  { name: 'typing-pause-retry', metrics: { activeMs: 180_000, typingLongestPauseMs: 60_000, typingFocusReturns: 3, typingBursts: 9 } },
  { name: 'read-aloud-route', metrics: { activeMs: 240_000, typingCharacters: 80 }, support: { textToSpeech: true } },
  { name: 'visual-route', metrics: { activeMs: 360_000, visualActiveMs: 30_000 }, support: { visualOpened: true } },
  { name: 'returned-to-task', metrics: { activeMs: 300_000, taskRevisits: 3, returns: 2 } },
  { name: 'presentation-adjusted', metrics: { activeMs: 360_000, textPresentationChanges: 2, inputMethodChanges: 1 } },
  { name: 'support-accepted', metrics: { activeMs: 260_000, supportOfferAcceptances: 2 } },
  { name: 'support-dismissed', metrics: { activeMs: 220_000, supportOfferDismissals: 2 } },
  { name: 'response-revisions', metrics: { activeMs: 210_000, assessmentResponseRevisions: 4, typingFocusReturns: 2 } },
  { name: 'steady-completion', metrics: { activeMs: 420_000, typingCharacters: 140 } }
];

test('twelve consented interaction profiles keep a reviewed bank intact while producing reproducible, meaningfully varied question routes', () => {
  const expectedIds = reviewedItems.map((item) => item.id).sort();
  const orders = profiles.map((profile, index) => {
    const signals = assessmentLearningSignals({
      metrics: profile.metrics,
      support: profile.support || {},
      behaviour: profile.behaviour || { states: [] }
    });
    const runId = `profile-demo-${String(index + 1).padStart(2, '0')}`;
    const order = prioritiseAssessmentItems({ items: reviewedItems, runId, signals });
    assert.deepEqual([...order].sort(), expectedIds, `${profile.name} must retain every reviewed item`);
    assert.deepEqual(
      prioritiseAssessmentItems({ items: reviewedItems, runId, signals }),
      order,
      `${profile.name} must be reproducible for a saved run`
    );
    return order.join('|');
  });
  assert.equal(new Set(orders).size, profiles.length, 'each controlled demonstration profile receives a distinct reviewed-item sequence');
});
