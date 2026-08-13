import assert from 'node:assert/strict';
import test from 'node:test';
import { learnerCourseProjection, splitCourseKey, visibleToAccount } from '../../server/course-catalog-service.mjs';

const base = (overrides = {}) => ({
  courseId: 'course-alpha', version: '1.0.0', status: 'published', requestedAudience: 'organisation', ownerOrganisationId: 'org-one',
  title: { en: 'Alpha', ur: 'الف' }, learnerManifest: { label: { en: 'Theory', ur: 'نظریہ' }, modules: [{}, {}] }, ...overrides
});
const learner = { uid: 'learner-a', roles: ['learner'], organisations: [{ organisationId: 'org-one', active: true }] };

test('catalogue only exposes published learner-safe records to their eligible audience', () => {
  assert.equal(visibleToAccount(base(), learner), true);
  assert.equal(visibleToAccount(base({ ownerOrganisationId: 'other' }), learner), false);
  assert.equal(visibleToAccount(base({ status: 'approved' }), learner), false);
  assert.equal(visibleToAccount(base({ requestedAudience: 'platform' }), { uid: 'another', roles: ['learner'], organisations: [] }), true);
  assert.equal(visibleToAccount(base({ distribution: { mode: 'assigned', learnerIds: ['learner-a'] } }), learner), true);
  assert.equal(visibleToAccount(base({ distribution: { mode: 'assigned', learnerIds: ['other'] } }), learner), false);
});

test('learner catalogue projection never carries source material, review notes, answer keys, or roster IDs', () => {
  const projected = learnerCourseProjection(base({ privateManifest: { answerKeys: { modules: [] } }, markdown: '# private', source: { objectPath: 'private' }, distribution: { learnerIds: ['learner-a'] } }));
  assert.deepEqual(Object.keys(projected).sort(), ['availability', 'courseId', 'label', 'modules', 'narration', 'status', 'title', 'type', 'version']);
  assert.equal(projected.modules, 2);
  assert.equal(JSON.stringify(projected).includes('learner-a'), false);
  assert.equal(JSON.stringify(projected).includes('answerKeys'), false);
});

test('progress course keys are versioned for authored courses and preserve the existing legacy course route', () => {
  assert.deepEqual(splitCourseKey('course-alpha@1.0.0'), { courseId: 'course-alpha', version: '1.0.0' });
  assert.deepEqual(splitCourseKey('course-1-neurodivergent-conditions-v2'), { courseId: 'course-1-neurodivergent-conditions-v2', version: '' });
  assert.equal(splitCourseKey('course-alpha@wrong'), null);
  assert.equal(splitCourseKey('../course-alpha@1.0.0'), null);
});
