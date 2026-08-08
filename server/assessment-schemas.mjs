import { COURSE_CONTENT } from '../course/course-content.js';
import { apiError } from './errors.mjs';

export const ASSESSMENT_COURSE_ID = COURSE_CONTENT.id;
export const ASSESSMENT_CURRICULUM_VERSION = COURSE_CONTENT.version;
export const ASSESSMENT_LANGUAGES = new Set(['en', 'ur']);
export const ASSESSMENT_RESPONSE_MODES = new Set(['open', 'mcq']);
export const ASSESSMENT_OUTCOMES = new Set(['demonstrated', 'needs-review', 'uncertain']);

// These identifiers are deliberately explicit and stable. They are the only
// concepts an assessment prompt or evaluation is allowed to reference. The
// lesson prose can evolve without allowing a model to invent a new objective.
const objectiveDefinitions = [
  ['m01-attention-support', 'Recognise that ADHD can affect task management and identify a respectful support.'],
  ['m02-reading-process', 'Recognise that dyslexia affects reading and spelling processes, not intelligence.'],
  ['m03-spectrum-variation', 'Recognise that autistic people can have different strengths and support needs.'],
  ['m04-written-expression', 'Recognise respectful alternatives that let people show ideas without relying only on handwriting.'],
  ['m05-coordination', 'Recognise that DCD affects movement planning and coordination, not intelligence.'],
  ['m06-number-understanding', 'Recognise that dyscalculia can affect number understanding and that visual supports can help.'],
  ['m07-spoken-sound-processing', 'Recognise that spoken information can be supported with clear, written, and repeatable instructions.'],
  ['m08-accessible-visual-information', 'Recognise that accessible visual information needs readable text, contrast, and equivalent descriptions.'],
  ['m09-respectful-independence', 'Recognise that support should ask what helps and preserve a person’s independence.'],
  ['m10-accessible-participation', 'Recognise that access tools and respectful consent can support participation.'],
  ['m11-sensory-support', 'Recognise that reducing stimulation and offering a break can support sensory needs.']
];

const safeText = (value, maximum = 1000) => String(value || '')
  .replace(/\u0000/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maximum);

const safeList = (value, maximum = 8) => (Array.isArray(value) ? value : [])
  .map((entry) => safeText(entry, 280))
  .filter(Boolean)
  .slice(0, maximum);

const sourceForStep = (step) => {
  const content = step?.content || {};
  return [
    content.definitionHeading && `${content.definitionHeading}: ${content.definition}`,
    content.dailyLifeHeading && `${content.dailyLifeHeading}: ${content.dailyLife}`,
    content.strengthsHeading && `${content.strengthsHeading}: ${content.strengths}`,
    content.challengesHeading && `${content.challengesHeading}: ${safeList(content.challenges).join('; ')}`,
    content.supportsHeading && `${content.supportsHeading}: ${safeList(content.supports).join('; ')}`,
    step?.simple,
    step?.example
  ].map((entry) => safeText(entry, 1300)).filter(Boolean).join('\n');
};

export const assessmentCurriculum = (moduleIndex, language = 'en') => {
  const requestedLanguage = ASSESSMENT_LANGUAGES.has(language) ? language : 'en';
  if (moduleIndex === 'final') {
    return {
      courseId: ASSESSMENT_COURSE_ID,
      curriculumVersion: ASSESSMENT_CURRICULUM_VERSION,
      moduleIndex: 'final',
      scope: 'final',
      language: requestedLanguage,
      moduleTitle: 'Final course understanding check',
      objectives: objectiveDefinitions.map(([id, description]) => ({ id, description })),
      source: COURSE_CONTENT.steps.map((step, index) => 'Module ' + (index + 1) + ': ' + sourceForStep(step)).join('\n\n').slice(0, 15000)
    };
  }
  const index = Number(moduleIndex);
  if (!Number.isInteger(index) || index < 0 || index >= COURSE_CONTENT.steps.length) {
    throw apiError(400, 'INVALID_MODULE', 'This assessment is not for an available module.');
  }
  const step = COURSE_CONTENT.steps[index];
  const [id, description] = objectiveDefinitions[index];
  return {
    courseId: ASSESSMENT_COURSE_ID,
    curriculumVersion: ASSESSMENT_CURRICULUM_VERSION,
    moduleIndex: index,
    scope: 'module',
    language: requestedLanguage,
    moduleTitle: safeText(step.title, 180),
    objectives: [{ id, description }],
    source: sourceForStep(step)
  };
};

