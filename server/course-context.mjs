import { COURSE_CONTENT } from '../course/course-content.js';
import { COURSE_URDU } from '../course/course-urdu.js';
import { apiError } from './errors.mjs';

const supportedPhases = new Set(['preview', 'read', 'type', 'check', 'apply', 'complete', 'exam-intro', 'exam', 'exam-results']);
const behaviourStates = new Set(['starting', 'returning', 're-reading', 'working-through-typing', 'using-support', 'ready-for-next-step', 'needs-a-choice']);

const boundedText = (value, maximum = 1100) => String(value || '').replace(/\u0000/g, '').trim().slice(0, maximum);
const listText = (value) => Array.isArray(value) ? value.filter(Boolean).join('; ') : boundedText(value);
// The written Urdu experience must not fall back to Latin abbreviations merely
// because an authored English course term appears in a translation source.
const urduScriptTerms = (value = '') => String(value)
  .replace(/\bADHD\b/g, 'اے ڈی ایچ ڈی')
  .replace(/\bDCD\b/g, 'ڈی سی ڈی')
  .replace(/\bDyslexia\b/g, 'ڈسلیکسیہ')
  .replace(/\bDysgraphia\b/g, 'ڈسگرافیا')
  .replace(/\bDyspraxia\b/g, 'ڈس پراکسیا')
  .replace(/\bDyscalculia\b/g, 'ڈس کیلکولیا')
  .replace(/\bAutism Spectrum Disorder\b/g, 'آٹزم اسپیکٹرم کی کیفیت')
  .replace(/\bAuditory Processing Disorder\b/g, 'سمعی عمل کاری کی کیفیت')
  .replace(/\bDevelopmental Coordination Disorder\b/g, 'نشوونمائی ہم آہنگی کی کیفیت');

const readingFacts = (content = {}) => [
  content.definitionHeading && `${content.definitionHeading}: ${content.definition}`,
  content.dailyLifeHeading && `${content.dailyLifeHeading}: ${content.dailyLife}`,
  content.strengthsHeading && `${content.strengthsHeading}: ${content.strengths}`,
  content.challengesHeading && `${content.challengesHeading}: ${listText(content.challenges)}`,
  content.supportsHeading && `${content.supportsHeading}: ${listText(content.supports)}`
].filter(Boolean).map((fact) => boundedText(fact));

// This mapper is deliberately more limited than the page renderer. Assessment
// prompts, option text, learner input, and exact typing targets never leave the
// browser for the model to see.
export const coursePageContext = (body) => {
  if (body?.courseId !== COURSE_CONTENT.id) {
    throw apiError(400, 'UNSUPPORTED_COURSE', 'This course page is not available to the AI helper.');
  }
  const moduleIndex = Number(body?.page?.moduleIndex);
  const phase = boundedText(body?.page?.phase, 40);
  const language = body?.language === 'ur' ? 'ur' : 'en';
  if (!Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex >= COURSE_CONTENT.steps.length || !supportedPhases.has(phase)) {
    throw apiError(400, 'INVALID_PAGE_CONTEXT', 'The current course page could not be identified.');
  }
  const english = COURSE_CONTENT.steps[moduleIndex];
  const translated = COURSE_URDU?.steps?.[moduleIndex] || {};
  const step = language === 'ur' ? translated : english;
  const fallback = english || {};
  let facts = [];
  if (phase === 'read') facts = readingFacts(step.content || fallback.content);
  else if (phase === 'preview' || phase === 'type' || phase === 'check' || phase === 'apply') {
    facts = [step.simple || fallback.simple, step.hint || fallback.hint].map((fact) => boundedText(fact)).filter(Boolean);
  } else if (phase === 'complete') {
    const conclusion = language === 'ur' ? COURSE_URDU?.conclusion : COURSE_CONTENT.conclusion;
    facts = (conclusion?.paragraphs || []).map((fact) => boundedText(fact)).filter(Boolean);
  } else {
    facts = [language === 'ur'
      ? 'یہ کورس کے اختتامی جائزے کا مرحلہ ہے۔'
      : 'This is a course review stage.'];
  }
  return {
    language,
    phase,
    title: boundedText(language === 'ur' ? urduScriptTerms(step.title || fallback.title) : (step.title || fallback.title), 180),
    facts: facts.slice(0, 6).map((fact) => language === 'ur' ? boundedText(urduScriptTerms(fact)) : fact)
  };
};

