import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('guest module navigation is scoped to guests and replaces course-level skipping', async () => {
  const source = await readFile(new URL('../../course/course.js', import.meta.url), 'utf8');
  assert.match(source, /const isGuestModuleNavigationAvailable = \(\) => Boolean\(\s*authenticatedUser\?\.isGuest/);
  assert.match(source, /skip\.dataset\.action = 'guest-skip-module'/);
  assert.match(source, /previous\.dataset\.action = 'guest-previous-module'/);
  assert.match(source, /actions\.insertBefore\(navigation, primaryAction \|\| null\)/);
  assert.doesNotMatch(source, /data-action="skip-course"/);
});

test('guest module navigation preserves an in-progress module before moving away', async () => {
  const source = await readFile(new URL('../../course/course.js', import.meta.url), 'utf8');
  assert.match(source, /moduleSnapshots/);
  assert.match(source, /storeActiveGuestModuleSnapshot\(\);\s*restoreGuestModuleSnapshot\(nextIndex\)/);
});
