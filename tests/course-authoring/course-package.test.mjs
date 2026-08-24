import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { backupsComplete, writeGithubBackupSet } from '../../server/course-backup-service.mjs';
import { createCoursePackage } from '../../server/course-package.mjs';

const entries = [
  { name: 'course.md', content: '# Course\nA reviewed course.' },
  { name: 'learner-manifest.json', content: '{"courseId":"demo"}' }
];

test('course package is a deterministic, standards-compatible ZIP archive', () => {
  const first = createCoursePackage(entries);
  const second = createCoursePackage(entries);
  assert.equal(first.archive.subarray(0, 4).toString('hex'), '504b0304');
  assert.equal(first.archive.subarray(-22, -18).toString('hex'), '504b0506');
  assert.deepEqual(first.archive, second.archive);
  assert.equal(first.sha256, createHash('sha256').update(first.archive).digest('hex'));
  assert.equal(first.checksums['course.md'], createHash('sha256').update(entries[0].content).digest('hex'));
});

test('course package rejects unsafe, empty, or duplicate entries', () => {
  assert.throws(() => createCoursePackage([{ name: '../private.txt', content: 'no' }]));
  assert.throws(() => createCoursePackage([{ name: 'empty.txt', content: '' }]));
  assert.throws(() => createCoursePackage([{ name: 'a.txt', content: 'one' }, { name: 'a.txt', content: 'two' }]));
});

test('publication gate accepts verified GitHub and Supabase receipts with an acknowledged ZIP while Firebase is optional', () => {
  const verified = { verified: true };
  const acknowledgedZip = { verified: true, downloadedAt: '2026-08-13T00:00:00.000Z' };
  assert.equal(backupsComplete({ firebase: { verified: false, optional: true }, github: verified, supabase: verified, zip: acknowledgedZip }), true);
  assert.equal(backupsComplete({ firebase: verified, github: verified, supabase: verified, zip: { verified: true, downloadedAt: '' } }), false);
  assert.equal(backupsComplete({ firebase: verified, github: verified, supabase: { verified: false }, zip: { verified: true, downloadedAt: 'now' } }), false);
  assert.equal(backupsComplete({ firebase: verified, github: {}, supabase: verified, zip: { verified: true, downloadedAt: 'now' } }), false);
});

test('strict Firebase policy remains available once the private bucket is provisioned', () => {
  const verified = { verified: true };
  const acknowledgedZip = { verified: true, downloadedAt: '2026-08-13T00:00:00.000Z' };
  assert.equal(backupsComplete({ firebase: { verified: false }, github: verified, supabase: verified, zip: acknowledgedZip }, { firebaseRequired: true }), false);
  assert.equal(backupsComplete({ firebase: verified, github: verified, supabase: verified, zip: acknowledgedZip }, { firebaseRequired: true }), true);
});

test('GitHub release receipts are written serially to avoid same-branch Contents API conflicts', async () => {
  let active = 0;
  let highestActive = 0;
  const calls = [];
  const request = async ({ path }) => {
    active += 1;
    highestActive = Math.max(highestActive, active);
    calls.push(path);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return { path, sha: 'test', checksum: 'test' };
  };
  const result = await writeGithubBackupSet({
    config: {}, prefix: 'courses/demo/1.0.0/hash', courseId: 'demo', version: '1.0.0',
    markdown: Buffer.from('course'), learner: Buffer.from('{}'), privateManifest: Buffer.from('{}'), request
  });
  assert.equal(highestActive, 1);
  assert.deepEqual(calls, [
    'courses/demo/1.0.0/hash/course.md',
    'courses/demo/1.0.0/hash/learner-manifest.json',
    'courses/demo/1.0.0/hash/private-authoring-manifest.json'
  ]);
  assert.equal(result.length, 3);
});
