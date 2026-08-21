import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the release verifier enforces the agreed minimum of 748 passing tests', async () => {
  const verifier = await read('scripts/verify-release.mjs');
  assert.match(verifier, /const minimumPassingTests = 748/);
  assert.match(verifier, /Release gate blocked: found/);
  assert.match(verifier, /passed !== tests/);
});

test('the package exposes the release verification command', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.scripts.verify, 'node scripts/verify-release.mjs');
});

test('Render runs the full release verifier before deployment', async () => {
  const render = await read('render.yaml');
  assert.match(render, /buildCommand: npm ci && npm run verify/);
});

test('Render enables consent-gated learning features without exposing private publishing', async () => {
  const render = await read('render.yaml');
  for (const key of [
    'ADAPTIVE_LEARNING_ENABLED',
    'BEHAVIOUR_CONTEXT_ENABLED',
    'MASCOT_PARTNER_AI_ENABLED',
    'AI_ASSESSMENTS_ENABLED',
    'AI_VISUALS_ENABLED'
  ]) assert.match(render, new RegExp(`key: ${key}\\n\\s+value: ["']?true["']?`));
  assert.doesNotMatch(render, /key: COURSE_PUBLISHING_ENABLED/);
  assert.doesNotMatch(render, /key: EDUCATOR_WORKSPACE_ENABLED/);
});

test('the versioned pre-push hook invokes the same release verifier and is executable', async () => {
  const [hook, details] = await Promise.all([
    read('.githooks/pre-push'),
    stat(new URL('../../.githooks/pre-push', import.meta.url))
  ]);
  assert.match(hook, /npm run verify/);
  assert.ok(details.mode & 0o111, 'pre-push hook must be executable');
});