export const assessmentBankJsonSchema = (curriculum) => ({
  type: 'object',
  additionalProperties: false,
  required: ['courseId', 'curriculumVersion', 'moduleIndex', 'language', 'bankVersion', 'items', 'coverageMap'],
  properties: {
    courseId: { type: 'string', enum: [curriculum.courseId] },
    curriculumVersion: { type: 'string', enum: [curriculum.curriculumVersion] },
    moduleIndex: typeof curriculum.moduleIndex === 'number'
      ? { type: 'integer', enum: [curriculum.moduleIndex] }
      : { type: 'string', enum: [curriculum.moduleIndex] },
    language: { type: 'string', enum: [curriculum.language] },
    bankVersion: { type: 'string', maxLength: 80 },
    items: {
      type: 'array', minItems: 1, maxItems: curriculum.scope === 'final' ? 21 : 9,
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'objectiveIds', 'responseMode', 'prompt', 'options', 'correctOptionIndex', 'answerGuide', 'rubric', 'feedback'],
        properties: {
          id: { type: 'string', maxLength: 80 },
          objectiveIds: { type: 'array', minItems: 1, maxItems: curriculum.scope === 'final' ? 3 : 2, items: { type: 'string', enum: curriculum.objectives.map((objective) => objective.id) } },
          responseMode: { type: 'string', enum: ['open', 'mcq'] },
          prompt: { type: 'string', minLength: 12, maxLength: 520 },
          options: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 260 } },
          correctOptionIndex: { type: 'integer', minimum: -1, maximum: 3 },
          answerGuide: { type: 'string', maxLength: 700 },
          rubric: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 280 } },
          feedback: { type: 'string', minLength: 8, maxLength: 220 }
        }
      }
    },
    coverageMap: {
      type: 'array', minItems: 1, maxItems: curriculum.scope === 'final' ? 11 : 4,
      items: {
        type: 'object', additionalProperties: false,
        required: ['objectiveId', 'itemIds'],
        properties: {
          objectiveId: { type: 'string', enum: curriculum.objectives.map((objective) => objective.id) },
          itemIds: { type: 'array', minItems: 1, maxItems: curriculum.scope === 'final' ? 21 : 9, items: { type: 'string', maxLength: 80 } }
        }
      }
    }
  }
});

const invalidBank = (message = 'The generated assessment bank was not safe to publish.') => apiError(422, 'INVALID_ASSESSMENT_BANK', message);
const safeItemId = (value, fallback) => /^[A-Za-z0-9_-]{1,80}$/.test(String(value || '')) ? String(value) : fallback;
const containsUnsafeAssessmentCopy = (value) => /(?:diagnos|disorder you have|score|percentage|rank|timer|speed test|answer is)/i.test(value);

export const validateAssessmentBank = (candidate, curriculum) => {
  if (!candidate || typeof candidate !== 'object') throw invalidBank();
  if (candidate.courseId !== curriculum.courseId || candidate.curriculumVersion !== curriculum.curriculumVersion
    || String(candidate.moduleIndex) !== String(curriculum.moduleIndex) || candidate.language !== curriculum.language) throw invalidBank();
  const bankVersion = safeText(candidate.bankVersion, 80);
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(bankVersion)) throw invalidBank();
  const rawItems = Array.isArray(candidate.items) ? candidate.items : [];
  const itemLimit = curriculum.scope === 'final' ? 21 : 9;
  if (!rawItems.length || rawItems.length > itemLimit) throw invalidBank();
  const objectiveIds = new Set(curriculum.objectives.map((objective) => objective.id));
  const seenItemIds = new Set();
  let openCount = 0;
  let mcqCount = 0;
  const items = rawItems.map((raw, index) => {
    const id = safeItemId(raw?.id, `item-${index + 1}`);
    if (seenItemIds.has(id)) throw invalidBank();
    seenItemIds.add(id);
    const responseMode = String(raw?.responseMode || '');
    if (!ASSESSMENT_RESPONSE_MODES.has(responseMode)) throw invalidBank();
    const itemObjectiveIds = [...new Set(safeList(raw?.objectiveIds, curriculum.scope === 'final' ? 3 : 2))];
    if (!itemObjectiveIds.length || itemObjectiveIds.some((idValue) => !objectiveIds.has(idValue))) throw invalidBank();
    const prompt = safeText(raw?.prompt, 520);
    const feedback = safeText(raw?.feedback, 220);
    if (prompt.length < 12 || feedback.length < 8 || containsUnsafeAssessmentCopy(prompt) || containsUnsafeAssessmentCopy(feedback)) throw invalidBank();
    const options = safeList(raw?.options, 4);
    const correctOptionIndex = Number(raw?.correctOptionIndex);
    const answerGuide = safeText(raw?.answerGuide, 700);
    const rubric = safeList(raw?.rubric, 3);
    if (responseMode === 'mcq') {
      mcqCount += 1;
      if (options.length !== 4 || new Set(options.map((option) => option.toLocaleLowerCase())).size !== 4 || !Number.isInteger(correctOptionIndex) || correctOptionIndex < 0 || correctOptionIndex >= options.length) throw invalidBank();
      return { id, objectiveIds: itemObjectiveIds, responseMode, prompt, options, correctOptionIndex, answerGuide: '', rubric: [], feedback };
    }
    openCount += 1;
    if (options.length || correctOptionIndex !== -1 || answerGuide.length < 12 || !rubric.length) throw invalidBank();
    return { id, objectiveIds: itemObjectiveIds, responseMode, prompt, options: [], correctOptionIndex: -1, answerGuide, rubric, feedback };
  });
  if (curriculum.scope === 'final') {
    if (openCount < 8 || openCount > 9 || mcqCount !== 12 || rawItems.length !== openCount + mcqCount) {
      throw invalidBank('The final assessment must contain eight or nine open responses and twelve multiple-choice questions.');
    }
  } else if (openCount > 4 || mcqCount > 5) throw invalidBank('This module exceeds its approved assessment limit.');
  const coverage = Array.isArray(candidate.coverageMap) ? candidate.coverageMap : [];
  const mappedObjectives = new Set();
  coverage.forEach((entry) => {
    const objectiveId = safeText(entry?.objectiveId, 80);
    const itemIds = safeList(entry?.itemIds, itemLimit);
    if (!objectiveIds.has(objectiveId) || !itemIds.length || itemIds.some((itemId) => !seenItemIds.has(itemId))) throw invalidBank();
    mappedObjectives.add(objectiveId);
  });
  if (curriculum.objectives.some((objective) => !mappedObjectives.has(objective.id))) throw invalidBank('The bank does not cover every approved objective.');
  return {
    schemaVersion: 1,
    courseId: curriculum.courseId,
    curriculumVersion: curriculum.curriculumVersion,
    moduleIndex: curriculum.moduleIndex,
    language: curriculum.language,
    bankVersion,
    items,
    coverageMap: coverage.map((entry) => ({ objectiveId: safeText(entry.objectiveId, 80), itemIds: safeList(entry.itemIds, itemLimit) }))
  };
};

