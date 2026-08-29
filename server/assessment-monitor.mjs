// ASSESSMENT MONITORING: this module turns already-minimised course signals
// and per-question outcomes into a transparent progression decision. It does
// not calculate or expose a learner score, infer a trait, or retain raw work.
// Its output is deliberately small enough to audit in tests and Firestore.

const bounded = (value, maximum = 1000000) => Math.max(0, Math.min(maximum, Math.round(Number(value) || 0)));

const objectiveModuleIndex = (objectiveId) => {
  const match = String(objectiveId || '').match(/^m(\d{2})-/);
  const index = Number(match?.[1]) - 1;
  // Reviewed theory courses may contain up to 100 modules. The compact
  // objective identifier remains the only source for a review route.
  return Number.isInteger(index) && index >= 0 && index <= 99 ? index : null;
};

// These labels describe only a course interaction pattern. They never claim
// attention, effort, ability, a diagnosis, or why a learner used a support.
export const assessmentLearningSignals = (summary = {}) => {
  const metrics = summary?.metrics || {};
  const support = summary?.support || {};
  const activeMs = bounded(metrics.activeMs, 4 * 60 * 60 * 1000);
  const typed = bounded(metrics.typingCharacters, 12000);
  const longestPauseMs = bounded(metrics.typingLongestPauseMs, 10 * 60 * 1000);
  const rereads = bounded(metrics.rereads, 100);
  const returns = bounded(metrics.returns, 100);
  const readingBacktracks = bounded(metrics.readingSectionBacktracks, 100);
  const scrollBacktracks = bounded(metrics.scrollBacktracks, 500);
  const typingBursts = bounded(metrics.typingBursts, 12000);
  const typingFocusReturns = bounded(metrics.typingFocusReturns, 200);
  const taskRevisits = bounded(metrics.taskRevisits, 100);
  const supportOfferAcceptances = bounded(metrics.supportOfferAcceptances, 100);
  const supportOfferDismissals = bounded(metrics.supportOfferDismissals, 100);
  const responseRevisions = bounded(metrics.assessmentResponseRevisions, 400);
  const visualActiveMs = bounded(metrics.visualActiveMs, 4 * 60 * 60 * 1000);
  const inputMethodChanges = bounded(metrics.inputMethodChanges, 100);
  const textPresentationChanges = bounded(metrics.textPresentationChanges, 100);
  const visualOpened = Boolean(support.visualOpened);
  const readAloudUsed = Boolean(support.textToSpeech);
  // This is a temporary, consented support state—not a conclusion about the
  // learner. It can only influence whether an open prompt or MCQ is placed
  // first; objective evidence alone still determines the review route.
  const behaviourStates = new Set(Array.isArray(summary?.behaviour?.states)
    ? summary.behaviour.states.map((state) => String(state)) : []);
  return {
    // A brief course interaction prioritises a written explanation first so a
    // learner can show understanding in their own words rather than only pick
    // an option. The check remains optional and never assumes a cause.
    courseInteraction: activeMs < 75_000 && rereads === 0 && taskRevisits === 0 ? 'brief' : activeMs >= 6 * 60 * 1000 || rereads > 0 || taskRevisits > 0 ? 'extended' : 'typical',
    responseRhythm: longestPauseMs >= 45_000 ? 'paused' : typed >= 260 && activeMs <= 3 * 60 * 1000 ? 'quick' : 'typical',
    supportUse: readAloudUsed || visualOpened || visualActiveMs >= 20_000 || supportOfferAcceptances > 0 ? 'used' : 'not-recorded',
    returnCount: Math.min(9, returns + rereads + readingBacktracks + taskRevisits),
    // These are interaction routes, not findings about a learner. They only
    // choose which already-reviewed question format comes first; they cannot
    // select an outcome, score, readiness decision, or an answer hint.
    navigationPattern: rereads + readingBacktracks + scrollBacktracks + taskRevisits >= 3 ? 'revisiting' : 'direct',
    expressionPattern: typingFocusReturns >= 2 || typingBursts >= 8 || responseRevisions >= 3 ? 're-entering' : 'steady',
    supportPreference: supportOfferAcceptances > supportOfferDismissals ? 'accepted' : supportOfferDismissals > 0 ? 'dismissed' : 'not-recorded',
    // These are voluntary interface actions, not inferred learner traits.
    // They can only influence the order of already approved response formats.
    presentationPreference: textPresentationChanges > 0 || inputMethodChanges > 0 ? 'adjusted' : 'default',
    supportState: behaviourStates.has('working-through-typing')
      ? 'expression'
      : behaviourStates.has('re-reading')
        ? 're-reading'
        : 'none'
  };
};

