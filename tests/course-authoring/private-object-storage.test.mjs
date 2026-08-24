import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadPrivateObject, privateStorageStatus, signedPrivateObjectUrl, uploadPrivateObject } from '../../server/private-object-storage.mjs';

const config = {
  supabaseBackupUrl: 'https://private-store.example',
  supabaseBackupServiceKey: 'server-only-test-key',
  supabaseBackupBucket: 'type2learn-course-backups'
};

test('private course files fall back to Supabase when Firebase Storage is configured but its bucket is unavailable', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || 'GET' });
    return new Response('', { status: 200 });
  });
  const firebase = {
    available: true,
    storage: { file: () => ({ save: async () => { throw new Error('bucket unavailable'); } }) }
  };
  const saved = await uploadPrivateObject({
    firebase,
    config,
    objectPath: 'private-course-sources/org-one/source.txt',
    content: Buffer.from('reviewed source'),
    contentType: 'text/plain'
  });
  assert.equal(saved.provider, 'supabase');
  assert.equal(saved.firebaseUnavailable, true);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /private-course-sources\/org-one\/source\.txt$/);
  assert.equal(privateStorageStatus({ firebase, config }).available, true);
});

test('Supabase private objects download through server credentials and never require a public bucket', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(Buffer.from('private file'), { status: 200 }));
  const result = await downloadPrivateObject({
    firebase: { available: true },
    config,
    provider: 'supabase',
    objectPath: 'private-course-sources/org-one/source.txt'
  });
  assert.equal(result.toString(), 'private file');
});

test('Supabase narration is exposed only through a short-lived signed URL', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ signedURL: '/object/sign/type2learn-course-backups/private-course-audio/a.mp3?token=opaque' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const url = await signedPrivateObjectUrl({
    firebase: { available: true },
    config,
    provider: 'supabase',
    objectPath: 'private-course-audio/a.mp3',
    expiresAt: new Date(Date.now() + 60_000)
  });
  assert.match(url, /^https:\/\/private-store\.example\/storage\/v1\/object\/sign\//);
  assert.match(url, /token=opaque$/);
});
