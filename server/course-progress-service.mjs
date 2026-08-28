import { createHash } from 'node:crypto';
import { apiError } from './errors.mjs';

const MAX_SNAPSHOT_BYTES = 12 * 1024;
const MAX_STRING_LENGTH = 600;
const MAX_ARRAY_LENGTH = 240;
const MAX_OBJECT_KEYS = 80;

const identifierHash = (value) => createHash('sha256').update(String(value)).digest('hex');
const courseIdentifier = (value) => {
  const normalised = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,79}(?:@[0-9]+\.[0-9]+(?:\.[0-9]+)?)?$/.test(normalised)) {
    throw apiError(400, 'UNKNOWN_COURSE', 'Choose an available course before saving progress.');
  }
  return normalised;
};

// Course progress comes from the learner's own browser. Keep the stored form
// deliberately boring and bounded: it is only a resume marker, never an
// event stream, profile, message log, raw answer, typing draft, transcript,
// or raw Firebase UID. The browser may retain an in-progress draft locally;
// account sync intentionally never receives it.
const cleanValue = (value, depth = 0) => {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.replace(/\u0000/g, '').slice(0, MAX_STRING_LENGTH);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (depth >= 5 || !value || typeof value !== 'object') return null;
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_LENGTH).map((item) => cleanValue(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_OBJECT_KEYS)
      .filter(([key]) => /^[A-Za-z0-9_-]{1,80}$/.test(key))
      .map(([key, item]) => [key, cleanValue(item, depth + 1)])
  );
};

const integerInRange = (value, minimum, maximum, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
};

const cleanProgressState = (value = {}) => {
  const progress = value && typeof value.progress === 'object' ? value.progress : {};
  const finalExam = progress && typeof progress.finalExam === 'object' ? progress.finalExam : {};
  return {
    version: integerInRange(value?.version, 1, 9, 1),
    view: ['dashboard', 'course', 'preferences'].includes(value?.view) ? value.view : 'dashboard',
    previousView: ['dashboard', 'course', 'preferences'].includes(value?.previousView) ? value.previousView : 'dashboard',
    progress: {
      lessonIndex: integerInRange(progress.lessonIndex, 0, 99, 0),
      phase: ['preview', 'read', 'type', 'check', 'apply', 'assessment', 'complete', 'exam-intro', 'exam', 'exam-results'].includes(progress.phase) ? progress.phase : 'preview',
      completedSteps: Array.isArray(progress.completedSteps)
        ? Array.from(new Set(progress.completedSteps.map((step) => integerInRange(step, 0, 99, -1)).filter((step) => step >= 0))).slice(0, 100)
        : [],
      // Keep only the position of the private final review. Do not sync an
      // answer index, selected response, or free-text answer.
      finalExam: {
        questionIndex: integerInRange(finalExam.questionIndex, 0, 99, 0),
        completed: finalExam.completed === true
      }
    },
    manualExampleVisible: value?.manualExampleVisible === true,
    showSimple: value?.showSimple === true,
    readingSectionIndex: integerInRange(value?.readingSectionIndex, 0, 20, 0),
    coursePaused: value?.coursePaused === true,
    updatedAtMs: integerInRange(value?.updatedAtMs, 0, Number.MAX_SAFE_INTEGER, 0)
  };
};

const cleanPayload = (payload) => {
  const candidate = {
    state: cleanProgressState(payload?.state),
    settings: cleanValue(payload?.settings),
    choices: cleanValue(payload?.choices)
  };
  const serialised = JSON.stringify(candidate);
  if (Buffer.byteLength(serialised, 'utf8') > MAX_SNAPSHOT_BYTES) {
    throw apiError(413, 'COURSE_PROGRESS_TOO_LARGE', 'This course progress update is too large to save.');
  }
  return candidate;
};

