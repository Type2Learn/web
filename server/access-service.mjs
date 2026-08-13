import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { apiError } from './errors.mjs';
import {
  CODE_KINDS,
  PLATFORM_ROLES,
  canCreateCode,
  canSeeOrganisation,
  codeRoleForKind,
  normaliseRoles,
  publicAccount
} from './access-policy.mjs';

const ACCESS_COLLECTION = 'type2learnAccess';
const ACCOUNTS = 'accounts';
const CODES = 'roleCodes';
const ORGANISATIONS = 'organisations';
const AUDIT = 'audit';
const BOOTSTRAP = 'bootstrap';
const codeKinds = new Set(CODE_KINDS);

const nowIso = () => new Date().toISOString();
const safeText = (value, maximum = 120) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, maximum);
const safeIdentifier = (value, maximum = 96) => String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, maximum);
const numericHours = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(24 * 30, Math.max(1, Math.floor(parsed))) : 72;
};
const token = (bytes = 18) => randomBytes(bytes).toString('base64url').replace(/[-_]/g, '').toUpperCase();
const codeHash = (code, pepper) => createHmac('sha256', pepper).update(String(code || '').trim().toUpperCase()).digest('hex');
const bootstrapHash = (code) => createHash('sha256').update(String(code || '')).digest('hex');
const equalHash = (left, right) => {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
};
const rootDoc = (firestore) => firestore.collection(ACCESS_COLLECTION).doc('workspace');
const collection = (firestore, name) => rootDoc(firestore).collection(name);
const accountDoc = (firestore, uid) => collection(firestore, ACCOUNTS).doc(String(uid));
const organisationDoc = (firestore, id) => collection(firestore, ORGANISATIONS).doc(String(id));
const organisationMemberDoc = (firestore, organisationId, uid) => organisationDoc(firestore, organisationId).collection('members').doc(String(uid));

const requireAvailable = (firebase, config) => {
  if (!config?.educatorWorkspaceEnabled) {
    throw apiError(503, 'EDUCATOR_WORKSPACE_DISABLED', 'The private educator workspace is not enabled yet.');
  }
  if (!firebase?.available || !firebase.firestore || !firebase.auth) {
    throw apiError(503, 'ACCESS_NOT_CONFIGURED', 'The private educator workspace is not connected yet.');
  }
};

const memberFromSnapshot = (snapshot, uid) => {
  const stored = snapshot?.exists ? snapshot.data() || {} : {};
  return {
    uid: String(uid),
    roles: normaliseRoles(stored.roles),
    organisations: Array.isArray(stored.organisations) ? stored.organisations.filter((entry) => entry && entry.active !== false) : [],
    createdAt: stored.createdAt || '',
    updatedAt: stored.updatedAt || ''
  };
};

const appendOrganisation = (account, membership) => {
  const withoutDuplicate = account.organisations.filter((entry) => entry?.organisationId !== membership.organisationId);
  return [...withoutDuplicate, membership];
};

const auditData = ({ actorUid, action, subjectUid = '', organisationId = '', codeKind = '', courseId = '', detail = '' }) => ({
  actorUid: String(actorUid || ''),
  action: String(action || ''),
  subjectUid: String(subjectUid || ''),
  organisationId: String(organisationId || ''),
  codeKind: String(codeKind || ''),
  courseId: String(courseId || ''),
  detail: safeText(detail, 180),
  createdAt: nowIso()
});

const toClaimRoles = (roles) => normaliseRoles(roles).filter((role) => PLATFORM_ROLES.includes(role));
const refreshClaims = async (firebase, uid, roles) => {
  const user = await firebase.auth.getUser(uid);
  const existing = user.customClaims && typeof user.customClaims === 'object' ? user.customClaims : {};
  await firebase.auth.setCustomUserClaims(uid, { ...existing, type2learnRoles: toClaimRoles(roles) });
};

