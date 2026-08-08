import { createHash, randomUUID } from 'node:crypto';
import { apiError } from './errors.mjs';
import { assessmentUsageCaps, assessmentUsageEstimate } from './usage-ledger.mjs';
import { createModelProvider } from './model-provider.mjs';
import { createFallbackAssessmentBank } from './fallback-assessment-bank.mjs';
import {
  ASSESSMENT_COURSE_ID,
  assessmentBankJsonSchema,
  assessmentCurriculum,
  publicAssessmentItem,
  responseEvaluationJsonSchema,
  validateAssessmentAnswer,
  validateAssessmentBank,
  validateResponseEvaluation
} from './assessment-schemas.mjs';

const hash = (value) => createHash('sha256').update(String(value)).digest('hex');
const cleanIdentifier = (value, maximum = 100) => String(value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, maximum);
const estimateTokens = (text) => Math.ceil(String(text || '').length / 3);
const MAX_RUN_ITEMS = 21;

const stableModuleId = (moduleIndex) => moduleIndex === 'final' ? 'final' : `module-${Number(moduleIndex) + 1}`;
const nowDate = () => new Date();
const reviewModuleIndexFor = (objectiveIds = []) => {
  const match = String(Array.isArray(objectiveIds) ? objectiveIds[0] || '' : '').match(/^m(\d{2})-/);
  const index = Number(match?.[1]) - 1;
  return Number.isInteger(index) && index >= 0 && index <= 10 ? index : null;
};

// A run gets a random id once, then receives a stable order derived from it.
// This avoids a hidden Math.random() reshuffle after reloads or retries.
const stableItemOrder = (items, seed) => [...items]
  .map((item) => ({
    item,
    rank: createHash('sha256').update(`${seed}:${item.id}`).digest('hex')
  }))
  .sort((left, right) => left.rank.localeCompare(right.rank) || left.item.id.localeCompare(right.item.id))
  .map(({ item }) => item.id);

const generationInstructions = (curriculum) => [
  'Create a candidate assessment bank for a nonprofit education course.',
  'Use only the supplied approved objective and source text. Do not diagnose, label, infer learner traits, mention scoring, timers, speed, rankings, or private data.',
  curriculum.scope === 'final'
    ? 'Write clear, respectful questions in the requested language. Use exactly twelve MCQs and eight or nine open-response items. Cover every approved objective without repeating an idea.'
    : 'Write clear, respectful questions in the requested language. Use at most four open-response items and at most five MCQs. Do not repeat an idea.',
  'For open items, answerGuide and rubric are internal evaluator material, never learner copy. For MCQ items, use exactly four plausible options and one correctOptionIndex.',
  'Feedback must be short, supportive, and must not reveal a correct answer.',
  'Return only the JSON object that matches the supplied schema.',
  `Course: ${curriculum.courseId}; version: ${curriculum.curriculumVersion}; scope: ${curriculum.scope}; module: ${curriculum.moduleIndex}; language: ${curriculum.language}.`
].join('\n');

const generationInput = (curriculum) => JSON.stringify({
  approvedObjectives: curriculum.objectives,
  approvedSource: curriculum.source,
  bankVersion: `candidate-${curriculum.curriculumVersion}-${stableModuleId(curriculum.moduleIndex)}`
});

const evaluationInstructions = (curriculum, item) => [
  'Evaluate one learner response against only the supplied approved curriculum source and rubric.',
  'Do not diagnose, infer traits, mention a score, percentage, speed, failure, or confidence. Do not reveal an answer or rewrite a response for the learner.',
  'Use demonstrated only when the response shows the approved objective. Use needs-review when it does not yet show it. Use uncertain when wording is too ambiguous to evaluate safely.',
  'Return one short, calm feedback sentence that invites the next helpful action without supplying the answer.',
  'Return JSON only.',
  `Objective: ${JSON.stringify(curriculum.objectives.filter((objective) => item.objectiveIds.includes(objective.id)))}`,
  `Approved source: ${curriculum.source}`,
  `Internal rubric: ${JSON.stringify(item.rubric)}`,
  `Internal answer guide: ${item.answerGuide}`
].join('\n');

const evaluationInput = (answer) => JSON.stringify({ learnerResponse: answer });

