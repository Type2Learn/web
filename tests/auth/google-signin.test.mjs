import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve('.');

test('Google sign-in uses popup auth with persistence prepared before the user gesture', async () => {
  const source = await readFile(path.join(root, 'firebase-auth.js'), 'utf8');
  const googleFlow = source.slice(source.indexOf("document.querySelectorAll('[data-google-auth]')"));
  const persistence = googleFlow.indexOf('await setPersistence(auth, persistence);');
  const popup = googleFlow.indexOf('await signInWithPopup(auth, provider);');

  assert.match(googleFlow, /signInWithPopup/);
  assert.doesNotMatch(googleFlow, /signInWithRedirect/);
  assert.ok(persistence >= 0 && popup > persistence, 'persistence must be selected before opening Google sign-in');
});
