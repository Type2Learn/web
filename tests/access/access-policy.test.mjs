import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_KINDS,
  COURSE_TYPE_OPTIONS,
  PLATFORM_ROLES,
  canCreateCode,
  canSeeOrganisation,
  codeRoleForKind,
  isTheoryCourseType,
  normaliseRoles,
  publicAccount
} from '../../server/access-policy.mjs';

test('access policy has only the defined private workspace roles and code kinds', () => {
  assert.deepEqual(PLATFORM_ROLES, ['platform-admin', 'institute-owner', 'teacher', 'learner']);
  assert.deepEqual(CODE_KINDS, ['teacher', 'institute-owner', 'learner']);
  assert.equal(codeRoleForKind('teacher'), 'teacher');
  assert.equal(codeRoleForKind('institute-owner'), 'institute-owner');
  assert.equal(codeRoleForKind('learner'), 'learner');
  assert.equal(codeRoleForKind('admin'), '');
});

test('role normalisation removes invalid and duplicate values', () => {
  assert.deepEqual(normaliseRoles(['teacher', 'teacher', '', 'admin', 'learner']), ['teacher', 'learner']);
  assert.deepEqual(normaliseRoles(null), []);
  assert.deepEqual(normaliseRoles([' platform-admin ', 'institute-owner']), ['platform-admin', 'institute-owner']);
});

test('only administrators create educator codes and scoped educators create learner codes', () => {
  for (const kind of CODE_KINDS) assert.equal(canCreateCode({ roles: ['platform-admin'], kind }), true);
  assert.equal(canCreateCode({ roles: ['teacher'], kind: 'learner' }), true);
  assert.equal(canCreateCode({ roles: ['institute-owner'], kind: 'learner' }), true);
  assert.equal(canCreateCode({ roles: ['teacher'], kind: 'teacher' }), false);
  assert.equal(canCreateCode({ roles: ['learner'], kind: 'learner' }), false);
  assert.equal(canCreateCode({ roles: ['platform-admin'], kind: 'theory' }), false);
});

test('organisation access never leaks across memberships', () => {
  const organisations = [{ organisationId: 'org-a', membershipRole: 'teacher', active: true }, { organisationId: 'org-b', membershipRole: 'learner', active: false }];
  assert.equal(canSeeOrganisation({ roles: ['teacher'], accountOrganisations: organisations, organisationId: 'org-a' }), true);
  assert.equal(canSeeOrganisation({ roles: ['teacher'], accountOrganisations: organisations, organisationId: 'org-b' }), false);
  assert.equal(canSeeOrganisation({ roles: ['teacher'], accountOrganisations: organisations, organisationId: 'org-c' }), false);
  assert.equal(canSeeOrganisation({ roles: ['platform-admin'], accountOrganisations: [], organisationId: 'org-c' }), true);
});

test('course types are theory-only until a future engine exists', () => {
  assert.equal(isTheoryCourseType('theory'), true);
  assert.equal(isTheoryCourseType('theory-coding'), false);
  assert.equal(isTheoryCourseType('interactive-project'), false);
  assert.equal(COURSE_TYPE_OPTIONS.filter((option) => option.available).length, 1);
  assert.equal(COURSE_TYPE_OPTIONS.find((option) => option.id === 'theory').label, 'Theory course');
});

test('public account projection excludes inactive memberships and private metadata', () => {
  assert.deepEqual(publicAccount({
    roles: ['teacher', 'unknown'],
    secret: 'never-public',
    organisations: [
      { organisationId: 'org-a', membershipRole: 'teacher', active: true, createdBy: 'hidden' },
      { organisationId: 'org-b', membershipRole: 'learner', active: false }
    ]
  }), {
    roles: ['teacher'],
    organisations: [{ organisationId: 'org-a', membershipRole: 'teacher' }]
  });
});
