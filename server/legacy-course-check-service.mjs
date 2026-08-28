import { apiError } from './errors.mjs';

// Historic public-course answer keys stay server-side. The browser receives
// only a bounded `complete` or `try-again` outcome for the choice it made.
// This is deliberately separate from the adaptive assessment service: it
// protects the existing eleven-module learning path without introducing a
// learner-visible score or an AI judgement.
const LEGACY_COURSE_ID = 'course-1-neurodivergent-conditions-v2';
const LEGACY_COURSE_VERSION = '1.1';
const MODULE_ANSWER_INDEX = Object.freeze([1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0]);
const FINAL_ANSWER_INDEX = Object.freeze([2, 2, 0, 0, 0, 0, 0, 0, 1, 1]);

const boundedIndex = (value, maximum, errorCode, message) => {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index > maximum) throw apiError(400, errorCode, message);
  return index;
};

export const createLegacyCourseCheckService = ({ firebase }) => {
  const available = () => Boolean(firebase.available);
  const status = () => ({
    available: available(),
    requiresSignIn: true,
    exposesAnswerKeys: false,
    courseId: LEGACY_COURSE_ID,
    courseVersion: LEGACY_COURSE_VERSION
  });

  const check = async ({ authorization, body }) => {
    if (!available()) throw apiError(503, 'LEGACY_CHECK_UNAVAILABLE', 'This answer check is not connected right now. Your choice is still here.');
    await firebase.verifyBearer(authorization);
    const courseId = String(body?.courseId || '').trim();
    const version = String(body?.version || '').trim();
    if (courseId !== LEGACY_COURSE_ID || version !== LEGACY_COURSE_VERSION) {
      throw apiError(400, 'UNKNOWN_LEGACY_COURSE', 'This answer check is not for the available course.');
    }
    const scope = String(body?.scope || 'module');
    const selectedIndex = boundedIndex(body?.selectedIndex, 3, 'INVALID_ANSWER', 'Choose one available answer before continuing.');
    let expectedIndex;
    if (scope === 'module') {
      const moduleIndex = boundedIndex(body?.moduleIndex, MODULE_ANSWER_INDEX.length - 1, 'INVALID_MODULE', 'This module is not available.');
      expectedIndex = MODULE_ANSWER_INDEX[moduleIndex];
    } else if (scope === 'apply') {
      const moduleIndex = boundedIndex(body?.moduleIndex, MODULE_ANSWER_INDEX.length - 1, 'INVALID_MODULE', 'This module is not available.');
      void moduleIndex;
      expectedIndex = 0;
    } else if (scope === 'final') {
      const questionIndex = boundedIndex(body?.questionIndex, FINAL_ANSWER_INDEX.length - 1, 'INVALID_QUESTION', 'This final-review question is not available.');
      expectedIndex = FINAL_ANSWER_INDEX[questionIndex];
    } else {
      throw apiError(400, 'INVALID_CHECK_SCOPE', 'This answer check is not available.');
    }
    return { result: selectedIndex === expectedIndex ? 'complete' : 'try-again' };
  };

  return { status, check };
};
