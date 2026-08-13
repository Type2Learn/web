// Shared, deterministic policy for the private course-authoring workspace.
// This file intentionally contains no Firebase or network calls so its rules
// can be tested without credentials.

export const PLATFORM_ROLES = Object.freeze(['platform-admin', 'institute-owner', 'teacher', 'learner']);
export const CODE_KINDS = Object.freeze(['teacher', 'institute-owner', 'learner']);

const roleSet = new Set(PLATFORM_ROLES);
const codeKindSet = new Set(CODE_KINDS);

export const normaliseRoles = (value) => Array.from(new Set((Array.isArray(value) ? value : [])
  .map((role) => String(role || '').trim())
  .filter((role) => roleSet.has(role))));

// Roles granted through an educator or learner invitation are only effective
// while their Firestore organisation membership remains active. Platform
// administration is deliberately organisation-independent, so it is retained
// from the account record. This lets a membership revocation take effect on
// the next protected request even if the client's custom-claim token has not
// refreshed yet.
export const effectiveRoles = ({ storedRoles, organisations } = {}) => {
  const platformRoles = normaliseRoles(storedRoles).filter((role) => role === 'platform-admin');
  const membershipRoles = (Array.isArray(organisations) ? organisations : [])
    .filter((entry) => entry && entry.active !== false)
    .map((entry) => String(entry.membershipRole || '').trim())
    .filter((role) => roleSet.has(role));
  return normaliseRoles([...platformRoles, ...membershipRoles]);
};

export const hasRole = (roles, role) => normaliseRoles(roles).includes(role);

export const canCreateCode = ({ roles, kind }) => {
  if (!codeKindSet.has(kind)) return false;
  if (hasRole(roles, 'platform-admin')) return true;
  return kind === 'learner' && (hasRole(roles, 'teacher') || hasRole(roles, 'institute-owner'));
};

export const canSeeOrganisation = ({ roles, accountOrganisations, organisationId }) => {
  if (hasRole(roles, 'platform-admin')) return true;
  return (Array.isArray(accountOrganisations) ? accountOrganisations : []).some((entry) => entry?.organisationId === organisationId && entry?.active !== false);
};

export const codeRoleForKind = (kind) => ({
  teacher: 'teacher',
  'institute-owner': 'institute-owner',
  learner: 'learner'
}[kind] || '');

export const isTheoryCourseType = (type) => type === 'theory';

export const COURSE_TYPE_OPTIONS = Object.freeze([
  { id: 'theory', label: 'Theory course', available: true },
  { id: 'theory-coding', label: 'Theory + coding', available: false },
  { id: 'interactive-project', label: 'Interactive or project course', available: false },
  { id: 'other', label: 'Other course type', available: false }
]);

export const publicAccount = (account = {}) => ({
  roles: normaliseRoles(account.roles),
  organisations: (Array.isArray(account.organisations) ? account.organisations : [])
    .filter((entry) => entry?.active !== false)
    .map((entry) => ({ organisationId: String(entry.organisationId || ''), membershipRole: String(entry.membershipRole || 'learner') }))
    .filter((entry) => entry.organisationId)
});
