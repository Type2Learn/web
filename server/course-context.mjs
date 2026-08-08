import { COURSE_CONTENT } from '../course/course-content.js';
import { COURSE_URDU } from '../course/course-urdu.js';
import { apiError } from './errors.mjs';

const supportedPhases = new Set(['preview', 'read', 'type', 'check', 'apply', 'complete', 'exam-intro', 'exam', 'exam-results']);

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
export const adaptiveRecallContext = (body) => {
  const context = coursePageContext({
    ...body,
    page: { ...(body?.page || {}), phase: body?.page?.phase === 'type' ? 'read' : body?.page?.phase }
  });
  const response = boundedText(body?.response, 1600);
  const previousResponse = boundedText(body?.previousResponse, 1600);
  const barrier = boundedText(body?.barrier, 80);
  if (!response && !barrier) throw apiError(400, 'EMPTY_LEARNING_EVIDENCE', 'Write a response or choose what is getting in the way first.');
  return {
    ...context,
    response,
    previousResponse,
    barrier,
    objective: boundedText(context.facts[0] || context.title, 420),
    outline: context.facts.slice(0, 5)
  };
};