export const createAccessService = ({ firebase, config }) => {
  const available = () => Boolean(config?.educatorWorkspaceEnabled && firebase?.available && firebase.firestore && firebase.auth && config?.roleCodePepper);

  const verified = async (authorization) => {
    requireAvailable(firebase, config);
    return firebase.verifyBearer(authorization);
  };

  const accountFor = async (authorization) => {
    const actor = await verified(authorization);
    const snapshot = await accountDoc(firebase.firestore, actor.uid).get();
    return memberFromSnapshot(snapshot, actor.uid);
  };

  const requireAdmin = async (authorization) => {
    const account = await accountFor(authorization);
    if (!account.roles.includes('platform-admin')) throw apiError(403, 'ADMIN_REQUIRED', 'An administrator account is required for this action.');
    return account;
  };

  const requireOrganisationAccess = async (authorization, organisationId) => {
    const account = await accountFor(authorization);
    if (!canSeeOrganisation({ roles: account.roles, accountOrganisations: account.organisations, organisationId })) {
      throw apiError(403, 'ORGANISATION_ACCESS_DENIED', 'This organisation is not available to your account.');
    }
    return account;
  };

  return {
    status: () => ({
      available: available(),
      firebase: Boolean(firebase?.available),
      bootstrapConfigured: Boolean(config?.adminBootstrapCodeHash),
      courseTypes: [{ id: 'theory', available: true }, { id: 'theory-coding', available: false }, { id: 'interactive-project', available: false }, { id: 'other', available: false }]
    }),

    async me({ authorization }) {
      const account = await accountFor(authorization);
      return { account: publicAccount(account) };
    },

    async bootstrap({ authorization, body }) {
      requireAvailable(firebase, config);
      if (!config.adminBootstrapCodeHash) throw apiError(503, 'ADMIN_BOOTSTRAP_NOT_CONFIGURED', 'Administrator setup has not been configured.');
      const actor = await firebase.verifyBearer(authorization);
      if (!equalHash(bootstrapHash(body?.setupCode), config.adminBootstrapCodeHash)) {
        throw apiError(403, 'INVALID_SETUP_CODE', 'The administrator setup code is not valid.');
      }
      const firestore = firebase.firestore;
      let roles = [];
      await firestore.runTransaction(async (transaction) => {
        const lock = rootDoc(firestore).collection(BOOTSTRAP).doc('first-admin');
        const accountReference = accountDoc(firestore, actor.uid);
        const [lockSnapshot, accountSnapshot] = await Promise.all([transaction.get(lock), transaction.get(accountReference)]);
        if (lockSnapshot.exists) throw apiError(409, 'ADMIN_ALREADY_BOOTSTRAPPED', 'The first administrator has already been configured.');
        const account = memberFromSnapshot(accountSnapshot, actor.uid);
        roles = normaliseRoles([...account.roles, 'platform-admin']);
        const createdAt = account.createdAt || nowIso();
        transaction.set(accountReference, { ...account, roles, createdAt, updatedAt: nowIso() }, { merge: true });
        transaction.set(lock, { usedBy: actor.uid, usedAt: nowIso() });
        transaction.set(collection(firestore, AUDIT).doc(`bootstrap-${actor.uid}`), auditData({ actorUid: actor.uid, subjectUid: actor.uid, action: 'admin-bootstrap' }));
      });
      await refreshClaims(firebase, actor.uid, roles);
      return { account: publicAccount({ roles, organisations: [] }), refreshToken: true };
    },

    async createCode({ authorization, body }) {
      const actor = await accountFor(authorization);
      const kind = String(body?.kind || '');
      if (!codeKinds.has(kind) || !canCreateCode({ roles: actor.roles, kind })) {
        throw apiError(403, 'CODE_KIND_NOT_ALLOWED', 'Your account cannot create this type of access code.');
      }
      const isAdmin = actor.roles.includes('platform-admin');
      let organisationId = safeIdentifier(body?.organisationId);
      if (!isAdmin && kind === 'learner') {
        organisationId = actor.organisations.find((entry) => entry?.active !== false)?.organisationId || '';
      }
      if (kind === 'learner' && !organisationId) throw apiError(400, 'ORGANISATION_REQUIRED', 'Choose the organisation that this learner will join.');
      if (organisationId && !canSeeOrganisation({ roles: actor.roles, accountOrganisations: actor.organisations, organisationId })) {
        throw apiError(403, 'ORGANISATION_ACCESS_DENIED', 'You cannot create a code for this organisation.');
      }
      const organisationName = safeText(body?.organisationName, 100);
      if (kind === 'institute-owner' && !organisationName) throw apiError(400, 'ORGANISATION_NAME_REQUIRED', 'An institute name is required for an institute-owner code.');
      const code = token();
      const id = codeHash(code, config.roleCodePepper);
      const hours = numericHours(body?.expiresInHours);
      const record = {
        id,
        kind,
        organisationId,
        organisationName,
        createdBy: actor.uid,
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
        revokedAt: '',
        redeemedAt: '',
        redeemedBy: '',
        maxRedemptions: 1
      };
      await collection(firebase.firestore, CODES).doc(id).set(record);
      await collection(firebase.firestore, AUDIT).add(auditData({ actorUid: actor.uid, action: 'access-code-created', organisationId, codeKind: kind }));
      return { code, codeId: id.slice(0, 12), kind, organisationId, expiresAt: record.expiresAt, oneUse: true };
    },

    async redeemCode({ authorization, body }) {
      const actor = await verified(authorization);
      const rawCode = safeText(body?.code, 120).replace(/\s/g, '').toUpperCase();
      if (!rawCode) throw apiError(400, 'CODE_REQUIRED', 'Enter an access code.');
      const id = codeHash(rawCode, config.roleCodePepper);
      const firestore = firebase.firestore;
      let updatedAccount;
      await firestore.runTransaction(async (transaction) => {
        const codeReference = collection(firestore, CODES).doc(id);
        const accountReference = accountDoc(firestore, actor.uid);
        const [codeSnapshot, accountSnapshot] = await Promise.all([transaction.get(codeReference), transaction.get(accountReference)]);
        if (!codeSnapshot.exists) throw apiError(404, 'CODE_NOT_FOUND', 'This access code is not valid.');
        const code = codeSnapshot.data() || {};
        if (code.revokedAt) throw apiError(410, 'CODE_REVOKED', 'This access code has been revoked.');
        if (code.redeemedAt) throw apiError(409, 'CODE_ALREADY_USED', 'This access code has already been used.');
        if (!codeKinds.has(code.kind)) throw apiError(400, 'CODE_KIND_INVALID', 'This access code cannot be used.');
        if (Date.parse(code.expiresAt || '') <= Date.now()) throw apiError(410, 'CODE_EXPIRED', 'This access code has expired.');
        const account = memberFromSnapshot(accountSnapshot, actor.uid);
        const role = codeRoleForKind(code.kind);
        let organisationId = safeIdentifier(code.organisationId);
        if (code.kind === 'institute-owner') {
          organisationId = `org_${token(9).toLowerCase()}`;
          transaction.set(organisationDoc(firestore, organisationId), { id: organisationId, name: safeText(code.organisationName, 100), ownerUid: actor.uid, createdAt: nowIso(), active: true });
        }
        if (code.kind === 'teacher' && !organisationId) {
          organisationId = `teacher_${safeIdentifier(actor.uid, 48)}`;
          transaction.set(organisationDoc(firestore, organisationId), { id: organisationId, name: 'Teacher workspace', ownerUid: actor.uid, createdAt: nowIso(), active: true }, { merge: true });
        }
        const organisations = organisationId
          ? appendOrganisation(account, { organisationId, membershipRole: role, active: true, joinedAt: nowIso() })
          : account.organisations;
        const roles = normaliseRoles([...account.roles, role]);
        updatedAccount = { ...account, roles, organisations, createdAt: account.createdAt || nowIso(), updatedAt: nowIso() };
        transaction.set(accountReference, updatedAccount, { merge: true });
        if (organisationId) {
          transaction.set(organisationMemberDoc(firestore, organisationId, actor.uid), {
            memberId: actor.uid,
            membershipRole: role,
            active: true,
            joinedAt: nowIso(),
            updatedAt: nowIso()
          }, { merge: true });
        }
        transaction.set(codeReference, { redeemedAt: nowIso(), redeemedBy: actor.uid }, { merge: true });
        transaction.set(collection(firestore, AUDIT).doc(`redeem-${id}`), auditData({ actorUid: actor.uid, subjectUid: actor.uid, action: 'access-code-redeemed', organisationId, codeKind: code.kind }));
      });
      await refreshClaims(firebase, actor.uid, updatedAccount.roles);
      return { account: publicAccount(updatedAccount), refreshToken: true };
    },

    async revokeCode({ authorization, codeId }) {
      const actor = await accountFor(authorization);
      const id = safeIdentifier(codeId, 64);
      if (!id) throw apiError(400, 'CODE_ID_REQUIRED', 'Choose the code to revoke.');
      const reference = collection(firebase.firestore, CODES).doc(id);
      const snapshot = await reference.get();
      if (!snapshot.exists) throw apiError(404, 'CODE_NOT_FOUND', 'This access code was not found.');
      const code = snapshot.data() || {};
      const allowed = actor.roles.includes('platform-admin') || (code.kind === 'learner' && code.createdBy === actor.uid);
      if (!allowed) throw apiError(403, 'CODE_REVOKE_DENIED', 'You cannot revoke this access code.');
      await reference.set({ revokedAt: nowIso(), revokedBy: actor.uid }, { merge: true });
      await collection(firebase.firestore, AUDIT).add(auditData({ actorUid: actor.uid, action: 'access-code-revoked', organisationId: code.organisationId, codeKind: code.kind }));
      return { revoked: true };
    },

    async roster({ authorization, organisationId }) {
      const organisation = safeIdentifier(organisationId);
      if (!organisation) throw apiError(400, 'ORGANISATION_REQUIRED', 'Choose an organisation.');
      await requireOrganisationAccess(authorization, organisation);
      const snapshot = await organisationDoc(firebase.firestore, organisation).collection('members').where('active', '==', true).get();
      return {
        organisationId: organisation,
        members: snapshot.docs.map((document) => {
          const member = document.data() || {};
          return { memberId: document.id, membershipRole: member.membershipRole || 'learner', joinedAt: member.joinedAt || '' };
        })
      };
    }
  };
};
