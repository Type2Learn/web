import { createHash } from 'node:crypto';
import { apiError } from './errors.mjs';

const COURSE_ID = 'course-1-neurodivergent-conditions-v2';
const MAX_SNAPSHOT_BYTES = 48 * 1024;
const MAX_STRING_LENGTH = 6000;
const MAX_ARRAY_LENGTH = 240;
const MAX_OBJECT_KEYS = 80;

const identifierHash = (value) => createHash('sha256').update(String(value)).digest('hex');

// Course progress comes from the learner's own browser. Keep the stored form
// deliberately boring and bounded: it is only a resume snapshot, never an
// event stream, profile, message log, or raw Firebase UID.
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

const cleanPayload = (payload) => {
  const candidate = {
    state: cleanValue(payload?.state),
    settings: cleanValue(payload?.settings),
    choices: cleanValue(payload?.choices)
  };
  const serialised = JSON.stringify(candidate);
  if (Buffer.byteLength(serialised, 'utf8') > MAX_SNAPSHOT_BYTES) {
    throw apiError(413, 'COURSE_PROGRESS_TOO_LARGE', 'This course progress update is too large to save.');
  }
  return candidate;
};

export const createCourseProgressService = ({ firebase }) => {
  const available = () => Boolean(firebase.available && firebase.firestore);
  const status = () => ({ available: available(), requiresSignIn: true, storage: 'firestore' });
  const documentFor = (uid) => firebase.firestore
    .collection('type2learnLearnerProgress')
    .doc(identifierHash(uid))
    .collection('courses')
    .doc(COURSE_ID);

  const load = async ({ authorization, courseId }) => {
    if (!available()) throw apiError(503, 'COURSE_SYNC_NOT_CONFIGURED', 'Account saving is not connected yet. Your progress remains on this device.');
    if (courseId !== COURSE_ID) throw apiError(400, 'UNKNOWN_COURSE', 'This course is not available for account saving.');
    const learner = await firebase.verifyBearer(authorization);
    let snapshot;
    try {
      snapshot = await documentFor(learner.uid).get();
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
    if (courseId !== COURSE_ID) throw apiError(400, 'UNKNOWN_COURSE', 'This course is not available for account saving.');
    const learner = await firebase.verifyBearer(authorization);
    const payload = cleanPayload(body);
    const updatedAtMs = Date.now();
    try {
      await documentFor(learner.uid).set({
        schemaVersion: 1,
        ...payload,
        updatedAtMs,
        updatedAt: new Date(updatedAtMs)
      }, { merge: false });
    } catch {
      throw apiError(503, 'COURSE_SYNC_UNAVAILABLE', 'Account saving is temporarily unavailable. Your progress remains on this device.');
    }
    return { saved: true, updatedAtMs };
  };

  return { status, load, save };
};