const stableRank = (id, seed) => `${seed}:${id}`;

// Ordering is deterministic for a run. It may choose an open question sooner
// when the compact, consented summary says a learner had only a brief course
// interaction. It never changes the bank, removes objectives, or decides a
// result from behavioural data.
export const prioritiseAssessmentItems = ({ items = [], runId, signals = {} }) => [...items]
  .map((item) => {
    let priority = 0;
    if (signals.courseInteraction === 'brief' && item.responseMode === 'open') priority += 3;
    if (signals.responseRhythm === 'quick' && item.responseMode === 'open') priority += 1;
    if (signals.supportUse === 'used' && item.responseMode === 'mcq') priority += 1;
    if (signals.supportState === 'expression' && item.responseMode === 'open') priority += 1;
    if (signals.supportState === 're-reading' && item.responseMode === 'mcq') priority += 1;
    if (signals.navigationPattern === 'revisiting' && item.responseMode === 'mcq') priority += 1;
    if (signals.expressionPattern === 're-entering' && item.responseMode === 'open') priority += 1;
    if (signals.supportPreference === 'accepted' && item.responseMode === 'open') priority += 1;
    // Keep a voluntarily adjusted presentation as a light ordering tiebreaker
    // only. It must never outweigh a clearer opportunity to explain an idea.
    if (signals.presentationPreference === 'adjusted' && item.responseMode === 'mcq') priority += 0.25;
    // Prior module evidence can make the final check start with the one
    // course objective that needs the clearest fresh evidence. This is not a
    // score or a prediction: it only reorders already approved questions.
    const focusIndex = Array.isArray(signals.objectiveFocusIds)
      ? signals.objectiveFocusIds.findIndex((objectiveId) => item?.objectiveIds?.includes(objectiveId))
      : -1;
    if (focusIndex >= 0) priority += Math.max(2, 7 - focusIndex);
    return { item, priority, rank: stableRank(item.id, runId) };
  })
  .sort((left, right) => right.priority - left.priority || left.rank.localeCompare(right.rank))
  .map(({ item }) => item.id);

// FINAL-CHECK PRIORITISATION: aggregate only stored objective outcomes from
// already completed module checks. A later demonstrated response supersedes a
// previous needs-review outcome for the same objective. There are no learner
// answers, model rationales, scores, typing logs, or labels in this input.
export const objectiveFocusFromModuleEvidence = ({ curriculum, moduleRuns = [] }) => {
  const allowed = new Set(Array.isArray(curriculum?.objectives) ? curriculum.objectives.map((objective) => objective.id) : []);
  const states = new Map([...allowed].map((objectiveId) => [objectiveId, 'not-yet-observed']));
  const rank = { 'not-yet-observed': 0, uncertain: 1, review: 2, demonstrated: 3 };
  (Array.isArray(moduleRuns) ? moduleRuns : []).forEach((run) => {
    (Array.isArray(run?.outcomes) ? run.outcomes : []).forEach((outcome) => {
      const demonstrated = Array.isArray(outcome?.demonstratedObjectiveIds) ? outcome.demonstratedObjectiveIds : [];
      const review = Array.isArray(outcome?.needsReviewObjectiveIds) ? outcome.needsReviewObjectiveIds : [];
      const asked = Array.isArray(outcome?.askedObjectiveIds) ? outcome.askedObjectiveIds : [];
      [...new Set([...asked, ...review, ...demonstrated])].forEach((objectiveId) => {
        if (!allowed.has(objectiveId)) return;
        const incoming = demonstrated.includes(objectiveId)
          ? 'demonstrated'
          : review.includes(objectiveId)
            ? 'review'
            : outcome?.outcome === 'uncertain' && asked.includes(objectiveId)
              ? 'uncertain'
              : 'not-yet-observed';
        // A demonstrated answer closes an earlier gap. Otherwise retain the
        // most useful non-diagnostic evidence category seen for this course.
        const previous = states.get(objectiveId) || 'not-yet-observed';
        if (incoming === 'demonstrated' || rank[incoming] >= rank[previous]) states.set(objectiveId, incoming);
      });
    });
  });
  const priority = { review: 0, uncertain: 1, 'not-yet-observed': 2, demonstrated: 3 };
  const evidence = [...states.entries()].map(([objectiveId, status]) => ({ objectiveId, status }));
  const focusObjectiveIds = evidence
    .filter((entry) => entry.status !== 'demonstrated')
    .sort((left, right) => priority[left.status] - priority[right.status] || left.objectiveId.localeCompare(right.objectiveId))
    .map((entry) => entry.objectiveId);
  return { focusObjectiveIds, evidence };
};