const bankKey = (curriculum) => `${curriculum.courseId}--${curriculum.curriculumVersion}--${curriculum.language}`;
const generatedBankKey = (curriculum) => `${curriculum.courseId}:${curriculum.curriculumVersion}:${curriculum.language}:${curriculum.moduleIndex}`;
const fallbackEvaluation = (item) => ({
  outcome: 'uncertain',
  demonstratedObjectiveIds: [],
  needsReviewObjectiveIds: [],
  feedback: item?.responseMode === 'open'
    ? 'Result under review. Your response is recorded, and you can continue to the next question.'
    : 'Result under review. Your choice is recorded, and you can continue to the next question.'
});

const visibleRun = (run, bank) => {
  const itemIds = Array.isArray(run?.itemOrder) ? run.itemOrder.slice(0, MAX_RUN_ITEMS) : [];
  const currentIndex = Math.max(0, Math.min(Number(run?.currentIndex) || 0, itemIds.length));
  const item = bank?.items?.find((candidate) => candidate.id === itemIds[currentIndex]) || null;
  const completed = run?.status === 'complete';
  const reviewModuleIndex = completed && run?.completionKind === 'review'
    ? reviewModuleIndexFor(run?.missingObjectiveIds)
    : null;
  return {
    runId: String(run?.id || ''),
    courseId: ASSESSMENT_COURSE_ID,
    moduleIndex: run?.moduleIndex === 'final' ? 'final' : Number(run?.moduleIndex) || 0,
    scope: run?.moduleIndex === 'final' ? 'final' : 'module',
    language: run?.language === 'ur' ? 'ur' : 'en',
    status: completed ? 'complete' : 'active',
    completionKind: completed && run?.completionKind === 'ready' ? 'ready' : completed ? 'review' : '',
    reviewModuleIndex,
    currentQuestion: completed || !item ? null : publicAssessmentItem(item),
    questionPosition: completed ? itemIds.length : currentIndex + 1,
    questionCount: itemIds.length,
    nextHelpfulStep: completed
      ? (run?.completionKind === 'ready'
        ? (run?.moduleIndex === 'final' ? 'You completed the final course check.' : 'You are ready for the next module.')
        : 'You did useful work. One course idea could use another look before the next calm check.')
      : 'Answer one question at a time. There is no timer or score shown here.'
  };
};

