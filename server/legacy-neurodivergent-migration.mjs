import { COURSE_CONTENT } from '../course/course-content.js';
import { COURSE_URDU } from '../course/course-urdu.js';
import { compileTheoryCourse, parseTheoryMarkdown, validateTheoryCourse } from './theory-course-markdown.mjs';

const line = (value) => String(value || '').replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim();
const list = (values) => (Array.isArray(values) ? values : []).map((value) => `- ${line(value)}`).join('\n');
const typing = (source = {}, fallbackPrompt = '', fallbackTarget = '') => {
  const level = ['Key idea typing', 'Guided typing', 'Recall typing'].includes(source.level) ? source.level : 'Key idea typing';
  const target = line(source.target || (Array.isArray(source.phrases) ? source.phrases.join(' ') : '') || source.reference || fallbackTarget);
  return `level: ${level}\nprompt: ${line(source.prompt || fallbackPrompt)}${level === 'Recall typing' ? '' : `\ntarget: ${target}`}`;
};
const options = (entries, correctFrom = []) => (Array.isArray(entries) ? entries : []).map((entry, index) => {
  const label = Array.isArray(entry) ? entry[0] : entry;
  const correct = Array.isArray(entry) ? Boolean(entry[1]) : Boolean(correctFrom[index]?.[1]);
  return `- [${correct ? 'x' : ' '}] ${line(label)}`;
}).join('\n');
const moduleMarkdown = (english, urdu, index) => {
  const en = english || {};
  const ur = urdu || {};
  const enContent = en.content || {};
  const urContent = ur.content || {};
  const enCheck = en.check || {};
  const urCheck = ur.check || {};
  return `# Module: module-${index + 1}

## English

### Title
${line(en.title)}

### Definition
${line(enContent.definition)}

### Daily life
${line(enContent.dailyLife)}

### Strengths
${line(enContent.strengths)}

### Challenges
${list(enContent.challenges)}

### Supports
${list(enContent.supports)}

### Simple
${line(en.simple)}

### Example
${line(en.example)}

### Hint
${line(en.hint)}

### Typing
${typing(en.typing, 'Type the key idea in the field.', en.simple)}

### Check
question: ${line(enCheck.question)}
${options(enCheck.options)}

## Urdu

### Title
${line(ur.title || en.title)}

### Definition
${line(urContent.definition || enContent.definition)}

### Daily life
${line(urContent.dailyLife || enContent.dailyLife)}

### Strengths
${line(urContent.strengths || enContent.strengths)}

### Challenges
${list(urContent.challenges?.length ? urContent.challenges : enContent.challenges)}

### Supports
${list(urContent.supports?.length ? urContent.supports : enContent.supports)}

### Simple
${line(ur.simple || en.simple)}

### Example
${line(ur.example || en.example)}

### Hint
${line(ur.hint || en.hint)}

### Typing
${typing(en.typing, 'اہم خیال لکھیں۔', ur.simple || en.simple)}

### Check
question: ${line(urCheck.question || enCheck.question)}
${options(urCheck.options?.length ? urCheck.options : enCheck.options, enCheck.options)}
`;
};
const examMarkdown = (english, urdu) => (Array.isArray(english) ? english : []).map((question, index) => {
  const translated = Array.isArray(urdu) ? urdu[index] || {} : {};
  return `### Question ${index + 1}
question: ${line(question.question)}
${options(question.options)}
`;
}).join('\n');
const urduExamMarkdown = (english, urdu) => (Array.isArray(english) ? english : []).map((question, index) => {
  const translated = Array.isArray(urdu) ? urdu[index] || {} : {};
  return `### Question ${index + 1}
question: ${line(translated.question || question.question)}
${options(translated.options?.length ? translated.options : question.options, question.options)}
`;
}).join('\n');

// The original learner page remains byte-for-byte on its existing curriculum
// source. This deterministic migration is the versioned Markdown contract for
// the new authoring pipeline and proves that future theory courses use the
// same learner-safe/private-manifest boundary.
export const legacyNeurodivergentMarkdown = () => `---
format: type2learn-theory-course/v1
id: ${COURSE_CONTENT.id}
version: ${COURSE_CONTENT.version}
title.en: ${line(COURSE_CONTENT.title)}
title.ur: ${line(COURSE_URDU.title)}
label.en: ${line(COURSE_CONTENT.label)}
label.ur: ${line(COURSE_URDU.label)}
notice.en: ${line(COURSE_CONTENT.contentNotice)}
notice.ur: ${line(COURSE_URDU.contentNotice)}
---

${(COURSE_CONTENT.steps || []).map((step, index) => moduleMarkdown(step, COURSE_URDU.steps?.[index], index)).join('\n')}
# Final exam

## English

${examMarkdown(COURSE_CONTENT.finalExam?.questions, COURSE_URDU.finalExam?.questions)}
## Urdu

${urduExamMarkdown(COURSE_CONTENT.finalExam?.questions, COURSE_URDU.finalExam?.questions)}`;

export const migratedLegacyTheoryCourse = () => {
  const parsed = parseTheoryMarkdown(legacyNeurodivergentMarkdown());
  const validation = validateTheoryCourse(parsed);
  if (!validation.valid) throw new Error(`Legacy course migration is invalid: ${validation.errors.join(' ')}`);
  return { markdown: legacyNeurodivergentMarkdown(), validation, ...compileTheoryCourse(validation) };
};
