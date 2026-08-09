import assert from 'node:assert/strict';
import test from 'node:test';
import { ADAPTIVE_POLICY_VERSION, adaptiveCandidateForSummary } from '../../server/adaptive-policy.mjs';

test('adaptive policy offers one reversible readability control after extended reading', () => {
  const candidate = adaptiveCandidateForSummary({
    phase: 'read',
    metrics: { activeMs: 12 * 60 * 1000, typingLongestPauseMs: 0, ttsStarts: 0 }
  });
  assert.equal(ADAPTIVE_POLICY_VERSION, 2);
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
