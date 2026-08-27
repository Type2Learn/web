import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicaliseSpokenTyping, canonicaliseSpokenTypingPrefix, normaliseText } from '../../course/voice-text.js';

test('deterministic speech fixer restores the authored visible typing reference', () => {
  const target = 'ADHD is a neurodevelopmental condition.';
  assert.deepEqual(canonicaliseSpokenTyping('A D H D is a neurodevelopmental condition', target), { value: target, corrected: true });
  assert.deepEqual(canonicaliseSpokenTyping('ADHD is a neurodevelopmental condition', target), { value: target, corrected: true });
  // A recogniser often inserts a word break in a compound. This is a close
  // mechanical match to the already-visible target, so restoring the authored
  // sentence is safe and preserves the green character feedback.
  assert.deepEqual(canonicaliseSpokenTyping('A D H D is a neuro developmental condition', target), { value: target, corrected: true });
});

test('deterministic speech fixer does not invent a target from an unrelated transcript', () => {
  const target = 'ADHD is a neurodevelopmental condition.';
  assert.deepEqual(canonicaliseSpokenTyping('Please choose the answer for me', target), {
    value: 'Please choose the answer for me',
    corrected: false
  });
  assert.equal(normaliseText('  one\n\nclear   step  '), 'one clear step');
});

test('live spoken prefixes use authored characters so individual words turn green', () => {
  const target = 'ADHD is a neurodevelopmental condition.';
  assert.deepEqual(canonicaliseSpokenTypingPrefix('A D H D is a', target), { value: 'ADHD is a ', aligned: true });
  assert.deepEqual(canonicaliseSpokenTypingPrefix('ADHD is a neurodevelopmental', target), { value: 'ADHD is a neurodevelopmental ', aligned: true });
  assert.deepEqual(canonicaliseSpokenTypingPrefix('ADHD is a different thing', target), { value: 'ADHD is a different thing', aligned: false });
});
