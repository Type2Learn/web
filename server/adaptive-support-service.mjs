import { createHash } from 'node:crypto';
import { apiError } from './errors.mjs';
import { adaptiveCandidateForSummary, visibleProposal } from './adaptive-policy.mjs';
import { adaptiveUsageCaps, usageEstimate } from './usage-ledger.mjs';
import { createModelProvider } from './model-provider.mjs';

const COURSE_ID = 'course-1-neurodivergent-conditions-v2';
const CONSENT_VERSION = 1;
const MAX_MODULE_INDEX = 10;
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const hash = (value) => createHash('sha256').update(String(value)).digest('hex');
const estimateTokens = (text) => Math.ceil(String(text).length / 3);
const requestedModule = (value) => {
  const moduleIndex = Number(value);
  if (!Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex > MAX_MODULE_INDEX) throw apiError(400, 'INVALID_MODULE', 'This support request is not for an available module.');
  return moduleIndex;
};
const text = (copy, language) => language === 'ur' ? copy.urdu : copy.english;

const wordingInput = ({ candidate, summary }) => JSON.stringify({
  candidate: candidate.id,
  phase: summary.phase,
  active_minutes: Math.round((Number(summary.metrics?.activeMs) || 0) / 60000),
  long_pause_seconds: Math.round((Number(summary.metrics?.typingLongestPauseMs) || 0) / 1000),
  returns: Number(summary.metrics?.returns || 0) + Number(summary.metrics?.rereads || 0)
});

export const createAdaptiveSupportService = ({ config, firebase, ledger, provider = createModelProvider({ config }) }) => {
  const available = () => Boolean(config.adaptiveLearningEnabled && provider.available() && firebase.available && firebase.firestore && ledger);
  const profile = (uid) => firebase.firestore.collection('type2learnLearningProfiles').doc(hash(uid));
  const course = (uid) => profile(uid).collection('courses').doc(COURSE_ID);
  const proposalRef = (uid, moduleIndex, candidateId) => course(uid).collection('adaptiveProposals').doc(`${moduleIndex}-${candidateId}`);

  const status = () => ({ available: available(), requiresSignIn: true, model: provider.status().chatModel, provider: provider.status().primary || provider.status().fallback });
  const assertAvailable = () => {
    if (!config.adaptiveLearningEnabled) throw apiError(503, 'ADAPTIVE_LEARNING_UNAVAILABLE', 'Adaptive learning support is not enabled right now.');
    if (!provider.available() || !firebase.available || !firebase.firestore || !ledger) throw apiError(503, 'ADAPTIVE_LEARNING_UNAVAILABLE', 'Adaptive learning support is not connected right now.');
  };
  const learnerWithConsent = async (authorization) => {
    assertAvailable();
    const learner = await firebase.verifyBearer(authorization);
    const data = (await profile(learner.uid).get()).data() || {};
    if (data.consentVersion !== CONSENT_VERSION || data.adaptiveEnabled !== true) throw apiError(403, 'ADAPTIVE_CONSENT_REQUIRED', 'Choose adaptive learning support before requesting a suggestion.');
    return learner;
  };
  const personalisedDescription = async ({ learner, candidate, summary, language }) => {
    // Author copy is the guaranteed safe path. The configured low-cost model
    // may only shorten that wording; it never changes the candidate, reason,
    // or setting.
    const fallback = text(candidate.description, language);
    const instructions = 'Write one calm, optional learning-support sentence. Use no score, diagnosis, speed, disability, private data, pressure, or imperative. Do not name a setting. Max 22 words. Return JSON only: {"description":"..."}.';
    const input = wordingInput({ candidate, summary });
    const estimatedInputTokens = estimateTokens(instructions + input);
    let reservation;
    try {
      reservation = await ledger.reserve({
        kind: 'adaptive', userHash: hash(learner.uid),
        usage: { usd: usageEstimate(estimatedInputTokens, 70, config), inputTokens: estimatedInputTokens, outputTokens: 70, credits: 0 },
        caps: adaptiveUsageCaps(config), requestsPerMinute: config.adaptiveRequestsPerMinute
      });
      const generated = await provider.generate({
        purpose: 'chat',
        instructions,
        input,
        maxOutputTokens: 70,
        jsonSchema: { type: 'object', additionalProperties: false, required: ['description'], properties: { description: { type: 'string', maxLength: 180 } } }
      });
      const actualInput = Number(generated?.usage?.inputTokens) || estimatedInputTokens;
      const actualCachedInput = Number(generated?.usage?.cachedInputTokens) || 0;
      const actualOutput = Number(generated?.usage?.outputTokens) || 0;
      await ledger.settle({ ...reservation, actual: { usd: generated.provider === 'openai' ? usageEstimate(actualInput, actualOutput, config, actualCachedInput) : 0, inputTokens: actualInput, outputTokens: actualOutput, credits: 0 } });
      reservation = null;
      const parsed = JSON.parse(generated.text);
      const candidateCopy = String(parsed?.description || '').trim().replace(/\s+/g, ' ');
      return candidateCopy && candidateCopy.length <= 180 && !/score|diagnos|disabilit|speed|you must/i.test(candidateCopy) ? candidateCopy : fallback;
    } catch {
      return fallback;
    } finally {
      if (reservation) await ledger.release({ ...reservation, tolerateMissing: true }).catch(() => {});
    }
  };
  const proposal = async ({ authorization, body }) => {
    const learner = await learnerWithConsent(authorization);
    const moduleIndex = requestedModule(body?.moduleIndex);
    const summary = (await course(learner.uid).collection('modules').doc(String(moduleIndex)).get()).data();
    if (!summary) return { proposal: null };
    const candidate = adaptiveCandidateForSummary(summary);
    if (!candidate) return { proposal: null };
    const ref = proposalRef(learner.uid, moduleIndex, candidate.id);
    const existing = (await ref.get()).data();
    const now = new Date();
    if (existing?.status === 'active' || existing?.status === 'accepted') return { proposal: visibleProposal(existing) };
    if (existing?.status === 'declined' && Number(existing.cooldownUntilMs) > now.getTime()) return { proposal: null };
    const language = summary.language === 'ur' ? 'ur' : 'en';
    const created = {
      schemaVersion: 1, id: ref.id, moduleIndex, candidateId: candidate.id, kind: candidate.kind,
      preference: candidate.preference || null, title: text(candidate.title, language),
      description: await personalisedDescription({ learner, candidate, summary, language }),
      reason: text(candidate.reason, language), status: 'active', createdAt: now, updatedAt: now
    };
    await ref.set(created, { merge: true });
    return { proposal: visibleProposal(created) };
  };
  const decide = async ({ authorization, proposalId, body }) => {
    const learner = await learnerWithConsent(authorization);
    const id = String(proposalId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100);
    if (!id) throw apiError(400, 'INVALID_PROPOSAL', 'That support suggestion is not available.');
    const ref = course(learner.uid).collection('adaptiveProposals').doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw apiError(404, 'PROPOSAL_NOT_FOUND', 'That support suggestion is no longer available.');
    const current = snapshot.data() || {};
    if (current.status !== 'active') return { proposal: visibleProposal(current) };
    const accepted = body?.accepted === true;
    const update = accepted
      ? { status: 'accepted', decidedAt: new Date(), updatedAt: new Date() }
      : { status: 'declined', decidedAt: new Date(), updatedAt: new Date(), cooldownUntilMs: Date.now() + COOLDOWN_MS };
    await ref.set(update, { merge: true });
    return { proposal: visibleProposal({ ...current, ...update }) };
  };
  return { status, proposal, decide };
};
