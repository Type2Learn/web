// ADMIN STRUCTURED COURSE FORM ------------------------------------------------
// This module is deliberately browser- and Node-safe. It is the single
// deterministic compiler used by the administrator's guided form, while the
// server remains the final authority that validates and stores a course.
// Keeping this conversion outside the DOM makes it directly testable and
// prevents a form that looks complete from producing invalid Markdown.

export const THEORY_TYPING_LEVELS = Object.freeze([
  'Key idea typing',
  'Guided typing',
  'Recall typing'
]);

const typingLevelAliases = new Map([
  ['key idea typing', 'Key idea typing'],
  ['guided typing', 'Guided typing'],
  ['recall typing', 'Recall typing'],
  ['اہم خیال لکھنا', 'Key idea typing'],
  ['رہنمائی کے ساتھ لکھنا', 'Guided typing'],
  ['یاد سے لکھنا', 'Recall typing']
]);

export const normaliseTheoryTypingLevel = (value) => typingLevelAliases.get(String(value || '').trim().toLowerCase()) || typingLevelAliases.get(String(value || '').trim()) || '';

const safeLine = (value) => String(value ?? '').replace(/\r/g, '').trim().replace(/\s+/g, ' ');
const safeParagraph = (value) => String(value ?? '').replace(/\r/g, '').trim().split('\n').map(safeLine).filter(Boolean).join(' ');
const safeList = (value) => String(value ?? '').replace(/\r/g, '').trim().split('\n').map((line) => safeLine(line.replace(/^[-*]\s*/, ''))).filter(Boolean);
const safeIdentifier = (value) => safeLine(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);

const cleanLanguage = (raw = {}, index, language, errors) => {
  const label = `Module ${index + 1}: ${language}`;
  const required = (key, name, formatter = safeParagraph) => {
    const value = formatter(raw[key]);
    if (!value) errors.push(`${label} ${name} is required.`);
    return value;
  };
  const challenges = safeList(raw.challenges);
  const supports = safeList(raw.supports);
  if (!challenges.length) errors.push(`${label} challenges need at least one line.`);
  if (!supports.length) errors.push(`${label} supports need at least one line.`);
  const suppliedTypingLevel = required('typingLevel', 'typing activity label', safeLine);
  const typingLevel = normaliseTheoryTypingLevel(suppliedTypingLevel);
  if (suppliedTypingLevel && !typingLevel) errors.push(`${label} typing activity must be Key idea typing, Guided typing, or Recall typing.`);
  const typingPrompt = required('typingPrompt', 'typing instruction');
  const typingTarget = safeParagraph(raw.typingTarget);
  if (typingLevel !== 'Recall typing' && !typingTarget) errors.push(`${label} typing target is required unless the activity is Recall typing.`);
  return {
    title: required('title', 'title'), definition: required('definition', 'definition'), dailyLife: required('dailyLife', 'daily-life context'), strengths: required('strengths', 'strengths'),
    challenges, supports, simple: required('simple', 'plain-language explanation'), example: required('example', 'concrete example'), hint: required('hint', 'optional hint'),
    typingLevel, typingPrompt, typingTarget,
    checkQuestion: required('checkQuestion', 'check question'), checkCorrect: required('checkCorrect', 'correct answer'),
    checkAlternative1: required('checkAlternative1', 'alternative one'), checkAlternative2: required('checkAlternative2', 'alternative two'), checkAlternative3: required('checkAlternative3', 'alternative three')
  };
};

const cleanQuestion = (raw = {}, index, language, errors) => {
  const label = `Final check ${index + 1}: ${language}`;
  const required = (key, name) => {
    const value = safeParagraph(raw[key]);
    if (!value) errors.push(`${label} ${name} is required.`);
    return value;
  };
  return {
    question: required('question', 'question'), correct: required('correct', 'correct answer'),
    alternative1: required('alternative1', 'alternative one'), alternative2: required('alternative2', 'alternative two'), alternative3: required('alternative3', 'alternative three')
  };
};

