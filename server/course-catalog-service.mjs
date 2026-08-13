import { apiError } from './errors.mjs';

const ROOT = 'type2learnCourseAuthoring';
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
  const accountFor = async (authorization) => {
    ensureAvailable({ firebase, config });
    return access.accountFor(authorization);
  };
  const load = async (courseId, version) => {
    const safeCourseId = clean(courseId, 80);
    const safeVersion = clean(version, 24);
    if (!safeCourseId || !safeVersion) throw apiError(400, 'COURSE_REQUIRED', 'Choose a course and version.');
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
      const legacy = account?.roles?.length ? [LEGACY_COURSE] : [];
      return { courses: [...legacy, ...published], theoryOnly: true };
    },

    async manifest({ authorization, courseId, version }) {
      const account = await accountFor(authorization);
      if (courseId === LEGACY_COURSE.courseId && version === LEGACY_COURSE.version) {
        return { legacy: true, course: LEGACY_COURSE };
      }
      const { record } = await load(courseId, version);
      assertVisible(record, account);
      // The learner-safe manifest contains no answer key, review note, source
      // upload, audio object path, access code, or learner data.
      return { legacy: false, course: learnerCourseProjection(record), manifest: record.learnerManifest };
    },

    async assertProgressAccess({ authorization, courseKey: requestedCourseKey }) {
      const account = await accountFor(authorization);
      const parsed = splitCourseKey(requestedCourseKey);
      if (!parsed) throw apiError(400, 'UNKNOWN_COURSE', 'Choose an available course before saving progress.');
      if (parsed.courseId === LEGACY_COURSE.courseId && (!parsed.version || parsed.version === LEGACY_COURSE.version)) {
        if (!account.roles?.length) throw apiError(403, 'COURSE_ACCESS_DENIED', 'This course is not available to this account.');
        return { courseId: LEGACY_COURSE.courseId, version: LEGACY_COURSE.version };
      }
      if (!parsed.version) throw apiError(400, 'COURSE_VERSION_REQUIRED', 'Choose a versioned reviewed course before saving progress.');
      const { record } = await load(parsed.courseId, parsed.version);
      assertVisible(record, account);
      return { courseId: parsed.courseId, version: parsed.version };
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
      if (!canManageDistribution(record, account)) throw apiError(403, 'PLATFORM_REQUEST_DENIED', 'Only the owning institute, teacher, or administrator can request a platform release.');
      await reference.set({ platformReleaseRequest: { requestedAt: nowIso(), requestedBy: account.uid, status: 'pending-admin-review' } }, { merge: true });
      await audit(firebase.firestore, { actorUid: account.uid, action: 'course-platform-release-requested', courseId: record.courseId, version: record.version });
      return { requested: true, status: 'pending-admin-review' };
    }
  };
};
