import { createHash, randomUUID } from 'node:crypto';
import { apiError } from './errors.mjs';

const COURSE_ID = 'course-1-neurodivergent-conditions-v2';
const CONSENT_VERSION = 1;
const MAX_MODULE_INDEX = 10;
const MAX_DURATION_MS = 4 * 60 * 60 * 1000;
const MAX_RETENTION_DAYS = 365;

const userHash = (uid) => createHash('sha256').update(String(uid)).digest('hex');
const boundedNumber = (value, maximum = 1000000) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(Math.round(number), maximum) : 0;
};
const boundedEnum = (value, values, fallback) => values.includes(value) ? value : fallback;

const metricsFor = (value = {}) => ({
  activeMs: boundedNumber(value.activeMs, MAX_DURATION_MS),
  idleMs: boundedNumber(value.idleMs, MAX_DURATION_MS),
  firstActionMs: boundedNumber(value.firstActionMs, 30 * 60 * 1000),
  returns: boundedNumber(value.returns, 100),
  rereads: boundedNumber(value.rereads, 100),
  typingCharacters: boundedNumber(value.typingCharacters, 12000),
  typingCorrectCharacters: boundedNumber(value.typingCorrectCharacters, 12000),
  typingIncorrectCharacters: boundedNumber(value.typingIncorrectCharacters, 12000),
  typingBackspaces: boundedNumber(value.typingBackspaces, 12000),
  typingAbandons: boundedNumber(value.typingAbandons, 100),
  typingLongestPauseMs: boundedNumber(value.typingLongestPauseMs, 10 * 60 * 1000),
  ttsStarts: boundedNumber(value.ttsStarts, 100),
  ttsCompleted: boundedNumber(value.ttsCompleted, 100),
  speechStarts: boundedNumber(value.speechStarts, 100),
  speechCompleted: boundedNumber(value.speechCompleted, 100),
  aiRequests: boundedNumber(value.aiRequests, 100),
  aiActiveMs: boundedNumber(value.aiActiveMs, MAX_DURATION_MS)
});

// BEHAVIOUR CONTEXT: only an aggregate and learner-selected presentation
// controls are retained. These fields intentionally exclude raw prose,
// keystrokes, microphone data, chat content, answer text, scores, and any
// inferred learner type.
const behaviourFor = (value = {}) => ({
  schemaVersion: 1,
  role: boundedEnum(value.role, ['calm-guide', 'learning-partner', 'self-challenge', 'visual-co-explorer'], 'calm-guide'),
  presence: boundedEnum(value.presence, ['quiet', 'available', 'involved'], 'available'),
  proactive: value.proactive !== false,
  states: Array.isArray(value.states) ? value.states.map((state) => String(state)).filter((state) => ['starting', 'returning', 're-reading', 'working-through-typing', 'using-support', 'ready-for-next-step', 'needs-a-choice'].includes(state)).slice(0, 7) : [],
  companion: {
    offered: boundedNumber(value.companion?.offered, 50),
    accepted: boundedNumber(value.companion?.accepted, 50),
    dismissed: boundedNumber(value.companion?.dismissed, 50),
    visualsOpened: boundedNumber(value.companion?.visualsOpened, 50),
    missionsCompleted: boundedNumber(value.companion?.missionsCompleted, 50)
  }
});

