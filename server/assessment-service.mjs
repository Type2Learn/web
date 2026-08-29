import { createHash, randomUUID } from 'node:crypto';
import { apiError } from './errors.mjs';
import { assessmentUsageCaps, assessmentUsageEstimate } from './usage-ledger.mjs';
import { createModelProvider } from './model-provider.mjs';
import { createFallbackAssessmentBank } from './fallback-assessment-bank.mjs';
import { constrainAssessmentEvaluation, deterministicAssessmentEvaluation } from './assessment-evaluator.mjs';
import { assessmentLearningSignals, assessmentProgressDecision, objectiveFocusFromModuleEvidence, prioritiseAssessmentItems } from './assessment-monitor.mjs';
import {
  ASSESSMENT_COURSE_ID,
  assessmentBankJsonSchema,
  assessmentCurriculum,
  assessmentCurriculumFromManifest,
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
const MAX_RECHECKS_PER_SCOPE = 2;
const MAX_RETENTION_DAYS = 365;

const stableModuleId = (moduleIndex) => moduleIndex === 'final' ? 'final' : `module-${Number(moduleIndex) + 1}`;
const nowDate = () => new Date();
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
const fallbackEvaluation = (item, curriculum, answer = '') => deterministicAssessmentEvaluation({ item, curriculum, answer });

const visibleRun = (run, bank) => {
  const itemIds = Array.isArray(run?.itemOrder) ? run.itemOrder.slice(0, MAX_RUN_ITEMS) : [];
  const currentIndex = Math.max(0, Math.min(Number(run?.currentIndex) || 0, itemIds.length));
  const item = bank?.items?.find((candidate) => candidate.id === itemIds[currentIndex]) || null;
  const completed = run?.status === 'complete';
  const storedReviewModuleIndex = run?.reviewModuleIndex;
  const reviewModuleIndex = completed && run?.completionKind === 'review'
    && storedReviewModuleIndex !== null && storedReviewModuleIndex !== undefined
    && Number.isInteger(Number(storedReviewModuleIndex))
    ? Number(storedReviewModuleIndex)
    : null;
  return {
    runId: String(run?.id || ''),
    courseId: String(run?.courseId || ASSESSMENT_COURSE_ID),
    courseVersion: String(run?.curriculumVersion || ''),
    moduleIndex: run?.moduleIndex === 'final' ? 'final' : Number(run?.moduleIndex) || 0,
    scope: run?.moduleIndex === 'final' ? 'final' : 'module',
    language: run?.language === 'ur' ? 'ur' : 'en',
    status: completed ? 'complete' : 'active',
    completionKind: completed && run?.completionKind === 'ready' ? 'ready' : completed ? 'review' : '',
    recheckNumber: Math.max(0, Math.min(MAX_RECHECKS_PER_SCOPE, Number(run?.recheckNumber) || 0)),
    recheckAvailable: completed && run?.completionKind === 'review'
      ? Number(run?.recheckNumber || 0) < MAX_RECHECKS_PER_SCOPE && Boolean(run?.reviewAcknowledgedAt)
      : false,
    reviewAcknowledged: completed && run?.completionKind === 'review' ? Boolean(run?.reviewAcknowledgedAt) : false,
    reviewModuleIndex,
    reviewFocusObjectiveId: completed && run?.completionKind === 'review' ? String(run?.reviewFocusObjectiveId || '') : '',
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

export const createAssessmentService = ({ config, firebase, ledger, courseCatalog = null, provider = createModelProvider({ config }) }) => {
  const assessmentBanks = () => firebase.firestore.collection('type2learnAssessmentBanks');
  const bankModuleRef = (curriculum) => assessmentBanks().doc(bankKey(curriculum)).collection('modules').doc(stableModuleId(curriculum.moduleIndex));
  const runCollection = (uid) => firebase.firestore.collection('type2learnAssessmentRuns').doc(hash(uid)).collection('runs');
  const learningProfile = (uid) => firebase.firestore.collection('type2learnLearningProfiles').doc(hash(uid));
  // Assessment outcomes are optional learner records too. Keep their lifetime
  // aligned with the consented behavioural summaries rather than leaving a
  // separate, indefinite assessment trail behind.
  const retentionDays = () => Math.max(1, Math.min(MAX_RETENTION_DAYS, Number(config.adaptiveRetentionDays) || 90));
  const runExpiry = (timestamp = nowDate()) => new Date(timestamp.getTime() + (retentionDays() * 24 * 60 * 60 * 1000));
  const isExpired = (run = {}, timestamp = nowDate()) => {
    const expiresAt = run?.expiresAt;
    const expiry = expiresAt?.toDate?.() || (expiresAt instanceof Date ? expiresAt : new Date(expiresAt));
    return Number.isFinite(expiry?.getTime?.()) && expiry.getTime() <= timestamp.getTime();
  };
  // Firestore TTL is configured on `expiresAt` in production. This bounded
  // cleanup is intentionally opportunistic so learner-owned records are also
  // removed when TTL delivery is delayed, without a broad background scan.
  const trimExpiredRuns = async (uid) => {
    const expired = await runCollection(uid).where('expiresAt', '<=', nowDate()).limit(100).get().catch(() => null);
    if (!expired?.docs?.length) return;
    const batch = firebase.firestore.batch();
    expired.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  };
  const hasReviewerConfiguration = () => config.assessmentReviewerUids instanceof Set && config.assessmentReviewerUids.size > 0;
  const available = () => Boolean(config.aiAssessmentsEnabled && firebase.available && firebase.firestore);
  const status = () => ({
    available: available(),
    requiresSignIn: true,
    reviewerWorkflowConfigured: hasReviewerConfiguration(),
    draftModel: provider.status().heavyModel,
      evaluationModel: provider.status().miniModel || provider.status().chatModel,
      monitoring: 'objective-evidence-without-scores',
      authoredReserveAvailable: true,
      retentionDays: retentionDays(),
      retentionField: 'expiresAt',
      physicalDeletionRequiresFirestoreTtl: true
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
  // ASSESSMENT CURRICULUM RESOLUTION: the legacy course retains its stable
  // authored bank. Every reviewed teacher course is resolved through the
  // same access-controlled learner manifest that powers the course player.
  // A browser can therefore never substitute a different lesson's content
  // into an assessment request.
  const curriculumFor = async ({ authorization, courseId, courseVersion, moduleIndex, language }) => {
    const requestedModule = moduleIndex === 'final' ? 'final' : moduleIndex;
    const requestedCourseId = String(courseId || '').trim().toLowerCase();
    const requestedVersion = String(courseVersion || '').trim();
    // The historical course keeps its stable authored curriculum only when a
    // version is not supplied. An explicitly requested reviewed version must
    // be resolved through the protected manifest just like every new course.
    if (!requestedCourseId || (requestedCourseId === ASSESSMENT_COURSE_ID && !requestedVersion)) {
      return assessmentCurriculum(requestedModule, language);
    }
    if (!requestedVersion || (typeof courseCatalog?.assessmentContext !== 'function' && typeof courseCatalog?.manifest !== 'function')) {
      throw apiError(400, 'ASSESSMENT_COURSE_REQUIRED', 'Choose a published reviewed course before starting its understanding check.');
    }
    const loader = typeof courseCatalog?.assessmentContext === 'function'
      ? courseCatalog.assessmentContext.bind(courseCatalog)
      : courseCatalog.manifest.bind(courseCatalog);
    const loaded = await loader({ authorization, courseId: requestedCourseId, version: requestedVersion });
    return assessmentCurriculumFromManifest(loaded?.manifest, requestedModule, language, { privateManifest: loaded?.privateManifest || null });
  };
  const learningSummaryRef = (uid, curriculum) => {
    const courseKey = curriculum.curriculumVersion
      ? `${curriculum.courseId}@${curriculum.curriculumVersion}`
      : curriculum.courseId;
    return learningProfile(uid).collection('courses').doc(courseKey).collection('modules').doc(String(curriculum.moduleIndex));
  };
  const courseSummaryCollection = (uid, curriculum) => {
    const courseKey = curriculum.curriculumVersion
      ? `${curriculum.courseId}@${curriculum.curriculumVersion}`
      : curriculum.courseId;
    return learningProfile(uid).collection('courses').doc(courseKey).collection('modules');
  };
  // Behaviour-aware final checks use the same compact, consented aggregate
  // schema as a module. It cannot add raw learner language to an assessment
  // run, and it only influences format/order—not any objective result.
  const finalSummary = async (uid, curriculum) => {
    const snapshot = await courseSummaryCollection(uid, curriculum).limit(100).get();
    // A delayed Firestore TTL deletion must not let an expired behavioural
    // summary influence final-question ordering in the meantime.
    const summaries = snapshot.docs.map((document) => document.data() || {}).filter((summary) => !isExpired(summary));
    const metric = (name, maximum) => Math.min(maximum, summaries.reduce((total, item) => total + Math.max(0, Number(item?.metrics?.[name]) || 0), 0));
    return {
      metrics: {
        activeMs: metric('activeMs', 4 * 60 * 60 * 1000),
        typingCharacters: metric('typingCharacters', 12000),
        // Math.min(...[]) becomes Infinity when a learner reaches the final
        // check without consented module summaries. A missing signal must be
        // neutral, not interpreted as an extremely long pause.
        typingLongestPauseMs: summaries.reduce((longest, item) => Math.max(
          longest,
          Math.min(10 * 60 * 1000, Math.max(0, Number(item?.metrics?.typingLongestPauseMs) || 0))
        ), 0),
        rereads: metric('rereads', 100),
        returns: metric('returns', 100),
        readingSectionBacktracks: metric('readingSectionBacktracks', 100),
        scrollBacktracks: metric('scrollBacktracks', 500),
        typingBursts: metric('typingBursts', 12000),
        typingFocusReturns: metric('typingFocusReturns', 200)
      },
      support: {
        textToSpeech: summaries.some((item) => item?.support?.textToSpeech === true),
        visualOpened: summaries.some((item) => item?.support?.visualOpened === true)
      },
      behaviour: {
        states: [...new Set(summaries.flatMap((item) => Array.isArray(item?.behaviour?.states) ? item.behaviour.states : []))].slice(0, 6)
      }
    };
  };
  const completedModuleEvidence = async (uid, curriculum) => {
    if (curriculum.scope !== 'final') return [];
    // One indexed equality query and an in-memory bounded filter avoids a
    // composite index requirement while keeping the final-check request small.
    const snapshot = await runCollection(uid).where('courseId', '==', curriculum.courseId).limit(200).get();
    return snapshot.docs.map((document) => document.data() || {}).filter((run) => (
      run?.status === 'complete'
      && run?.moduleIndex !== 'final'
      && String(run?.curriculumVersion || '') === String(curriculum.curriculumVersion || '')
      && !isExpired(run)
      && Array.isArray(run?.outcomes)
    )).map((run) => ({ outcomes: run.outcomes.slice(0, 9) }));
  };
  const completedScopeRuns = async (uid, curriculum) => {
    const snapshot = await runCollection(uid).where('courseId', '==', curriculum.courseId).limit(200).get();
    return snapshot.docs.map((document) => document.data() || {}).filter((run) => (
      run?.status === 'complete'
      && String(run?.curriculumVersion || '') === String(curriculum.curriculumVersion || '')
      && String(run?.language || 'en') === String(curriculum.language || 'en')
      && !isExpired(run)
      && String(run?.moduleIndex) === String(curriculum.moduleIndex)
    ));
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
    const curriculum = await curriculumFor({ authorization, courseId: body?.courseId, courseVersion: body?.courseVersion, moduleIndex: body?.scope === 'final' ? 'final' : body?.moduleIndex, language: body?.language });
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
        purpose: curriculum.scope === 'final' ? 'final-assessment-generation' : 'assessment-generation',
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

  // HUMAN REVIEW ONLY: a reviewer can reopen a generated bank before it is
  // published. This is the only API projection that includes the internal
  // answer key/rubric fields; no learner endpoint shares this representation.
  const getDraft = async ({ authorization, query }) => {
    await reviewer(authorization);
    const curriculum = await curriculumFor({
      authorization,
      courseId: query?.courseId,
      courseVersion: query?.courseVersion,
      moduleIndex: query?.scope === 'final' ? 'final' : query?.moduleIndex,
      language: query?.language
    });
    const id = cleanIdentifier(query?.draftId);
    if (!id) throw apiError(400, 'INVALID_ASSESSMENT_DRAFT', 'Choose a valid reviewed draft.');
    const snapshot = await bankModuleRef(curriculum).collection('drafts').doc(id).get();
    if (!snapshot.exists) throw apiError(404, 'ASSESSMENT_DRAFT_NOT_FOUND', 'That assessment draft is not available.');
    const draft = snapshot.data() || {};
    const bank = validateAssessmentBank(draft.bank, curriculum);
    return {
      draft: {
        id,
        status: String(draft.status || ''),
        createdAt: draft.createdAt || null,
        provider: String(draft.provider || ''),
        model: String(draft.model || ''),
        courseId: curriculum.courseId,
        courseVersion: curriculum.curriculumVersion,
        scope: curriculum.scope,
        moduleIndex: curriculum.moduleIndex,
        language: curriculum.language,
        // Reviewers need the complete question/answer-key pairing to approve
        // a bank. The response is protected by reviewer() and never cached in
        // the course player or returned by /assessment/start.
        bank
      }
    };
  };

  const publishDraft = async ({ authorization, body }) => {
    await reviewer(authorization);
    const curriculum = await curriculumFor({ authorization, courseId: body?.courseId, courseVersion: body?.courseVersion, moduleIndex: body?.scope === 'final' ? 'final' : body?.moduleIndex, language: body?.language });
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
    await trimExpiredRuns(account.uid);
    const curriculum = await curriculumFor({ authorization, courseId: body?.courseId, courseVersion: body?.courseVersion, moduleIndex: body?.scope === 'final' ? 'final' : body?.moduleIndex, language: body?.language });
    const bank = await activeBank(curriculum);
    const priorScopeRuns = await completedScopeRuns(account.uid, curriculum);
    if (priorScopeRuns.some((run) => run?.completionKind === 'ready')) {
      throw apiError(409, 'ASSESSMENT_ALREADY_READY', 'This understanding check is already complete. Continue with the next course step when you are ready.');
    }
    const recheckNumber = priorScopeRuns.filter((run) => run?.completionKind === 'review').length;
    const latestReview = priorScopeRuns
      .filter((run) => run?.completionKind === 'review')
      .sort((left, right) => Number(right?.recheckNumber || 0) - Number(left?.recheckNumber || 0))[0] || null;
    // A learner chooses whether to revisit the precise objective first. A
    // browser cannot bypass that review merely by invoking the start endpoint.
    if (latestReview && !latestReview.reviewAcknowledgedAt) {
      throw apiError(409, 'ASSESSMENT_REVIEW_REQUIRED', 'Open the related course idea before choosing another calm check.');
    }
    // `recheckNumber` is the number of completed review outcomes before this
    // run. Permit the initial run plus two calm rechecks, then protect the
    // limit on a direct API call as well as in the UI.
    if (recheckNumber > MAX_RECHECKS_PER_SCOPE) {
      throw apiError(409, 'ASSESSMENT_RECHECK_LIMIT', 'This check is saved. Return to the related course idea before starting a new check.');
    }
    const id = randomUUID();
    const moduleSummary = curriculum.scope === 'final'
      ? null
      : (await learningSummaryRef(account.uid, curriculum).get()).data() || {};
    const summaryData = curriculum.scope === 'final'
      ? await finalSummary(account.uid, curriculum)
      : isExpired(moduleSummary) ? {} : moduleSummary;
    const assessmentSignals = assessmentLearningSignals(summaryData);
    const objectiveFocus = curriculum.scope === 'final'
      ? objectiveFocusFromModuleEvidence({ curriculum, moduleRuns: await completedModuleEvidence(account.uid, curriculum) })
      : { focusObjectiveIds: [], evidence: [] };
    assessmentSignals.objectiveFocusIds = objectiveFocus.focusObjectiveIds.slice(0, 8);
    // The reviewed bank never changes. A run uses only compact, consented
    // summary signals to choose whether an own-words explanation or an MCQ is
    // shown first. No behaviour signal can decide a learner's result.
    const itemOrder = prioritiseAssessmentItems({ items: bank.items, runId: id, signals: assessmentSignals });
    const run = {
      schemaVersion: 1, id, status: 'active', courseId: curriculum.courseId,
      curriculumVersion: curriculum.curriculumVersion, moduleIndex: curriculum.moduleIndex,
      language: curriculum.language, bankId: bank.bankVersion, itemOrder, assessmentSignals,
      recheckNumber,
      // Stored as a bounded audit trace for the learner's export/delete path.
      // It says which reviewed objectives were prioritised, never why a
      // learner performed a certain way and never contains a score.
      finalEvidenceFocus: curriculum.scope === 'final' ? objectiveFocus.evidence : [],
      currentIndex: 0, outcomes: [], createdAt: nowDate(), updatedAt: nowDate(), expiresAt: runExpiry()
    };
    await runCollection(account.uid).doc(id).create(run);
    return { run: visibleRun(run, bank) };
  };

  const evaluateOpen = async ({ account, curriculum, item, answer }) => {
    const deterministic = fallbackEvaluation(item, curriculum, answer);
    if (!ledger || !provider.availableFor?.('chat')) return deterministic;
    const instructions = evaluationInstructions(curriculum, item);
    const input = evaluationInput(answer);
    const estimatedInputTokens = estimateTokens(instructions + input);
    let reservation;
    try {
      reservation = await reserve({ userHash: hash(account.uid), inputTokens: estimatedInputTokens, outputTokens: 180 });
      const generated = await provider.generate({ purpose: 'assessment-evaluation', instructions, input, maxOutputTokens: 180, jsonSchema: responseEvaluationJsonSchema(curriculum) });
      await settle({ reservation, generated, estimatedInputTokens });
      reservation = null;
      const validated = validateResponseEvaluation(JSON.parse(generated.text), { item, curriculum });
      return constrainAssessmentEvaluation({ candidate: validated, deterministic, item });
    } catch {
      return deterministic;
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
    if (isExpired(run)) throw apiError(410, 'ASSESSMENT_RUN_EXPIRED', 'This saved understanding check has expired. You can start a new calm check when you are ready.');
    if (run.status !== 'active') throw apiError(409, 'ASSESSMENT_ALREADY_COMPLETE', 'This understanding check is already complete.');
    const curriculum = await curriculumFor({ authorization, courseId: run.courseId, courseVersion: run.curriculumVersion, moduleIndex: run.moduleIndex, language: run.language });
    const bank = await activeBank(curriculum);
    const item = bank.items.find((candidate) => candidate.id === run.itemOrder?.[run.currentIndex]);
    if (!item) throw apiError(409, 'ASSESSMENT_ITEM_NOT_AVAILABLE', 'This understanding check needs to be restarted safely.');
    const cleanAnswer = validateAssessmentAnswer({ item, answer: body?.answer });
    const evaluation = item.responseMode === 'mcq'
      ? (cleanAnswer.optionIndex === item.correctOptionIndex
        ? { outcome: 'demonstrated', demonstratedObjectiveIds: item.objectiveIds, needsReviewObjectiveIds: [], feedback: 'Result under review. Your choice is recorded, and you can continue when you are ready.', signal: { responseDepth: 'selected', courseGrounding: 'demonstrated', sourceTermsMatched: 0, rubricTermsMatched: 0 } }
        : { outcome: 'needs-review', demonstratedObjectiveIds: [], needsReviewObjectiveIds: item.objectiveIds, feedback: 'Result under review. Your choice is recorded, and you can continue when you are ready.', signal: { responseDepth: 'selected', courseGrounding: 'needs-review', sourceTermsMatched: 0, rubricTermsMatched: 0 } })
      : await evaluateOpen({ account, curriculum, item, answer: cleanAnswer.text });
    const outcomes = [...(Array.isArray(run.outcomes) ? run.outcomes : []), {
      itemId: item.id,
      outcome: evaluation.outcome,
      // Keep the approved objective identifiers that the question covered so
      // an uncertain response can still lead back to the relevant lesson.
      // These IDs are curriculum metadata, not learner content or a score.
      askedObjectiveIds: item.objectiveIds,
      demonstratedObjectiveIds: evaluation.demonstratedObjectiveIds,
      needsReviewObjectiveIds: evaluation.needsReviewObjectiveIds,
      // This bounded trace makes the assessment auditable without retaining a
      // learner response, answer key, exact option, score, or model rationale.
      evidenceSignal: {
        responseDepth: String(evaluation.signal?.responseDepth || 'unknown'),
        courseGrounding: String(evaluation.signal?.courseGrounding || 'unknown'),
        sourceTermsMatched: Math.max(0, Math.min(8, Number(evaluation.signal?.sourceTermsMatched) || 0)),
        rubricTermsMatched: Math.max(0, Math.min(6, Number(evaluation.signal?.rubricTermsMatched) || 0)),
        objectiveTermsMatched: Math.max(0, Math.min(6, Number(evaluation.signal?.objectiveTermsMatched) || 0))
      },
      answeredAt: nowDate()
    }];
    const nextIndex = Number(run.currentIndex) + 1;
    const complete = nextIndex >= run.itemOrder.length;
    // A learner is ready when every approved objective has at least one piece
    // of demonstrated evidence. Requiring every individual question to be
    // perfect would turn this into a score by another name and make the calm
    // fallback impossible to complete when model evaluation is unavailable.
    const decision = complete ? assessmentProgressDecision({ curriculum, outcomes, recheckNumber: run.recheckNumber, maxRechecks: MAX_RECHECKS_PER_SCOPE }) : null;
    const updated = {
      ...run,
      currentIndex: nextIndex,
      outcomes,
      status: complete ? 'complete' : 'active',
      completionKind: complete ? decision.completionKind : null,
      missingObjectiveIds: complete ? decision.missingObjectiveIds : [],
      reviewFocusObjectiveId: complete ? decision.reviewFocusObjectiveId : '',
      reviewModuleIndex: complete ? decision.reviewModuleIndex : null,
      recheckNumber: Number(run.recheckNumber) || 0,
      // A bounded objective-evidence trail supports a human audit and a
      // precise return route. It is not a numerical grade and contains none
      // of the raw response, selected option, answer key, or model reasoning.
      monitoring: complete ? { schemaVersion: 1, nextAction: decision.nextAction, evidence: decision.evidence } : null,
      updatedAt: nowDate()
    };
    // No raw typed/spoken answer, prompt response, option choice, score, or
    // model chain-of-thought is persisted. Only a bounded outcome remains.
    await ref.set({
      currentIndex: updated.currentIndex, outcomes, status: updated.status,
      completionKind: updated.completionKind, missingObjectiveIds: updated.missingObjectiveIds,
      reviewFocusObjectiveId: updated.reviewFocusObjectiveId,
      reviewModuleIndex: updated.reviewModuleIndex,
      recheckNumber: updated.recheckNumber,
      monitoring: updated.monitoring,
      updatedAt: updated.updatedAt
    }, { merge: true });
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
    if (isExpired(run)) throw apiError(410, 'ASSESSMENT_RUN_EXPIRED', 'This saved understanding check has expired. You can start a new calm check when you are ready.');
    const curriculum = await curriculumFor({ authorization, courseId: run.courseId, courseVersion: run.curriculumVersion, moduleIndex: run.moduleIndex, language: run.language });
    return { run: visibleRun(run, await activeBank(curriculum)) };
  };

  const acknowledgeReview = async ({ authorization, runId }) => {
    const account = await learner(authorization);
    const id = cleanIdentifier(runId);
    if (!id) throw apiError(400, 'INVALID_ASSESSMENT_RUN', 'That understanding check is not available.');
    const ref = runCollection(account.uid).doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw apiError(404, 'ASSESSMENT_RUN_NOT_FOUND', 'That understanding check is not available.');
    const run = snapshot.data() || {};
    if (isExpired(run)) throw apiError(410, 'ASSESSMENT_RUN_EXPIRED', 'This saved understanding check has expired. You can start a new calm check when you are ready.');
    if (run.status !== 'complete' || run.completionKind !== 'review' || !Number.isInteger(Number(run.reviewModuleIndex))) {
      throw apiError(409, 'ASSESSMENT_REVIEW_NOT_AVAILABLE', 'There is no related course idea waiting for review.');
    }
    if (!run.reviewAcknowledgedAt) await ref.set({ reviewAcknowledgedAt: nowDate(), updatedAt: nowDate() }, { merge: true });
    const curriculum = await curriculumFor({ authorization, courseId: run.courseId, courseVersion: run.curriculumVersion, moduleIndex: run.moduleIndex, language: run.language });
    return { run: visibleRun({ ...run, reviewAcknowledgedAt: run.reviewAcknowledgedAt || nowDate() }, await activeBank(curriculum)) };
  };

  return { status, createDraft, getDraft, publishDraft, start, answer, getRun, acknowledgeReview };
};
