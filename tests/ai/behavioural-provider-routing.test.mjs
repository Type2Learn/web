import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../server/model-provider.mjs', import.meta.url), 'utf8');

const setEntries = (setName) => {
  const match = source.match(new RegExp(`const ${setName} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `${setName} should be declared`);
  return match[1];
};

test('behavioural preference wording routes Gemini-first with Nano-only fallback', () => {
  assert.match(setEntries('geminiFirstNanoFallbackPurposes'), /'adaptive-support'/);
  assert.doesNotMatch(setEntries('openAiPrimaryPurposes'), /'adaptive-support'/);
  assert.doesNotMatch(setEntries('miniPurposes'), /'adaptive-support'/);
});

test('assessment evaluation remains separately classified as a higher-complexity review task', () => {
  assert.match(setEntries('miniPurposes'), /'assessment-evaluation'/);
  assert.match(setEntries('openAiPrimaryPurposes'), /'assessment-evaluation'/);
});