const cleanSummary = (body = {}) => {
  const moduleIndex = Number(body.moduleIndex);
  if (!Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex > MAX_MODULE_INDEX) {
    throw apiError(400, 'INVALID_MODULE', 'This learning summary is not for an available module.');
  }
  return {
    moduleIndex,
    phase: boundedEnum(body.phase, ['preview', 'read', 'type', 'check', 'apply', 'complete'], 'read'),
    language: body.language === 'ur' ? 'ur' : 'en',
    metrics: metricsFor(body.metrics),
    support: {
      textToSpeech: Boolean(body.support?.textToSpeech),
      visualOffered: Boolean(body.support?.visualOffered),
      visualOpened: Boolean(body.support?.visualOpened),
      taskInitiationOffered: Boolean(body.support?.taskInitiationOffered),
      taskInitiationUsed: Boolean(body.support?.taskInitiationUsed)
    },
    behaviour: behaviourFor(body.behaviour),
    clientSummaryId: String(body.clientSummaryId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || randomUUID()
  };
};

export const createLearningAnalyticsService = ({ config, firebase }) => {
  const available = () => Boolean(config.adaptiveLearningEnabled && firebase.available && firebase.firestore);
  const profile = (uid) => firebase.firestore.collection('type2learnLearningProfiles').doc(userHash(uid));
  const summary = (uid, moduleIndex) => profile(uid)
    .collection('courses').doc(COURSE_ID)
    .collection('modules').doc(String(moduleIndex));
  // Assessment runs intentionally live separately from analytics summaries.
  // They still belong in the same export/delete control because they contain
  // bounded assessment outcomes derived from an opted-in learner response.
  const assessmentRuns = (uid) => firebase.firestore
    .collection('type2learnAssessmentRuns').doc(userHash(uid)).collection('runs');
  const assessmentRoot = (uid) => firebase.firestore
    .collection('type2learnAssessmentRuns').doc(userHash(uid));

  const status = () => ({
    available: available(),
    consentVersion: CONSENT_VERSION,
    requiresSignIn: true,
    retentionDays: Math.min(MAX_RETENTION_DAYS, Number(config.adaptiveRetentionDays) || 90),
    retentionField: 'expiresAt'
  });

  const expiryDate = (timestamp = new Date()) => new Date(timestamp.getTime() + (Math.min(MAX_RETENTION_DAYS, Number(config.adaptiveRetentionDays) || 90) * 24 * 60 * 60 * 1000));
  // Firestore TTL should be configured against `expiresAt` in the Firebase
  // console. The small opportunistic cleanup below ensures summaries are also
  // removed on the next learner write if TTL processing is delayed.
  const trimExpiredSummaries = async (uid) => {
    const expired = await profile(uid).collection('courses').doc(COURSE_ID).collection('modules')
      .where('expiresAt', '<=', new Date()).limit(100).get().catch(() => null);
    if (!expired?.docs?.length) return;
    const batch = firebase.firestore.batch();
    expired.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  };

  // ADAPTIVE LEARNING: this read-only check lets the course render the
  // learner's choice without creating a profile or collecting anything.
  const getConsent = async ({ authorization }) => {
    if (!firebase.available || !firebase.firestore) {
      throw apiError(503, 'ADAPTIVE_LEARNING_UNAVAILABLE', 'Adaptive learning support is not connected right now.');
    }
    const learner = await firebase.verifyBearer(authorization);
    const data = (await profile(learner.uid).get()).data() || {};
    return {
      available: available(),
      enabled: data.consentVersion === CONSENT_VERSION && data.adaptiveEnabled === true,
      consentVersion: CONSENT_VERSION
    };
  };

  const setConsent = async ({ authorization, body }) => {
    if (!available()) throw apiError(503, 'ADAPTIVE_LEARNING_UNAVAILABLE', 'Adaptive learning support is not available right now.');
    const learner = await firebase.verifyBearer(authorization);
    const enabled = Boolean(body?.enabled);
    const timestamp = new Date();
    await profile(learner.uid).set({
      schemaVersion: 1,
      consentVersion: CONSENT_VERSION,
      adaptiveEnabled: enabled,
      updatedAt: timestamp,
      disabledAt: enabled ? null : timestamp
    }, { merge: true });
    return { enabled, consentVersion: CONSENT_VERSION };
  };

  const saveSummary = async ({ authorization, body }) => {
    if (!available()) throw apiError(503, 'ADAPTIVE_LEARNING_UNAVAILABLE', 'Adaptive learning support is not available right now.');
    const learner = await firebase.verifyBearer(authorization);
    const consent = await profile(learner.uid).get();
    const profileData = consent.data() || {};
    if (!consent.exists || profileData.consentVersion !== CONSENT_VERSION || profileData.adaptiveEnabled !== true) {
      throw apiError(403, 'ADAPTIVE_CONSENT_REQUIRED', 'Choose adaptive learning support before saving learning summaries.');
    }
    const clean = cleanSummary(body);
    const timestamp = new Date();
    await trimExpiredSummaries(learner.uid);
    await summary(learner.uid, clean.moduleIndex).set({
      schemaVersion: 2,
      courseId: COURSE_ID,
      moduleIndex: clean.moduleIndex,
      phase: clean.phase,
      language: clean.language,
      metrics: clean.metrics,
      support: clean.support,
      behaviour: clean.behaviour,
      clientSummaryId: clean.clientSummaryId,
      updatedAt: timestamp,
      expiresAt: expiryDate(timestamp)
    }, { merge: true });
    return { saved: true, moduleIndex: clean.moduleIndex };
  };

  const clear = async ({ authorization }) => {
    if (!firebase.available || !firebase.firestore) throw apiError(503, 'ADAPTIVE_LEARNING_UNAVAILABLE', 'Adaptive learning support is not available right now.');
    const learner = await firebase.verifyBearer(authorization);
    const root = profile(learner.uid);
    const course = root.collection('courses').doc(COURSE_ID);
    // Firestore batches are capped. Keep deleting bounded records in batches
    // so this privacy action remains complete even after many optional runs.
    const deleteCollection = async (collection) => {
      while (true) {
        const snapshot = await collection.limit(200).get();
        if (snapshot.empty) return;
        const deletion = firebase.firestore.batch();
        snapshot.docs.forEach((document) => deletion.delete(document.ref));
        await deletion.commit();
      }
    };
    await Promise.all([
      deleteCollection(course.collection('modules')),
      deleteCollection(course.collection('adaptiveProposals')),
      deleteCollection(assessmentRuns(learner.uid))
    ]);
    const batch = firebase.firestore.batch();
    batch.delete(course);
    batch.delete(assessmentRoot(learner.uid));
    batch.set(root, {
      schemaVersion: 1,
      consentVersion: CONSENT_VERSION,
      adaptiveEnabled: false,
      updatedAt: new Date(),
      deletedAt: new Date()
    }, { merge: true });
    await batch.commit();
    return { deleted: true };
  };

  const exportData = async ({ authorization }) => {
    if (!firebase.available || !firebase.firestore) throw apiError(503, 'ADAPTIVE_LEARNING_UNAVAILABLE', 'Adaptive learning support is not available right now.');
    const learner = await firebase.verifyBearer(authorization);
    const root = profile(learner.uid);
    const course = root.collection('courses').doc(COURSE_ID);
    const [profileSnapshot, moduleSnapshots, proposalSnapshots, assessmentSnapshots] = await Promise.all([
      root.get(),
      course.collection('modules').get(),
      course.collection('adaptiveProposals').get(),
      assessmentRuns(learner.uid).get()
    ]);
    const profileData = profileSnapshot.data() || {};
    // This export is intentionally the same minimised data that can be
    // stored: aggregates and learner decisions only—never typed answers,
    // recordings, chat history, individual keystrokes, or model prompts.
    return {
      schemaVersion: 1,
      courseId: COURSE_ID,
      consent: {
        enabled: profileData.adaptiveEnabled === true,
        consentVersion: Number(profileData.consentVersion) || null
      },
      modules: moduleSnapshots.docs.map((document) => {
        const data = document.data() || {};
        return {
          moduleIndex: Number(data.moduleIndex) || 0,
          phase: String(data.phase || 'read'), language: data.language === 'ur' ? 'ur' : 'en',
          metrics: metricsFor(data.metrics),
          support: data.support || {},
          behaviour: behaviourFor(data.behaviour)
        };
      }),
      proposals: proposalSnapshots.docs.map((document) => {
        const data = document.data() || {};
        return {
          id: String(data.id || document.id), moduleIndex: Number(data.moduleIndex) || 0,
          candidateId: String(data.candidateId || ''), kind: String(data.kind || ''),
          status: String(data.status || ''), preference: data.preference || null
        };
      }),
      assessments: assessmentSnapshots.docs.map((document) => {
        const data = document.data() || {};
        return {
          id: String(data.id || document.id),
          moduleIndex: data.moduleIndex === 'final' ? 'final' : Number(data.moduleIndex) || 0,
          scope: data.moduleIndex === 'final' ? 'final' : 'module',
          status: String(data.status || ''),
          completionKind: String(data.completionKind || ''),
          questionCount: Array.isArray(data.itemOrder) ? data.itemOrder.length : 0,
          outcomes: Array.isArray(data.outcomes) ? data.outcomes.map((outcome) => ({
            itemId: String(outcome?.itemId || ''),
            outcome: String(outcome?.outcome || ''),
            demonstratedObjectiveIds: Array.isArray(outcome?.demonstratedObjectiveIds) ? outcome.demonstratedObjectiveIds.map((id) => String(id)).slice(0, 3) : [],
            needsReviewObjectiveIds: Array.isArray(outcome?.needsReviewObjectiveIds) ? outcome.needsReviewObjectiveIds.map((id) => String(id)).slice(0, 3) : []
          })) : []
        };
      })
    };
  };

  return { status, getConsent, setConsent, saveSummary, exportData, clear };
};
