// ASSESSMENT JUDGING: deterministic evidence checks are intentionally run
// before and after a model evaluation. They never produce a learner score and
// they never persist the learner's raw answer. Their job is to make a safe,
// inspectable decision when a provider is unavailable or returns weak output.

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'because', 'before', 'being',
  'can', 'could', 'course', 'does', 'each', 'for', 'from', 'have', 'idea', 'into',
  'its', 'just', 'lesson', 'more', 'not', 'one', 'only', 'other', 'our', 'person',
  'should', 'some', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'use', 'used', 'using', 'was', 'what',
  'when', 'which', 'with', 'would', 'your'
]);

const normalise = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  .replace(/-/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const terms = (value) => new Set(normalise(value)
  .split(' ')
  .map((token) => token.trim())
  .filter((token) => token.length >= 4 && !STOP_WORDS.has(token)));

const intersection = (left, right) => [...left].filter((value) => right.has(value));
const repeatedPhrase = (text) => {
  const words = normalise(text).split(' ').filter(Boolean);
  if (words.length < 7) return false;
  const unique = new Set(words);
  return unique.size / words.length < 0.38;
};

const qualityBand = ({ words, characters, repeated }) => {
  if (characters < 14 || words < 3 || repeated) return 'too-little';
  if (characters < 42 || words < 8) return 'brief';
  return 'substantive';
};

// The response is compared only with approved source/rubric language already
// held on the server. This is a signal of course grounding, not a claim about
// intelligence, effort, attention, a diagnosis, or the learner as a person.
export const deterministicAssessmentEvaluation = ({ item, curriculum, answer }) => {
  const raw = String(answer || '').trim();
  const answerTerms = terms(raw);
  const sourceTerms = terms(curriculum?.source);
  // The entire approved source can contain more than one course idea—most
  // noticeably in a final check. Treat the item's guide and rubric as the
  // objective-specific anchor so unrelated lesson vocabulary alone can never
  // look like evidence for the question currently being answered.
  const objectiveTerms = terms([item?.answerGuide, ...(item?.rubric || [])].join(' '));
  const sourceEvidence = intersection(answerTerms, sourceTerms);
  const objectiveEvidence = intersection(answerTerms, objectiveTerms);
  const words = normalise(raw).split(' ').filter(Boolean);
  const repeated = repeatedPhrase(raw);
  const quality = qualityBand({ words: words.length, characters: raw.length, repeated });
  const contentEvidence = sourceEvidence.length + objectiveEvidence.length;
  const signal = {
    responseDepth: quality,
    // This is evidence about the response *against this objective*, not a
    // learner score. Persisting the bounded count lets a later audit verify
    // why an authored fallback chose review without storing the response.
    courseGrounding: objectiveEvidence.length >= 2 && contentEvidence >= 4
      ? 'strong'
      : objectiveEvidence.length >= 1 && contentEvidence >= 2
        ? 'some'
        : 'limited',
    sourceTermsMatched: Math.min(sourceEvidence.length, 8),
    rubricTermsMatched: Math.min(objectiveEvidence.length, 6),
    objectiveTermsMatched: Math.min(objectiveEvidence.length, 6)
  };
  const objectiveIds = Array.isArray(item?.objectiveIds) ? item.objectiveIds : [];

  if (quality === 'too-little') {
    return {
      outcome: 'uncertain', demonstratedObjectiveIds: [], needsReviewObjectiveIds: [],
      feedback: 'Result under review. Add a little more of your own explanation when you are ready.',
      signal
    };
  }
  if (quality === 'substantive' && contentEvidence >= 3
    && sourceEvidence.length >= 1 && objectiveEvidence.length >= 2) {
    return {
      outcome: 'demonstrated', demonstratedObjectiveIds: objectiveIds, needsReviewObjectiveIds: [],
      feedback: 'Result under review. Your response connects to the course idea. You can continue when you are ready.',
      signal
    };
  }
  if (quality !== 'too-little' && contentEvidence === 0) {
    return {
      outcome: 'needs-review', demonstratedObjectiveIds: [], needsReviewObjectiveIds: objectiveIds,
      feedback: 'Result under review. One course idea may be worth revisiting before the next calm check.',
      signal
    };
  }
  return {
    outcome: 'uncertain', demonstratedObjectiveIds: [], needsReviewObjectiveIds: [],
    feedback: 'Result under review. Your response is saved for a careful check. You can continue when you are ready.',
    signal
  };
};

// A model may recognise valid paraphrase, but it may never promote a response
// with too little material to assess. The deterministic reviewer also prevents
// malformed “demonstrated” claims from turning into course progression.
export const constrainAssessmentEvaluation = ({ candidate, deterministic, item }) => {
  const objectiveIds = Array.isArray(item?.objectiveIds) ? item.objectiveIds : [];
  const safe = {
    outcome: candidate?.outcome,
    demonstratedObjectiveIds: Array.isArray(candidate?.demonstratedObjectiveIds) ? candidate.demonstratedObjectiveIds : [],
    needsReviewObjectiveIds: Array.isArray(candidate?.needsReviewObjectiveIds) ? candidate.needsReviewObjectiveIds : [],
    feedback: String(candidate?.feedback || '').trim(),
    signal: deterministic.signal
  };
  if (deterministic.signal.responseDepth === 'too-little' && safe.outcome === 'demonstrated') {
    return { ...deterministic, feedback: 'Result under review. Add a little more of your own explanation when you are ready.' };
  }
  if (safe.outcome === 'demonstrated' && !safe.demonstratedObjectiveIds.length) return deterministic;
  if (safe.outcome === 'needs-review' && !safe.needsReviewObjectiveIds.length) {
    return { ...deterministic, outcome: 'needs-review', demonstratedObjectiveIds: [], needsReviewObjectiveIds: objectiveIds };
  }
  return safe;
};
