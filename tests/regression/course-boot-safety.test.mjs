import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const coursePlayer = await readFile(new URL('../../course/course.js', import.meta.url), 'utf8');

test('course startup has no dangling realtime dictation assignment before its runtime is created', () => {
  const narrationGuard = coursePlayer.match(/const hasLocalAvaNarration = \(\) =>[\s\S]*?\n\s*\}\);/);
  assert.ok(narrationGuard, 'the local narration guard should remain present');
  assert.doesNotMatch(narrationGuard[0], /\brealtime\./, 'startup narration checks must not reference a later realtime client');
  assert.match(coursePlayer, /\n\s*const finalExam = \(\) => COURSE\.finalExam/, 'course startup should continue directly into course helpers');
});