// Converts the form's plain values to the canonical theory-course Markdown
// contract. It does not publish anything, call a model, or bypass the server
// compiler. The form therefore supports an immediate local check and the
// server gets the exact same source that the administrator reviewed.
export const buildStructuredTheoryMarkdown = (input = {}) => {
  const errors = [];
  const sourceCourse = input.course || {};
  const course = {
    id: safeIdentifier(sourceCourse.id), version: safeLine(sourceCourse.version),
    titleEn: safeParagraph(sourceCourse.titleEn), titleUr: safeParagraph(sourceCourse.titleUr),
    labelEn: safeParagraph(sourceCourse.labelEn), labelUr: safeParagraph(sourceCourse.labelUr),
    noticeEn: safeParagraph(sourceCourse.noticeEn), noticeUr: safeParagraph(sourceCourse.noticeUr)
  };
  [['id', 'course ID'], ['version', 'version'], ['titleEn', 'English title'], ['titleUr', 'Urdu title'], ['labelEn', 'English label'], ['labelUr', 'Urdu label'], ['noticeEn', 'English notice'], ['noticeUr', 'Urdu notice']].forEach(([key, label]) => { if (!course[key]) errors.push(`Course ${label} is required.`); });
  if (course.id && !/^[a-z0-9][a-z0-9-]{2,79}$/.test(course.id)) errors.push('Course ID must use lowercase letters, numbers, and hyphens.');
  if (course.version && !/^\d+\.\d+(?:\.\d+)?$/.test(course.version)) errors.push('Course version must look like 1.0.0.');

  const rawModules = Array.isArray(input.modules) ? input.modules : [];
  if (!rawModules.length) errors.push('Add at least one module.');
  if (rawModules.length > 21) errors.push('A theory course can contain at most 21 modules.');
  const seenIds = new Set();
  const modules = rawModules.map((raw, index) => {
    const id = safeIdentifier(raw?.id);
    if (!id) errors.push(`Module ${index + 1}: a module ID is required.`);
    if (id && seenIds.has(id)) errors.push(`Module ID "${id}" is used more than once.`);
    seenIds.add(id);
    return { id, en: cleanLanguage(raw?.en, index, 'English', errors), ur: cleanLanguage(raw?.ur, index, 'Urdu', errors) };
  });

  const rawFinalQuestions = Array.isArray(input.finalQuestions) ? input.finalQuestions : [];
  if (!rawFinalQuestions.length) errors.push('Add at least one bilingual final-check question.');
  if (rawFinalQuestions.length > 21) errors.push('A final check can contain at most 21 questions.');
  const finalQuestions = rawFinalQuestions.map((raw, index) => ({ en: cleanQuestion(raw?.en, index, 'English', errors), ur: cleanQuestion(raw?.ur, index, 'Urdu', errors) }));
  if (errors.length) return { errors, markdown: '' };

  const languageMarkdown = (name, item) => `## ${name}\n### Title\n${item.title}\n### Definition\n${item.definition}\n### Daily life\n${item.dailyLife}\n### Strengths\n${item.strengths}\n### Challenges\n${item.challenges.map((line) => `- ${line}`).join('\n')}\n### Supports\n${item.supports.map((line) => `- ${line}`).join('\n')}\n### Simple\n${item.simple}\n### Example\n${item.example}\n### Hint\n${item.hint}\n### Typing\nlevel: ${item.typingLevel}\nprompt: ${item.typingPrompt}\ntarget: ${item.typingTarget}\n### Check\nquestion: ${item.checkQuestion}\n- [x] ${item.checkCorrect}\n- [ ] ${item.checkAlternative1}\n- [ ] ${item.checkAlternative2}\n- [ ] ${item.checkAlternative3}`;
  const moduleMarkdown = (module) => `# Module: ${module.id}\n\n${languageMarkdown('English', module.en)}\n\n${languageMarkdown('Urdu', module.ur)}`;
  const finalMarkdown = (language) => finalQuestions.map((question, index) => {
    const item = question[language];
    return `### Question ${index + 1}\nquestion: ${item.question}\n- [x] ${item.correct}\n- [ ] ${item.alternative1}\n- [ ] ${item.alternative2}\n- [ ] ${item.alternative3}`;
  }).join('\n\n');
  return {
    errors: [],
    markdown: `---\nformat: type2learn-theory-course/v1\nid: ${course.id}\nversion: ${course.version}\ntitle.en: ${course.titleEn}\ntitle.ur: ${course.titleUr}\nlabel.en: ${course.labelEn}\nlabel.ur: ${course.labelUr}\nnotice.en: ${course.noticeEn}\nnotice.ur: ${course.noticeUr}\n---\n\n${modules.map(moduleMarkdown).join('\n\n')}\n\n# Final exam\n\n## English\n${finalMarkdown('en')}\n\n## Urdu\n${finalMarkdown('ur')}\n`
  };
};