export const createAssessmentService = ({ config, firebase, ledger, provider = createModelProvider({ config }) }) => {
  const assessmentBanks = () => firebase.firestore.collection('type2learnAssessmentBanks');
  const bankModuleRef = (curriculum) => assessmentBanks().doc(bankKey(curriculum)).collection('modules').doc(stableModuleId(curriculum.moduleIndex));
  const runCollection = (uid) => firebase.firestore.collection('type2learnAssessmentRuns').doc(hash(uid)).collection('runs');
  const learningProfile = (uid) => firebase.firestore.collection('type2learnLearningProfiles').doc(hash(uid));
  const hasReviewerConfiguration = () => config.assessmentReviewerUids instanceof Set && config.assessmentReviewerUids.size > 0;
  const available = () => Boolean(config.aiAssessmentsEnabled && firebase.available && firebase.firestore);
  const status = () => ({
    available: available(),
    requiresSignIn: true,
    reviewerWorkflowConfigured: hasReviewerConfiguration(),
    draftModel: provider.status().heavyModel,
      evaluationModel: provider.status().chatModel,
      authoredReserveAvailable: true
  });
  const assertAvailable = () => {
    if (!config.aiAssessmentsEnabled) throw apiError(503, 'ASSESSMENTS_UNAVAILABLE', 'Understanding checks are not available right now.');
    if (!firebase.available || !firebase.firestore) {
      throw apiError(503, 'ASSESSMENTS_UNAVAILABLE', 'Understanding checks are not connected right now.');
    }
  };
  const assertGenerationAvailable = () => {
    assertAvailable();
    if (!ledger || !provider.availableFor?.('heavy')) {
      throw apiError(503, 'ASSESSMENT_GENERATION_UNAVAILABLE', 'Assessment generation is not connected right now. The authored assessment bank remains available.');
    }
  };
  const signedInAccount = async (authorization) => {
    assertAvailable();
    return firebase.verifyBearer(authorization);
  };
  const learner = async (authorization) => {
    const account = await signedInAccount(authorization);
    // ADAPTIVE LEARNING: a written or spoken assessment response may be
    // evaluated by the configured model. A feature flag never substitutes for
    // the learner's explicit data-use choice.
    const profile = (await learningProfile(account.uid).get()).data() || {};
    if (profile.consentVersion !== 1 || profile.adaptiveEnabled !== true) {
      throw apiError(403, 'ADAPTIVE_CONSENT_REQUIRED', 'Choose adaptive learning support before starting an understanding check.');
    }
    return account;
  };
  const reviewer = async (authorization) => {
    const account = await signedInAccount(authorization);
    if (!hasReviewerConfiguration() || !config.assessmentReviewerUids.has(account.uid)) {
      throw apiError(403, 'ASSESSMENT_REVIEW_REQUIRED', 'This assessment-bank action requires an approved curriculum reviewer.');
    }
    return account;
  };
  const reserve = async ({ userHash, inputTokens, outputTokens }) => ledger.reserve({
    kind: 'assessment',
    userHash,
    usage: {
      // Reserve using the paid fallback maximum; free Gemini use settles at
      // zero. This keeps concurrent fallback requests inside the fixed cap.
      usd: assessmentUsageEstimate(inputTokens, outputTokens, config),
      inputTokens,
      outputTokens,
      credits: 0
    },
    caps: assessmentUsageCaps(config),
    requestsPerMinute: config.assessmentRequestsPerMinute
  });
  const settle = async ({ reservation, generated, estimatedInputTokens }) => ledger.settle({
    ...reservation,
    actual: {
      usd: generated.provider === 'openai'
        ? assessmentUsageEstimate(Number(generated?.usage?.inputTokens) || estimatedInputTokens, Number(generated?.usage?.outputTokens) || 0, config, Number(generated?.usage?.cachedInputTokens) || 0)
        : 0,
      inputTokens: Number(generated?.usage?.inputTokens) || estimatedInputTokens,
      outputTokens: Number(generated?.usage?.outputTokens) || 0,
      credits: 0
    }
  });

  const createDraft = async ({ authorization, body }) => {
    const account = await reviewer(authorization);
    assertGenerationAvailable();
    const curriculum = assessmentCurriculum(body?.scope === 'final' ? 'final' : body?.moduleIndex, body?.language);
    const moduleRef = bankModuleRef(curriculum);
    const generationRef = moduleRef.collection('generationRequests').doc(String(Math.floor(Date.now() / config.assessmentGenerationIntervalMs)));
    try {
      await firebase.firestore.runTransaction(async (transaction) => {
        const existing = await transaction.get(generationRef);
        if (existing.exists) throw apiError(429, 'ASSESSMENT_GENERATION_COOLDOWN', 'A draft for this module is already being prepared. Try again later.');
        transaction.create(generationRef, { createdAt: nowDate(), requestedByHash: hash(account.uid) });
      });
    } catch (error) {
      if (error?.code) throw error;
      throw apiError(503, 'ASSESSMENT_GENERATION_UNAVAILABLE', 'The assessment draft could not start safely.');
    }
    const instructions = generationInstructions(curriculum);
    const input = generationInput(curriculum);
    const estimatedInputTokens = estimateTokens(instructions + input);
    let reservation;
    try {
      reservation = await reserve({ userHash: hash(`assessment-bank:${generatedBankKey(curriculum)}`), inputTokens: estimatedInputTokens, outputTokens: config.assessmentMaxOutputTokens });
      const generated = await provider.generate({
        purpose: 'heavy',
        instructions,
        input,
        maxOutputTokens: config.assessmentMaxOutputTokens,
        jsonSchema: assessmentBankJsonSchema(curriculum)
      });
      await settle({ reservation, generated, estimatedInputTokens });
      reservation = null;
      let parsed;
      try { parsed = JSON.parse(generated.text); } catch { throw apiError(422, 'INVALID_ASSESSMENT_BANK', 'The generated assessment bank was not safe to publish.'); }
      const bank = validateAssessmentBank(parsed, curriculum);
      const id = cleanIdentifier(body?.draftId) || randomUUID();
      const ref = moduleRef.collection('drafts').doc(id);
      await ref.create({
        schemaVersion: 1,
        id,
        status: 'pending-human-review',
        bank,
        provider: generated.provider,
        model: generated.model,
        createdAt: nowDate(),
        createdByHash: hash(account.uid)
      });
      return { draft: { id, status: 'pending-human-review', moduleIndex: curriculum.moduleIndex, language: curriculum.language, itemCount: bank.items.length } };
    } catch (error) {
      if (reservation) await ledger.release({ ...reservation, tolerateMissing: true }).catch(() => {});
      throw error;
    }
  };

  const publishDraft = async ({ authorization, body }) => {
    await reviewer(authorization);
    const curriculum = assessmentCurriculum(body?.scope === 'final' ? 'final' : body?.moduleIndex, body?.language);
    const id = cleanIdentifier(body?.draftId);
    if (!id) throw apiError(400, 'INVALID_ASSESSMENT_DRAFT', 'Choose a valid reviewed draft.');
    const moduleRef = bankModuleRef(curriculum);
    const draftRef = moduleRef.collection('drafts').doc(id);
    const snapshot = await draftRef.get();
    if (!snapshot.exists) throw apiError(404, 'ASSESSMENT_DRAFT_NOT_FOUND', 'That assessment draft is not available.');
    const draft = snapshot.data() || {};
    if (draft.status !== 'pending-human-review') throw apiError(409, 'ASSESSMENT_DRAFT_NOT_REVIEWABLE', 'That assessment draft is not awaiting review.');
    const bank = validateAssessmentBank(draft.bank, curriculum);
    const publishedRef = moduleRef.collection('published').doc('active');
    await firebase.firestore.runTransaction(async (transaction) => {
      transaction.set(publishedRef, { schemaVersion: 1, status: 'published', id, bank, publishedAt: nowDate() });
      transaction.set(draftRef, { status: 'published', publishedAt: nowDate() }, { merge: true });
    });
    return { published: true, moduleIndex: curriculum.moduleIndex, language: curriculum.language, itemCount: bank.items.length };
  };

  const activeBank = async (curriculum) => {
    const snapshot = await bankModuleRef(curriculum).collection('published').doc('active').get();
    if (!snapshot.exists) return validateAssessmentBank(createFallbackAssessmentBank(curriculum), curriculum);
    const data = snapshot.data() || {};
    if (data.status !== 'published') return validateAssessmentBank(createFallbackAssessmentBank(curriculum), curriculum);
    return validateAssessmentBank(data.bank, curriculum);
  };

  const start = async ({ authorization, body }) => {
    const account = await learner(authorization);
    const curriculum = assessmentCurriculum(body?.scope === 'final' ? 'final' : body?.moduleIndex, body?.language);
    const bank = await activeBank(curriculum);
    const id = randomUUID();
    // The generated bank is reviewed before publication. This per-run order
    // is stable and stores item IDs only—never answers or answer keys.
    const itemOrder = stableItemOrder(bank.items, id);
    const run = {
      schemaVersion: 1, id, status: 'active', courseId: curriculum.courseId,
      curriculumVersion: curriculum.curriculumVersion, moduleIndex: curriculum.moduleIndex,
      language: curriculum.language, bankId: bank.bankVersion, itemOrder,
      currentIndex: 0, outcomes: [], createdAt: nowDate(), updatedAt: nowDate()
    };
    await runCollection(account.uid).doc(id).create(run);
    return { run: visibleRun(run, bank) };
  };

  const evaluateOpen = async ({ account, curriculum, item, answer }) => {
    if (!ledger || !provider.availableFor?.('chat')) return fallbackEvaluation(item);
    const instructions = evaluationInstructions(curriculum, item);
    const input = evaluationInput(answer);
    const estimatedInputTokens = estimateTokens(instructions + input);
    let reservation;
    try {
      reservation = await reserve({ userHash: hash(account.uid), inputTokens: estimatedInputTokens, outputTokens: 180 });
      const generated = await provider.generate({ purpose: 'chat', instructions, input, maxOutputTokens: 180, jsonSchema: responseEvaluationJsonSchema(curriculum) });
      await settle({ reservation, generated, estimatedInputTokens });
      reservation = null;
      return validateResponseEvaluation(JSON.parse(generated.text), { item, curriculum });
    } catch {
      return fallbackEvaluation(item);
    } finally {
      if (reservation) await ledger.release({ ...reservation, tolerateMissing: true }).catch(() => {});
    }
  };

  const answer = async ({ authorization, runId, body }) => {
    const account = await learner(authorization);
    const id = cleanIdentifier(runId);
    if (!id) throw apiError(400, 'INVALID_ASSESSMENT_RUN', 'That understanding check is not available.');
    const ref = runCollection(account.uid).doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw apiError(404, 'ASSESSMENT_RUN_NOT_FOUND', 'That understanding check is not available.');
    const run = snapshot.data() || {};
    if (run.status !== 'active') throw apiError(409, 'ASSESSMENT_ALREADY_COMPLETE', 'This understanding check is already complete.');
    const curriculum = assessmentCurriculum(run.moduleIndex, run.language);
    const bank = await activeBank(curriculum);
    const item = bank.items.find((candidate) => candidate.id === run.itemOrder?.[run.currentIndex]);
    if (!item) throw apiError(409, 'ASSESSMENT_ITEM_NOT_AVAILABLE', 'This understanding check needs to be restarted safely.');
    const cleanAnswer = validateAssessmentAnswer({ item, answer: body?.answer });
    const evaluation = item.responseMode === 'mcq'
      ? (cleanAnswer.optionIndex === item.correctOptionIndex
        ? { outcome: 'demonstrated', demonstratedObjectiveIds: item.objectiveIds, needsReviewObjectiveIds: [], feedback: 'Result under review. Your choice is recorded, and you can continue when you are ready.' }
        : { outcome: 'needs-review', demonstratedObjectiveIds: [], needsReviewObjectiveIds: item.objectiveIds, feedback: 'Result under review. Your choice is recorded, and you can continue when you are ready.' })
      : await evaluateOpen({ account, curriculum, item, answer: cleanAnswer.text });
    const outcomes = [...(Array.isArray(run.outcomes) ? run.outcomes : []), {
      itemId: item.id,
      outcome: evaluation.outcome,
      demonstratedObjectiveIds: evaluation.demonstratedObjectiveIds,
      needsReviewObjectiveIds: evaluation.needsReviewObjectiveIds,
      answeredAt: nowDate()
    }];
    const nextIndex = Number(run.currentIndex) + 1;
    const complete = nextIndex >= run.itemOrder.length;
    // A learner is ready when every approved objective has at least one piece
    // of demonstrated evidence. Requiring every individual question to be
    // perfect would turn this into a score by another name and make the calm
    // fallback impossible to complete when model evaluation is unavailable.
    const demonstrated = new Set(outcomes.flatMap((outcome) => outcome.outcome === 'demonstrated' ? outcome.demonstratedObjectiveIds : []));
    const missingObjectiveIds = curriculum.objectives
      .map((objective) => objective.id)
      .filter((objectiveId) => !demonstrated.has(objectiveId));
    const completionKind = complete && missingObjectiveIds.length === 0 ? 'ready' : 'review';
    const updated = { ...run, currentIndex: nextIndex, outcomes, status: complete ? 'complete' : 'active', completionKind: complete ? completionKind : null, missingObjectiveIds: complete ? missingObjectiveIds : [], updatedAt: nowDate() };
    // No raw typed/spoken answer, prompt response, option choice, score, or
    // model chain-of-thought is persisted. Only a bounded outcome remains.
    await ref.set({ currentIndex: updated.currentIndex, outcomes, status: updated.status, completionKind: updated.completionKind, missingObjectiveIds: updated.missingObjectiveIds, updatedAt: updated.updatedAt }, { merge: true });
    const feedback = /^result under review\./i.test(String(evaluation.feedback || ''))
      ? evaluation.feedback
      : 'Result under review. ' + String(evaluation.feedback || 'You can continue to the next question when you are ready.');
    return { evaluation: { outcome: evaluation.outcome, feedback }, run: visibleRun(updated, bank) };
  };

  const getRun = async ({ authorization, runId }) => {
    const account = await learner(authorization);
    const id = cleanIdentifier(runId);
    const snapshot = await runCollection(account.uid).doc(id).get();
    if (!snapshot.exists) throw apiError(404, 'ASSESSMENT_RUN_NOT_FOUND', 'That understanding check is not available.');
    const run = snapshot.data() || {};
    const curriculum = assessmentCurriculum(run.moduleIndex, run.language);
    return { run: visibleRun(run, await activeBank(curriculum)) };
  };

  return { status, createDraft, publishDraft, start, answer, getRun };
};
