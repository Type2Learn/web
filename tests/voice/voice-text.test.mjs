import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicaliseSpokenTyping, normaliseText } from '../../course/voice-text.js';

test('deterministic speech fixer restores the authored visible typing reference', () => {
  const target = 'ADHD is a neurodevelopmental condition.';
  assert.deepEqual(canonicaliseSpokenTyping('A D H D is a neurodevelopmental condition', target), { value: target, corrected: true });
  assert.deepEqual(canonicaliseSpokenTyping('ADHD is a neurodevelopmental condition', target), { value: target, corrected: true });
});

test('deterministic speech fixer does not invent a target from an unrelated transcript', () => {
  const target = 'ADHD is a neurodevelopmental condition.';
  assert.deepEqual(canonicaliseSpokenTyping('Please choose the answer for me', target), {
    value: 'Please choose the answer for me',
    corrected: false
  });
  assert.equal(normaliseText('  one\n\nclear   step  '), 'one clear step');
});
