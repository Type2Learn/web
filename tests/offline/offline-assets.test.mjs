import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CORE_SHELL_URLS, LEARNING_PACKAGE_URLS, OFFLINE_CACHE_VERSION, allOfflineUrls } from '../../offline-assets.js';

test('offline cache has a versioned namespace', () => assert.match(OFFLINE_CACHE_VERSION, /^type2learn-offline-v\d+$/));
test('offline asset list has no duplicate URLs', () => assert.equal(allOfflineUrls().length, new Set(allOfflineUrls()).size));
test('offline asset list contains the public landing shell', () => assert.ok(CORE_SHELL_URLS.includes('/')));
test('offline asset list includes the public participation and co-design record', () => {
  assert.ok(CORE_SHELL_URLS.includes('/participation-trust/'));
  assert.ok(CORE_SHELL_URLS.includes('/co-design/'));
  assert.ok(CORE_SHELL_URLS.includes('/ur/co-design/'));
});
test('offline asset list includes the current course entry', () => assert.ok(LEARNING_PACKAGE_URLS.includes('/course/')));
test('offline asset list includes both course language payloads', () => {
  assert.ok(LEARNING_PACKAGE_URLS.includes('/course/course-content.js'));
  assert.ok(LEARNING_PACKAGE_URLS.includes('/course/course-urdu.js'));
});
test('offline asset list includes all three background noise loops', () => {
  ['pink', 'white', 'brown'].forEach((type) => assert.ok(LEARNING_PACKAGE_URLS.includes(`/assets/audio/background-noise/${type}-noise-loop.mp3`)));
});
test('offline asset list contains no API routes', () => assert.equal(allOfflineUrls().some((url) => url.startsWith('/api/')), false));
test('offline asset list contains no private teacher or admin workspace', () => assert.equal(allOfflineUrls().some((url) => /(^|\/)admin|teacher|institute/.test(url)), false));
test('offline asset list does not include authentication secrets', () => assert.equal(allOfflineUrls().some((url) => /token|secret|\.env/i.test(url)), false));
test('offline worker keeps API responses out of Cache Storage', async () => {
  const worker = await readFile(new URL('../../service-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
});
test('offline worker has a navigation fallback page', async () => {
  const worker = await readFile(new URL('../../service-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /caches\.match\('\/offline\.html'\)/);
});
test('offline worker uses query-insensitive cache matching for versioned modules', async () => {
  const worker = await readFile(new URL('../../service-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /ignoreSearch: true/);
});
test('offline client has no automatic download action', async () => {
  const client = await readFile(new URL('../../offline-client.js', import.meta.url), 'utf8');
  assert.doesNotMatch(client, /void\s+downloadLearningForOffline\(/);
});
test('offline client requires a user-facing download request message', async () => {
  const client = await readFile(new URL('../../offline-client.js', import.meta.url), 'utf8');
  assert.match(client, /DOWNLOAD_LEARNING_PACKAGE/);
});