export const publicAssessmentItem = (item) => ({
  id: String(item?.id || ''),
  responseMode: item?.responseMode === 'mcq' ? 'mcq' : 'open',
  prompt: safeText(item?.prompt, 520),
  options: item?.responseMode === 'mcq' ? safeList(item?.options, 4) : [],
  inputHint: item?.responseMode === 'mcq' ? '' : 'Answer in your own words. You can type or speak.'
});

export const validateAssessmentAnswer = ({ item, answer }) => {
  if (item?.responseMode === 'mcq') {
    const optionIndex = Number(answer?.optionIndex);
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= item.options.length) {
      throw apiError(400, 'INVALID_ASSESSMENT_ANSWER', 'Choose one option before continuing.');
    }
    return { optionIndex };
  }
  const text = safeText(answer?.text, 1400);
  if (text.length < 2) throw apiError(400, 'INVALID_ASSESSMENT_ANSWER', 'Write or speak a short response before continuing.');
  return { text };
};

export const responseEvaluationJsonSchema = (curriculum) => ({
  type: 'object', additionalProperties: false,
  required: ['outcome', 'demonstratedObjectiveIds', 'needsReviewObjectiveIds', 'feedback'],
  properties: {
    outcome: { type: 'string', enum: [...ASSESSMENT_OUTCOMES] },
    demonstratedObjectiveIds: { type: 'array', maxItems: curriculum.scope === 'final' ? 3 : 2, items: { type: 'string', enum: curriculum.objectives.map((objective) => objective.id) } },
    needsReviewObjectiveIds: { type: 'array', maxItems: curriculum.scope === 'final' ? 3 : 2, items: { type: 'string', enum: curriculum.objectives.map((objective) => objective.id) } },
    feedback: { type: 'string', minLength: 8, maxLength: 220 }
  }
});

export const validateResponseEvaluation = (candidate, { item, curriculum }) => {
  if (!candidate || typeof candidate !== 'object' || !ASSESSMENT_OUTCOMES.has(candidate.outcome)) {
    throw apiError(422, 'INVALID_ASSESSMENT_EVALUATION', 'The response could not be evaluated safely.');
  }
  const allowed = new Set(item.objectiveIds || []);
  const normaliseObjectives = (values) => [...new Set(safeList(values, curriculum.scope === 'final' ? 3 : 2))].filter((id) => allowed.has(id));
  const demonstratedObjectiveIds = normaliseObjectives(candidate.demonstratedObjectiveIds);
  const needsReviewObjectiveIds = normaliseObjectives(candidate.needsReviewObjectiveIds);
  const feedback = safeText(candidate.feedback, 220);
  if (feedback.length < 8 || containsUnsafeAssessmentCopy(feedback)) {
    throw apiError(422, 'INVALID_ASSESSMENT_EVALUATION', 'The response could not be evaluated safely.');
  }
  if (candidate.outcome === 'demonstrated' && !demonstratedObjectiveIds.length) throw apiError(422, 'INVALID_ASSESSMENT_EVALUATION', 'The response could not be evaluated safely.');
  if (candidate.outcome === 'needs-review' && !needsReviewObjectiveIds.length) throw apiError(422, 'INVALID_ASSESSMENT_EVALUATION', 'The response could not be evaluated safely.');
  return { outcome: candidate.outcome, demonstratedObjectiveIds, needsReviewObjectiveIds, feedback };
};
