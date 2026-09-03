import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('adaptive proposal wording has one short model deadline and therefore always retains authored fallback wording', async () => {
  const source = await readFile(new URL('../../server/adaptive-support-service.mjs', import.meta.url), 'utf8');
  assert.match(source, /purpose: 'adaptive-support',[\s\S]{0,700}timeoutMs: 8_000/);
  assert.match(source, /catch \{\s*return fallback;/);
  assert.match(source, /deterministic policy selects the setting/);
});
