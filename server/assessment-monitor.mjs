// ASSESSMENT MONITORING: this module turns already-minimised course signals
// and per-question outcomes into a transparent progression decision. It does
// not calculate or expose a learner score, infer a trait, or retain raw work.
// Its output is deliberately small enough to audit in tests and Firestore.

const bounded = (value, maximum = 1000000) => Math.max(0, Math.min(maximum, Math.round(Number(value) || 0)));

const objectiveModuleIndex = (objectiveId) => {
  const match = String(objectiveId || '').match(/^m(\d{2})-/);
  const index = Number(match?.[1]) - 1;
  return Number.isInteger(index) && index >= 0 && index <= 10 ? index : null;
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
  return {
    // A brief course interaction prioritises a written explanation first so a
    // learner can show understanding in their own words rather than only pick
    // an option. The check remains optional and never assumes a cause.
    courseInteraction: activeMs < 75_000 && rereads === 0 ? 'brief' : activeMs >= 6 * 60 * 1000 || rereads > 0 ? 'extended' : 'typical',
    responseRhythm: longestPauseMs >= 45_000 ? 'paused' : typed >= 260 && activeMs <= 3 * 60 * 1000 ? 'quick' : 'typical',
    supportUse: support.textToSpeech || support.visualOpened ? 'used' : 'not-recorded',
    returnCount: Math.min(9, returns + rereads)
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
    return { item, priority, rank: stableRank(item.id, runId) };
  })
  .sort((left, right) => right.priority - left.priority || left.rank.localeCompare(right.rank))
  .map(({ item }) => item.id);

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

export const assessmentProgressDecision = ({ curriculum, outcomes = [] }) => {
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
  return {
    completionKind: ready ? 'ready' : 'review',
    missingObjectiveIds,
    reviewFocusObjectiveId,
    reviewModuleIndex,
    // This is an internal decision trail, not a learner score. It supports
    // audit, export, and a specific return route without profiling a person.
    evidence,
    nextAction: ready ? 'continue' : 'revisit-one-objective'
  };
};