export const createCourseProgressService = ({ firebase, assertCourseAccess = null }) => {
  const available = () => Boolean(firebase.available && firebase.firestore);
  const status = () => ({ available: available(), requiresSignIn: true, storage: 'firestore' });
  const documentsFor = (uid) => firebase.firestore
    .collection('type2learnLearnerProgress')
    .doc(identifierHash(uid))
    .collection('courses');
  const documentFor = (uid, courseId) => documentsFor(uid).doc(identifierHash(courseIdentifier(courseId)));

  const load = async ({ authorization, courseId }) => {
    if (!available()) throw apiError(503, 'COURSE_SYNC_NOT_CONFIGURED', 'Account saving is not connected yet. Your progress remains on this device.');
    // Authenticate before validating a caller-controlled course ID. This keeps
    // every private progress path uniformly behind sign-in and avoids exposing
    // validation detail to an unauthenticated request.
    const learner = await firebase.verifyBearer(authorization);
    const safeCourseId = courseIdentifier(courseId);
    if (typeof assertCourseAccess === 'function') await assertCourseAccess({ authorization, courseKey: safeCourseId });
    let snapshot;
    try {
      snapshot = await documentFor(learner.uid, safeCourseId).get();
    } catch {
      throw apiError(503, 'COURSE_SYNC_UNAVAILABLE', 'Account saving is temporarily unavailable. Your progress remains on this device.');
    }
    if (!snapshot.exists) return { snapshot: null };
    const data = snapshot.data() || {};
    return {
      snapshot: {
        state: cleanValue(data.state),
        settings: cleanValue(data.settings),
        choices: cleanValue(data.choices),
        updatedAtMs: Number(data.updatedAtMs) || 0
      }
    };
  };

  const save = async ({ authorization, courseId, body }) => {
    if (!available()) throw apiError(503, 'COURSE_SYNC_NOT_CONFIGURED', 'Account saving is not connected yet. Your progress remains on this device.');
    // See load(): auth is intentionally the first private operation.
    const learner = await firebase.verifyBearer(authorization);
    const safeCourseId = courseIdentifier(courseId);
    if (typeof assertCourseAccess === 'function') await assertCourseAccess({ authorization, courseKey: safeCourseId });
    const payload = cleanPayload(body);
    const updatedAtMs = Date.now();
    try {
      await documentFor(learner.uid, safeCourseId).set({
        schemaVersion: 2,
        courseId: safeCourseId,
        ...payload,
        updatedAtMs,
        updatedAt: new Date(updatedAtMs)
      }, { merge: false });
    } catch {
      throw apiError(503, 'COURSE_SYNC_UNAVAILABLE', 'Account saving is temporarily unavailable. Your progress remains on this device.');
    }
    return { saved: true, updatedAtMs };
  };

  const remove = async ({ authorization, courseId = '' }) => {
    if (!available()) throw apiError(503, 'COURSE_SYNC_NOT_CONFIGURED', 'Account saving is not connected yet.');
    const learner = await firebase.verifyBearer(authorization);
    const suppliedCourseId = String(courseId || '').trim();
    try {
      if (suppliedCourseId) {
        const safeCourseId = courseIdentifier(suppliedCourseId);
        if (typeof assertCourseAccess === 'function') await assertCourseAccess({ authorization, courseKey: safeCourseId });
        await documentFor(learner.uid, safeCourseId).delete();
        return { deleted: true, scope: 'course' };
      }
      // A learner's privacy control clears every account-synchronised resume
      // snapshot, not just the course currently on screen.
      while (true) {
        const snapshot = await documentsFor(learner.uid).limit(200).get();
        if (snapshot.empty) break;
        const batch = firebase.firestore.batch();
        snapshot.docs.forEach((document) => batch.delete(document.ref));
        await batch.commit();
      }
      return { deleted: true, scope: 'all-courses' };
    } catch (error) {
      if (error?.code && error.code !== 'COURSE_SYNC_UNAVAILABLE') throw error;
      throw apiError(503, 'COURSE_SYNC_UNAVAILABLE', 'Account progress could not be deleted right now.');
    }
  };

  return { status, load, save, remove };
};
