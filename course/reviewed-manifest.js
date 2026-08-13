// Reviewed course manifest compatibility
// -------------------------------------
// The publishing pipeline intentionally sends learners a manifest without
// answer keys. This adapter lets the established /course/ experience render
// that safe material without making the browser a second source of truth for
// curriculum or assessment scoring.

const text = (value, fallback = '') => String(value ?? fallback).trim();
const list = (value) => Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
const identifier = (value) => /^[a-z0-9][a-z0-9-]{2,79}$/i.test(text(value));

const safeContent = (content = {}) => ({
  definitionHeading: text(content.definitionHeading, 'What is it?'),
  definition: text(content.definition),
  dailyLifeHeading: text(content.dailyLifeHeading, 'How might it affect learning or daily life?'),
  dailyLife: text(content.dailyLife),
  strengthsHeading: text(content.strengthsHeading, 'What strengths might a person have?'),
  strengths: text(content.strengths),
  challengesHeading: text(content.challengesHeading, 'What challenges might they experience?'),
  challenges: list(content.challenges),
  supportsHeading: text(content.supportsHeading, 'What support can help?'),
  supports: list(content.supports)
});

const safeQuestion = (question = {}) => ({
  question: text(question.question),
  // Deliberately false: the browser must never receive or infer a reviewed
  // answer key. Manifest-backed checks call /courses/check-answer instead.
  options: list(question.options).slice(0, 4).map((option) => [option, false]),
  explanation: ''
});

const validateQuestion = (question, label) => {
  if (!text(question?.question) || !Array.isArray(question?.options) || question.options.length !== 4 || question.options.some((option) => !text(option))) {
    throw new Error(`The reviewed ${label} is incomplete.`);
  }
};

const validateUnit = (unit, label) => {
  const recall = text(unit?.typing?.level) === 'Recall typing';
  if (!text(unit?.title) || !unit?.content || (!recall && !text(unit?.typing?.target))) {
    throw new Error(`The reviewed ${label} is incomplete.`);
  }
  validateQuestion(unit.check, `${label} quick check`);
};

export const isReviewedLearnerManifest = (manifest) => Boolean(
  manifest
  && manifest.format === 'type2learn-theory-course/v1'
  && identifier(manifest.id)
  && /^\d+\.\d+(?:\.\d+)?$/.test(text(manifest.version))
  && Array.isArray(manifest.modules)
  && manifest.modules.length
  && manifest.title?.en
  && manifest.title?.ur
);

const sourceReadSections = (content) => [
  content.definitionHeading && content.definition ? `${content.definitionHeading}: ${content.definition}` : '',
  content.dailyLifeHeading && content.dailyLife ? `${content.dailyLifeHeading}: ${content.dailyLife}` : '',
  content.strengthsHeading && content.strengths ? `${content.strengthsHeading}: ${content.strengths}` : '',
  content.challengesHeading && content.challenges.length ? `${content.challengesHeading}: ${content.challenges.join('; ')}.` : '',
  content.supportsHeading && content.supports.length ? `${content.supportsHeading}: ${content.supports.join('; ')}.` : ''
].filter(Boolean);

// The established player expects guided practice as a sequence of phrases.
// A reviewed manifest intentionally keeps one audited target string instead,
// so split it only at sentence boundaries here. This is a display/input
// adaptation, not new curriculum and never changes the reviewed target text.
const guidedPhrases = (target) => {
  const value = text(target);
  const phrases = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return phrases.map((phrase) => phrase.trim()).filter(Boolean).length
    ? phrases.map((phrase) => phrase.trim()).filter(Boolean)
    : value ? [value] : [];
};

const adaptUnit = (unit, index) => {
  const content = safeContent(unit.content);
  const typing = {
    level: text(unit.typing?.level, 'Key idea typing'),
    prompt: text(unit.typing?.prompt, 'Type the visible key idea in the field.'),
    target: text(unit.typing?.target),
    placeholder: 'Type the visible section here…'
  };
  if (typing.level === 'Guided typing') {
    typing.phrases = guidedPhrases(typing.target);
    // The rich player reads phrases for this activity. Leaving the target in
    // the public object is harmless, but clearing it avoids two competing
    // representations of the same reviewed activity.
    typing.target = '';
  }
  return {
    module: `Module ${index + 1}`,
    manifestModuleId: text(unit.manifestModuleId),
    title: text(unit.title),
    duration: '',
    content,
    read: sourceReadSections(content),
    simple: text(unit.simple),
    example: text(unit.example),
    hint: text(unit.hint),
    typing,
    check: safeQuestion(unit.check)
  };
};

/**
 * Converts the reviewed learner projection to the pre-existing rich course
 * engine's contract. It does not add authored content or answer keys.
 */
export const adaptReviewedManifestForRichCourse = (manifest) => {
  if (!isReviewedLearnerManifest(manifest)) throw new Error('This reviewed course manifest is not valid for the course player.');
  if (JSON.stringify(manifest).includes('correctOption')) throw new Error('A private answer key cannot be loaded into the learner course.');

  const englishSteps = manifest.modules.map((module, index) => {
    if (!identifier(module?.id)) throw new Error(`The reviewed module ${index + 1} has no valid identifier.`);
    validateUnit(module.en, `English module ${index + 1}`);
    return adaptUnit({ ...module.en, manifestModuleId: module.id }, index);
  });
  const urduSteps = manifest.modules.map((module, index) => {
    validateUnit(module.ur, `Urdu module ${index + 1}`);
    return adaptUnit({ ...module.ur, manifestModuleId: module.id }, index);
  });
  const enFinal = Array.isArray(manifest.finalExam?.en) ? manifest.finalExam.en : [];
  const urFinal = Array.isArray(manifest.finalExam?.ur) ? manifest.finalExam.ur : [];
  if (enFinal.length !== urFinal.length || !enFinal.length) throw new Error('The reviewed final understanding check is incomplete.');
  enFinal.forEach((question, index) => validateQuestion(question, `English final question ${index + 1}`));
  urFinal.forEach((question, index) => validateQuestion(question, `Urdu final question ${index + 1}`));

  return {
    course: {
      id: text(manifest.id),
      version: text(manifest.version),
      title: text(manifest.title.en),
      label: text(manifest.label?.en, 'Educational course'),
      contentNotice: text(manifest.contentNotice?.en),
      manifestBacked: true,
      steps: englishSteps,
      // This legacy-only screen remains unavailable in the normal route; the
      // entries are still learner-safe if an older cached phase reaches it.
      finalExam: {
        title: 'Final understanding check',
        description: 'Use what you learned across the reviewed course.',
        questions: enFinal.map(safeQuestion)
      }
    },
    urdu: {
      title: text(manifest.title.ur),
      label: text(manifest.label?.ur, 'تعلیمی کورس'),
      contentNotice: text(manifest.contentNotice?.ur),
      steps: urduSteps,
      finalExam: {
        title: 'آخری سمجھ جانچ',
        description: 'منظور شدہ کورس میں سیکھی ہوئی باتوں کا استعمال کریں۔',
        questions: urFinal.map(safeQuestion)
      }
    },
    context: Object.freeze({ courseId: text(manifest.id), version: text(manifest.version), manifestBacked: true })
  };
};
