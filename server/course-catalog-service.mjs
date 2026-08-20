import { apiError } from './errors.mjs';
import { migratedLegacyTheoryCourse } from './legacy-neurodivergent-migration.mjs';
import { randomUUID } from 'node:crypto';

const ROOT = 'type2learnCourseAuthoring';
const legacyCompiled = migratedLegacyTheoryCourse();
const LEGACY_RECORD = Object.freeze({
  courseId: legacyCompiled.learnerManifest.id,
  version: legacyCompiled.learnerManifest.version,
  type: 'theory',
  title: legacyCompiled.learnerManifest.title,
  learnerManifest: legacyCompiled.learnerManifest,
  privateManifest: legacyCompiled.privateManifest,
  status: 'published',
  requestedAudience: 'platform',
  narration: { humanAudioCount: 0 }
});
const LEGACY_COURSE = Object.freeze({
  courseId: 'course-1-neurodivergent-conditions-v2',
  version: '1.1',
  type: 'theory',
  title: { en: 'Introduction to Neurodivergent Conditions', ur: 'نیورو ڈائیورجنٹ حالتوں کا تعارف' },
  label: { en: 'Educational course', ur: 'تعلیمی کورس' },
  modules: 11,
  status: 'published',
  availability: 'platform',
  legacy: true
});
const clean = (value, limit = 96) => String(value || '').trim().replace(/[^a-z0-9@._-]/gi, '').slice(0, limit).toLowerCase();
const courseKey = (courseId, version) => `${clean(courseId, 80)}@${clean(version, 24)}`;
const nowIso = () => new Date().toISOString();
const root = (firestore) => firestore.collection(ROOT).doc('workspace');
const courses = (firestore) => root(firestore).collection('courses');
const audit = (firestore, entry) => root(firestore).collection('audit').add({ ...entry, createdAt: nowIso() });
const courseRecord = (firestore, courseId, version) => courses(firestore).doc(courseKey(courseId, version));
const orgMembership = (account, organisationId) => account?.organisations?.some((membership) => membership?.organisationId === organisationId && membership.active !== false);
const internalAudience = (record = {}) => record.requestedAudience === 'platform' ? 'platform' : 'organisation';
export const splitCourseKey = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  const match = raw.match(/^([a-z0-9][a-z0-9-]{2,79})(?:@(\d+\.\d+(?:\.\d+)?))?$/);
  return match ? { courseId: match[1], version: match[2] || '' } : null;
};

export const learnerCourseProjection = (record = {}) => ({
  courseId: String(record.courseId || ''),
  version: String(record.version || ''),
  type: 'theory',
  title: { en: String(record.title?.en || ''), ur: String(record.title?.ur || '') },
  label: { en: String(record.learnerManifest?.label?.en || 'Educational course'), ur: String(record.learnerManifest?.label?.ur || 'تعلیمی کورس') },
  modules: Array.isArray(record.learnerManifest?.modules) ? record.learnerManifest.modules.length : 0,
  status: 'published',
  availability: internalAudience(record),
  narration: { humanAudioCount: Number(record.narration?.humanAudioCount) || 0, fallback: 'device-text-to-speech' }
});

export const visibleToAccount = (record, account) => {
  if (!record?.learnerManifest || record.status !== 'published') return false;
  // A platform administrator must be able to open the same learner-safe
  // course player while reviewing a release. This is an explicit review
  // authority, not a broader learner-data grant: the catalogue projection
  // and manifest still exclude source uploads, answer keys and rosters.
  if (account?.roles?.includes('platform-admin')) return true;
  if (internalAudience(record) === 'platform') return true;
  if (!orgMembership(account, record.ownerOrganisationId)) return false;
  const distribution = record.distribution || { mode: 'organisation' };
  return distribution.mode !== 'assigned' || (Array.isArray(distribution.learnerIds) && distribution.learnerIds.includes(account.uid));
};

