import assert from 'node:assert/strict';
import test from 'node:test';
import { ADAPTIVE_POLICY_VERSION, adaptiveCandidateForSummary } from '../../server/adaptive-policy.mjs';

test('adaptive policy offers one reversible readability control after extended reading', () => {
  const candidate = adaptiveCandidateForSummary({
    phase: 'read',
    metrics: { activeMs: 12 * 60 * 1000, rereads: 2, typingLongestPauseMs: 0, ttsStarts: 0 }
  });
  assert.equal(ADAPTIVE_POLICY_VERSION, 3);
  assert.deepEqual(candidate?.preference, { key: 'reading-width', value: 'narrow' });
});

test('adaptive policy prefers a single first-step offer rather than stacking changes', () => {
  const candidate = adaptiveCandidateForSummary({
    phase: 'read',
    metrics: {
      firstActionMs: 100_000,
      activeMs: 20 * 60 * 1000,
      typingLongestPauseMs: 60_000,
      aiRequests: 7,
      returns: 3,
      rereads: 2
    }
  });
  assert.equal(candidate?.id, 'start-one-small-step');
});

test('adaptive policy has eight matched-signal routes, each proposing one reversible support only', () => {
  const scenarios = [
    [{ phase: 'read', metrics: { firstActionMs: 100_000, returns: 1 } }, 'start-one-small-step'],
    [{ phase: 'read', metrics: { aiActiveMs: 6 * 60_000, aiRequests: 3 } }, 'return-from-ai-one-step'],
    [{ phase: 'type', metrics: { typingLongestPauseMs: 50_000, typingAbandons: 1 } }, 'layout-open'],
    [{ phase: 'read', metrics: { activeMs: 9 * 60_000, rereads: 2 } }, 'reading-width-narrow'],
    [{ phase: 'read', metrics: { activeMs: 9 * 60_000, readingSectionMoves: 3, ttsStarts: 0 } }, 'text-to-speech-on'],
    [{ phase: 'type', metrics: { returns: 2, taskRevisits: 1 } }, 'encouragement-balanced'],
    [{ phase: 'read', metrics: { activeMs: 9 * 60_000, scrollBacktracks: 3 } }, 'reading-spacing-relaxed'],
    [{ phase: 'read', metrics: { visualActiveMs: 45_000, visualCloses: 1 } }, 'reading-surface-soft-blue']
  ];
  assert.deepEqual(scenarios.map(([summary]) => adaptiveCandidateForSummary(summary)?.id), scenarios.map(([, id]) => id));
  scenarios.forEach(([summary]) => {
    const candidate = adaptiveCandidateForSummary(summary);
    assert.equal(Object.hasOwn(candidate, 'score'), false);
    assert.equal(Object.hasOwn(candidate, 'learnerLabel'), false);
    assert.ok(candidate.kind === 'preference' || candidate.kind === 'task-initiation');
  });
});