const evidenceForObjective = (objectiveId, outcomes) => {
  const relevant = outcomes.filter((outcome) => {
    const demonstrated = Array.isArray(outcome?.demonstratedObjectiveIds)
      && outcome.demonstratedObjectiveIds.includes(objectiveId);
    const needsReview = Array.isArray(outcome?.needsReviewObjectiveIds)
      && outcome.needsReviewObjectiveIds.includes(objectiveId);
    // An uncertain answer is still evidence that this exact objective was
    // considered. Keep its link to the question so a recovery route is
    // precise rather than always falling back to the first course module.
    const wasAsked = outcome?.outcome === 'uncertain'
      && Array.isArray(outcome?.askedObjectiveIds)
      && outcome.askedObjectiveIds.includes(objectiveId);
    return demonstrated || needsReview || wasAsked;
  });
  const demonstrated = relevant.some((outcome) => outcome.outcome === 'demonstrated'
    && outcome.demonstratedObjectiveIds.includes(objectiveId));
  const needsReview = relevant.some((outcome) => outcome.outcome === 'needs-review'
    && outcome.needsReviewObjectiveIds.includes(objectiveId));
  const uncertain = relevant.some((outcome) => outcome.outcome === 'uncertain');
  return {
    objectiveId,
    status: demonstrated ? 'demonstrated' : needsReview ? 'review' : uncertain ? 'uncertain' : 'not-yet-observed',
    // Keep only bounded, non-score evidence categories. The database never
    // needs a response, option index, answer key, or model rationale.
    evidenceKinds: {
      demonstrated: demonstrated ? 1 : 0,
      needsReview: needsReview ? 1 : 0,
      uncertain: uncertain ? 1 : 0
    }
  };
};

// Rechecks remain learner-led and bounded. This prevents an assessment from
// becoming an endless hidden score loop while still allowing a learner to
// revisit one idea and show fresh evidence after they choose to return.
export const assessmentProgressDecision = ({ curriculum, outcomes = [], recheckNumber = 0, maxRechecks = 2 }) => {
  const objectives = Array.isArray(curriculum?.objectives) ? curriculum.objectives : [];
  const evidence = objectives.map((objective) => evidenceForObjective(objective.id, outcomes));
  const missingObjectiveIds = evidence.filter((item) => item.status !== 'demonstrated').map((item) => item.objectiveId);
  const reviewCandidate = evidence.find((item) => item.status === 'review')
    || evidence.find((item) => item.status === 'uncertain')
    || evidence.find((item) => item.status === 'not-yet-observed')
    || null;
  const reviewFocusObjectiveId = reviewCandidate?.objectiveId || '';
  const reviewModuleIndex = reviewFocusObjectiveId ? objectiveModuleIndex(reviewFocusObjectiveId) : null;
  const ready = objectives.length > 0 && missingObjectiveIds.length === 0;
  const boundedRecheckNumber = Math.max(0, Math.min(maxRechecks, Number(recheckNumber) || 0));
  const recheckAvailable = !ready && boundedRecheckNumber < maxRechecks;
  return {
    completionKind: ready ? 'ready' : 'review',
    missingObjectiveIds,
    reviewFocusObjectiveId,
    reviewModuleIndex,
    // This is an internal decision trail, not a learner score. It supports
    // audit, export, and a specific return route without profiling a person.
    evidence,
    recheckNumber: boundedRecheckNumber,
    recheckAvailable,
    nextAction: ready ? 'continue' : recheckAvailable ? 'revisit-one-objective' : 'continue-with-review-note'
  };
};