// A published course is represented to a learner by a deliberately reduced
// manifest. This context builder keeps Course AI and Adaptive Recall on the
// same safe boundary: it can use the current title and authored explanatory
// facts, but never a typing target, MCQ option, answer key, review note, or
// source upload. It is intentionally separate from the legacy mapper above
// so the historical course remains fully backwards compatible.
export const reviewedManifestPageContext = (body, manifest) => {
  if (!manifest || manifest.format !== 'type2learn-theory-course/v1') {
    throw apiError(400, 'INVALID_PAGE_CONTEXT', 'The reviewed course page could not be identified.');
  }
  const moduleIndex = Number(body?.page?.moduleIndex);
  const phase = boundedText(body?.page?.phase, 40);
  const language = body?.language === 'ur' ? 'ur' : 'en';
  const modules = Array.isArray(manifest.modules) ? manifest.modules : [];
  if (!Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex >= modules.length || !supportedPhases.has(phase)) {
    throw apiError(400, 'INVALID_PAGE_CONTEXT', 'The current course page could not be identified.');
  }
  const english = modules[moduleIndex]?.en || {};
  const translated = modules[moduleIndex]?.ur || {};
  const step = language === 'ur' ? translated : english;
  const fallback = english || {};
  let facts = [];
  if (phase === 'read') facts = readingFacts(step.content || fallback.content);
  else if (phase === 'preview' || phase === 'type' || phase === 'check' || phase === 'apply') {
    facts = [step.simple || fallback.simple, step.hint || fallback.hint].map((fact) => boundedText(fact)).filter(Boolean);
  } else if (phase === 'complete') {
    facts = [step.simple || fallback.simple, step.example || fallback.example, step.hint || fallback.hint]
      .map((fact) => boundedText(fact)).filter(Boolean);
  } else {
    facts = [language === 'ur'
      ? 'یہ کورس کے اختتامی جائزے کا مرحلہ ہے۔'
      : 'This is a course review stage.'];
  }
  return {
    language,
    phase,
    title: boundedText(language === 'ur' ? urduScriptTerms(step.title || fallback.title) : (step.title || fallback.title), 180),
    facts: facts.slice(0, 6).map((fact) => language === 'ur' ? boundedText(urduScriptTerms(fact)) : fact)
  };
};

// Server services call this resolver after authenticating the learner. For a
// selected reviewed course it asks the catalogue for the same learner-safe,
// access-checked manifest used by the player. Client-provided text is never
// treated as curriculum context.
export const createCourseContextResolver = ({ courseCatalog } = {}) => ({
  async resolve({ authorization, body }) {
    // The bare historic route is the only route allowed to use the static
    // compatibility mapper. Supplying an explicit reviewed version—even for
    // the same course ID—must re-authorise and load that published manifest.
    if (body?.courseId === COURSE_CONTENT.id && !boundedText(body?.courseVersion, 24)) return coursePageContext(body);
    const courseId = boundedText(body?.courseId, 80);
    const version = boundedText(body?.courseVersion, 24);
    if (!courseId || !version || typeof courseCatalog?.manifest !== 'function') {
      throw apiError(400, 'UNSUPPORTED_COURSE', 'This course page is not available to the AI helper.');
    }
    const loaded = await courseCatalog.manifest({ authorization, courseId, version });
    const manifest = loaded?.manifest;
    if (String(manifest?.id || '') !== courseId || String(manifest?.version || '') !== version) {
      throw apiError(500, 'COURSE_MANIFEST_MISMATCH', 'This reviewed course could not be prepared safely for the AI helper.');
    }
    // Defence in depth: the catalogue should already project learner-safe
    // data, but a private answer key must never become model context if that
    // contract is changed accidentally in a future service edit.
    if (JSON.stringify(manifest || {}).includes('correctOption')) {
      throw apiError(500, 'UNSAFE_COURSE_MANIFEST', 'This reviewed course could not be prepared safely for the AI helper.');
    }
    return reviewedManifestPageContext(body, manifest);
  }
});

export const normaliseConversation = (history) => (Array.isArray(history) ? history : [])
  .slice(-6)
  .map((entry) => ({
    role: entry?.role === 'assistant' ? 'assistant' : entry?.role === 'user' ? 'user' : '',
    content: boundedText(entry?.content, 650)
  }))
  .filter((entry) => entry.role && entry.content);

export const normaliseLearnerMessage = (value) => boundedText(value, 900);

// This context deliberately exposes the learning objective and a compact
// authored outline, never an exact typing target or answer option. It gives
// the adaptive engine enough curriculum grounding to notice evidence in a
// learner's own words without turning it into an answer generator.
export const adaptiveRecallContext = (body, resolvedPageContext = null) => {
  const context = resolvedPageContext || coursePageContext({
    ...body,
    page: { ...(body?.page || {}), phase: body?.page?.phase === 'type' ? 'read' : body?.page?.phase }
  });
  const response = boundedText(body?.response, 1600);
  const previousResponse = boundedText(body?.previousResponse, 1600);
  const barrier = boundedText(body?.barrier, 80);
  // Behaviour Context enters the recall engine only as a small allow-list of
  // neutral task states. It is neither persisted here nor used as a score,
  // readiness decision, learner characteristic, or input to answer judging.
  const supportStates = Array.isArray(body?.behaviourStates)
    ? body.behaviourStates.filter((state) => behaviourStates.has(state)).slice(0, 3)
    : [];
  if (!response && !barrier) throw apiError(400, 'EMPTY_LEARNING_EVIDENCE', 'Write a response or choose what is getting in the way first.');
  return {
    ...context,
    response,
    previousResponse,
    barrier,
    supportStates,
    objective: boundedText(context.facts[0] || context.title, 420),
    outline: context.facts.slice(0, 5)
  };
};