const canManageDistribution = (record, account) => account?.roles?.includes('platform-admin')
  || (orgMembership(account, record?.ownerOrganisationId) && (account.roles.includes('teacher') || account.roles.includes('institute-owner')));

const ensureAvailable = ({ firebase, config }) => {
  if (!config?.educatorWorkspaceEnabled || !firebase?.available || !firebase.firestore) {
    throw apiError(503, 'COURSE_CATALOGUE_NOT_CONFIGURED', 'The reviewed course catalogue is not connected yet.');
  }
};

export const createCourseCatalogService = ({ firebase, config, access }) => {
  // Opaque, short-lived media leases keep private Storage object names out of
  // learner-visible API JSON. The stream route resolves a lease once and then
  // redirects the media element; leases are process-local and expire quickly.
  const narrationLeases = new Map();
  const purgeNarrationLeases = () => {
    const now = Date.now();
    narrationLeases.forEach((lease, key) => { if (!lease || lease.expiresAtMs <= now) narrationLeases.delete(key); });
  };
  const accountFor = async (authorization) => {
    ensureAvailable({ firebase, config });
    return access.accountFor(authorization);
  };
  const load = async (courseId, version) => {
    const safeCourseId = clean(courseId, 80);
    const safeVersion = clean(version, 24);
    if (!safeCourseId || !safeVersion) throw apiError(400, 'COURSE_REQUIRED', 'Choose a course and version.');
    if (safeCourseId === LEGACY_RECORD.courseId && safeVersion === LEGACY_RECORD.version) {
      return { reference: null, record: LEGACY_RECORD, source: 'reviewed-markdown' };
    }
    const snapshot = await courseRecord(firebase.firestore, safeCourseId, safeVersion).get();
    if (!snapshot.exists) throw apiError(404, 'COURSE_NOT_FOUND', 'This reviewed course was not found.');
    return { reference: snapshot.ref, record: snapshot.data() || {} };
  };
  const assertVisible = (record, account) => {
    if (!visibleToAccount(record, account)) throw apiError(403, 'COURSE_ACCESS_DENIED', 'This course is not available to this account.');
  };

  return {
    status: () => ({ enabled: Boolean(config?.educatorWorkspaceEnabled && firebase?.available && firebase.firestore), supportedType: 'theory', legacyCourseId: LEGACY_COURSE.courseId }),

    async catalogue({ authorization }) {
      const account = await accountFor(authorization);
      const snapshot = await courses(firebase.firestore).where('status', '==', 'published').limit(100).get();
      const published = snapshot.docs.map((document) => document.data() || {}).filter((record) => visibleToAccount(record, account)).map(learnerCourseProjection);
      const legacy = visibleToAccount(LEGACY_RECORD, account) ? [learnerCourseProjection(LEGACY_RECORD)] : [];
      return { courses: [...legacy, ...published], theoryOnly: true };
    },

    async manifest({ authorization, courseId, version }) {
      const account = await accountFor(authorization);
      const { record } = await load(courseId, version);
      assertVisible(record, account);
      // The learner-safe manifest contains no answer key, review note, source
      // upload, audio object path, access code, or learner data.
      return { legacy: false, course: learnerCourseProjection(record), manifest: record.learnerManifest };
    },

    // SERVER-ONLY ASSESSMENT CONTEXT: assessment-service uses this narrow
    // internal hand-off when it must build an offline reserve from a reviewed
    // course. It is intentionally not an HTTP route and is never returned to
    // the course player. The private manifest remains inside the server
    // process; learner-visible assessment DTOs still strip every answer key.
    async assessmentContext({ authorization, courseId, version }) {
      const account = await accountFor(authorization);
      const { record } = await load(courseId, version);
      assertVisible(record, account);
      return {
        course: learnerCourseProjection(record),
        manifest: record.learnerManifest,
        privateManifest: record.privateManifest || null
      };
    },

    // Human narration stays in private Firebase Storage. A learner who can
    // already open the reviewed manifest may request one short-lived URL for
    // the current module; object paths and storage credentials never enter
    // the course manifest or learner-facing API JSON.
    async narration({ authorization, courseId, version, moduleId, language }) {
      const account = await accountFor(authorization);
      const { record } = await load(courseId, version);
      assertVisible(record, account);
      if (!firebase.storage) throw apiError(503, 'NARRATION_STORAGE_NOT_CONFIGURED', 'Human narration is not connected yet. Device text-to-speech remains available.');
      const sectionId = clean(moduleId, 80);
      const locale = language === 'ur' ? 'ur' : 'en';
      if (!sectionId) throw apiError(400, 'NARRATION_SECTION_REQUIRED', 'Choose a course module before requesting narration.');
      const knownModule = Array.isArray(record.learnerManifest?.modules)
        && record.learnerManifest.modules.some((module) => clean(module?.id, 80) === sectionId);
      if (!knownModule) throw apiError(400, 'NARRATION_SECTION_UNKNOWN', 'This narration request does not match a reviewed course module.');
      const asset = (Array.isArray(record.narrationAssets) ? record.narrationAssets : [])
        .find((candidate) => candidate?.locale === locale && clean(candidate?.sectionId, 80) === sectionId && typeof candidate?.objectPath === 'string');
      if (!asset) throw apiError(404, 'NARRATION_NOT_FOUND', 'Human narration has not been added for this module. Device text-to-speech remains available.');
      const expiresAt = new Date(Date.now() + (5 * 60 * 1000));
      purgeNarrationLeases();
      const token = randomUUID().replace(/-/g, '');
      narrationLeases.set(token, { objectPath: asset.objectPath, expiresAtMs: expiresAt.getTime() });
      await audit(firebase.firestore, { actorUid: account.uid, action: 'learner-course-narration-opened', courseId: record.courseId, version: record.version, detail: `${locale}:${sectionId}` });
      return { source: 'human-narration', url: `/api/v1/course-narration-stream?token=${token}`, expiresAt: expiresAt.toISOString(), locale, sectionId };
    },

    async narrationStream({ token }) {
      purgeNarrationLeases();
      const lease = narrationLeases.get(String(token || ''));
      if (!lease) throw apiError(404, 'NARRATION_LEASE_EXPIRED', 'This narration link has expired. Choose Listen again to request a new one.');
      // A lease is single-purpose but reusable for its brief lifetime so native
      // media range/retry requests can still work without a second API call.
      try {
        const [url] = await firebase.storage.file(lease.objectPath).getSignedUrl({ action: 'read', expires: new Date(lease.expiresAtMs) });
        return { url, expiresAt: new Date(lease.expiresAtMs).toISOString() };
      } catch {
        narrationLeases.delete(String(token || ''));
        throw apiError(503, 'NARRATION_TEMPORARILY_UNAVAILABLE', 'Human narration could not be opened right now. Device text-to-speech remains available.');
      }
    },

    async assertProgressAccess({ authorization, courseKey: requestedCourseKey }) {
      const account = await accountFor(authorization);
      const parsed = splitCourseKey(requestedCourseKey);
      if (!parsed) throw apiError(400, 'UNKNOWN_COURSE', 'Choose an available course before saving progress.');
      const version = parsed.courseId === LEGACY_RECORD.courseId && !parsed.version ? LEGACY_RECORD.version : parsed.version;
      if (!version) throw apiError(400, 'COURSE_VERSION_REQUIRED', 'Choose a versioned reviewed course before saving progress.');
      const { record } = await load(parsed.courseId, version);
      assertVisible(record, account);
      return { courseId: parsed.courseId, version };
    },

    async checkAnswer({ authorization, body }) {
      const account = await accountFor(authorization);
      const { record } = await load(body?.courseId, body?.version);
      assertVisible(record, account);
      const language = body?.language === 'ur' ? 'ur' : 'en';
      const selectedIndex = Number(body?.selectedIndex);
      if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) throw apiError(400, 'ANSWER_INVALID', 'Choose one of the four answers.');
      const scope = body?.scope === 'final' ? 'final' : 'module';
      const source = scope === 'final'
        ? record.privateManifest?.answerKeys?.finalExam?.[language]?.[Number(body?.questionIndex)]
        : record.privateManifest?.answerKeys?.modules?.find((module) => module.id === clean(body?.moduleId, 80))?.[language];
      if (!source || !Number.isInteger(source.correctOption)) throw apiError(409, 'ANSWER_KEY_UNAVAILABLE', 'This answer check has not been reviewed yet.');
      const correct = selectedIndex === source.correctOption;
      await audit(firebase.firestore, { actorUid: account.uid, action: 'learner-course-answer-checked', courseId: record.courseId, version: record.version, scope, result: correct ? 'complete' : 'try-again' });
      return { result: correct ? 'complete' : 'try-again' };
    },

    async setDistribution({ authorization, body }) {
      const account = await accountFor(authorization);
      const { reference, record } = await load(body?.courseId, body?.version);
      if (!reference) throw apiError(409, 'LEGACY_COURSE_DISTRIBUTION_LOCKED', 'This platform course is already publicly available through its reviewed Markdown source.');
      if (record.status !== 'published') throw apiError(409, 'COURSE_NOT_PUBLISHED', 'Only an approved published course can be assigned.');
      if (!canManageDistribution(record, account)) throw apiError(403, 'COURSE_DISTRIBUTION_DENIED', 'Only the owning institute, teacher, or administrator can change this course distribution.');
      const mode = body?.mode === 'assigned' ? 'assigned' : 'organisation';
      const learnerIds = Array.from(new Set(Array.isArray(body?.learnerIds) ? body.learnerIds.map((value) => clean(value, 128)).filter(Boolean).slice(0, 200) : []));
      if (mode === 'assigned' && !learnerIds.length) throw apiError(400, 'LEARNERS_REQUIRED', 'Choose at least one enrolled learner for this assignment.');
      if (mode === 'assigned') {
        const checks = await Promise.all(learnerIds.map((uid) => root(firebase.firestore).collection('organisations').doc(record.ownerOrganisationId).collection('members').doc(uid).get()));
        if (checks.some((snapshot) => !snapshot.exists || snapshot.data()?.active === false || snapshot.data()?.membershipRole !== 'learner')) {
          throw apiError(400, 'LEARNER_NOT_ENROLLED', 'Assignments can include only active learners in the owning organisation.');
        }
      }
      await reference.set({ distribution: { mode, learnerIds: mode === 'assigned' ? learnerIds : [], updatedAt: nowIso(), updatedBy: account.uid } }, { merge: true });
      await audit(firebase.firestore, { actorUid: account.uid, action: 'course-distribution-updated', courseId: record.courseId, version: record.version, detail: mode });
      return { distribution: { mode, learnerCount: mode === 'assigned' ? learnerIds.length : null } };
    },

    async requestPlatformRelease({ authorization, body }) {
      const account = await accountFor(authorization);
      const { reference, record } = await load(body?.courseId, body?.version);
      if (!reference) throw apiError(409, 'LEGACY_COURSE_RELEASE_LOCKED', 'This platform course is already publicly available through its reviewed Markdown source.');
      if (!canManageDistribution(record, account)) throw apiError(403, 'PLATFORM_REQUEST_DENIED', 'Only the owning institute, teacher, or administrator can request a platform release.');
      await reference.set({ platformReleaseRequest: { requestedAt: nowIso(), requestedBy: account.uid, status: 'pending-admin-review' } }, { merge: true });
      await audit(firebase.firestore, { actorUid: account.uid, action: 'course-platform-release-requested', courseId: record.courseId, version: record.version });
      return { requested: true, status: 'pending-admin-review' };
    }
  };
};
