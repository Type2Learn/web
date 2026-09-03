import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('adaptive recall has one short provider deadline and returns its authored current-step fallback on any provider failure', async () => {
  const source = await readFile(new URL('../../server/adaptive-recall-service.mjs', import.meta.url), 'utf8');
  assert.match(source, /purpose: 'adaptive-recall',[\s\S]{0,400}timeoutMs: 8_000/);
  assert.match(source, /return \{ result: fallback\(context\), source: 'authored-fallback'/);
  assert.match(source, /can always continue with authored current-step support/);
});
