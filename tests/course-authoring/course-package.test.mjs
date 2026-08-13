import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { backupsComplete } from '../../server/course-backup-service.mjs';
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

test('publication backup gate requires all services and an acknowledged ZIP download', () => {
  const verified = { verified: true };
  assert.equal(backupsComplete({ firebase: verified, github: verified, supabase: verified, zip: { verified: true, downloadedAt: '2026-08-13T00:00:00.000Z' } }), true);
  assert.equal(backupsComplete({ firebase: verified, github: verified, supabase: verified, zip: { verified: true, downloadedAt: '' } }), false);
  assert.equal(backupsComplete({ firebase: verified, github: verified, supabase: { verified: false }, zip: { verified: true, downloadedAt: 'now' } }), false);
  assert.equal(backupsComplete({ firebase: verified, github: {}, supabase: verified, zip: { verified: true, downloadedAt: 'now' } }), false);
});
