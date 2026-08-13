// `type2learn-theory-course/v1` is deliberately small and human-editable.
// It uses Markdown headings for course structure and never asks an AI to infer
// the shape of a learner course from an arbitrary document.

export const THEORY_MARKDOWN_FORMAT = 'type2learn-theory-course/v1';

export const THEORY_COURSE_TEMPLATE = `---
format: ${THEORY_MARKDOWN_FORMAT}
id: replace-with-course-id
version: 1.0.0
title.en: English course title
title.ur: اردو کورس کا عنوان
label.en: Educational course
label.ur: تعلیمی کورس
notice.en: Reviewed educational content. It is not individual advice or a diagnosis.
notice.ur: یہ جائزہ شدہ تعلیمی مواد ہے۔ یہ انفرادی مشورہ یا تشخیص نہیں ہے۔
---

# Module: first-module

## English

### Title
One small idea

### Definition
Write a short, reviewed explanation.

### Daily life
Describe one possible everyday or learning context.

### Strengths
Name strengths without making assumptions about every learner.

### Challenges
- One possible challenge
- Another possible challenge

### Supports
- One respectful support
- Another respectful support

### Simple
Write an authored plain-language version.

### Example
Write one concrete example.

### Hint
Write an optional, brief hint.

### Typing
level: Key idea typing
prompt: Type the key idea in the field.
target: A short reviewed sentence the learner can reconstruct.

### Check
question: Which response best reflects this module?
- [x] The reviewed correct response
- [ ] A plausible but incorrect response
- [ ] Another incorrect response
- [ ] Another incorrect response

## Urdu

### Title
ایک چھوٹا خیال

### Definition
اردو میں مختصر، جائزہ شدہ وضاحت لکھیں۔

### Daily life
روزمرہ یا سیکھنے کی ایک ممکنہ صورت بیان کریں۔

### Strengths
بغیر مفروضہ کیے ممکنہ طاقتیں بیان کریں۔

### Challenges
- ایک ممکنہ مشکل
- دوسری ممکنہ مشکل

### Supports
- ایک باعزت مدد
- دوسری باعزت مدد

### Simple
مصنف کی سادہ زبان میں وضاحت لکھیں۔

### Example
ایک واضح مثال لکھیں۔

### Hint
مختصر اختیاری اشارہ لکھیں۔

### Typing
level: Key idea typing
prompt: اہم خیال میدان میں لکھیں۔
target: ایک مختصر جائزہ شدہ جملہ۔

### Check
question: کون سا جواب اس ماڈیول کو بہتر طور پر ظاہر کرتا ہے؟
- [x] جائزہ شدہ درست جواب
- [ ] ایک بظاہر درست مگر غلط جواب
- [ ] ایک اور غلط جواب
- [ ] ایک اور غلط جواب

# Final exam

## English

### Question 1
question: Write a reviewed final question.
- [x] Correct answer
- [ ] Incorrect answer
- [ ] Incorrect answer
- [ ] Incorrect answer

## Urdu

### Question 1
question: جائزہ شدہ آخری سوال لکھیں۔
- [x] درست جواب
- [ ] غلط جواب
- [ ] غلط جواب
- [ ] غلط جواب
`;

const requiredModuleFields = ['title', 'definition', 'daily life', 'strengths', 'challenges', 'supports', 'simple', 'example', 'hint', 'typing', 'check'];
const languages = new Set(['English', 'Urdu']);
const clean = (value) => String(value || '').replace(/\r/g, '').trim();
const linesFor = (value) => clean(value).split('\n').map((line) => line.trim()).filter(Boolean);
const singleLine = (value) => clean(value).replace(/\s+/g, ' ');
const listFrom = (value) => linesFor(value).filter((line) => /^[-*]\s+/.test(line)).map((line) => line.replace(/^[-*]\s+/, '').trim()).filter(Boolean);
const valueFrom = (value, key) => {
  const match = clean(value).match(new RegExp(`^${key}:\\s*(.+)$`, 'im'));
  return match ? singleLine(match[1]) : '';
};
const optionsFrom = (value) => linesFor(value)
  .map((line) => line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/))
  .filter(Boolean)
  .map((match) => ({ label: singleLine(match[2]), correct: /x/i.test(match[1]) }));

const parseFrontMatter = (markdown) => {
  const source = String(markdown || '').replace(/^\uFEFF/, '');
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { metadata: {}, body: source, errors: ['Start the file with a YAML-style metadata block between --- lines.'] };
  const metadata = {};
  const errors = [];
  match[1].split('\n').forEach((line, index) => {
    if (!line.trim() || /^\s*#/.test(line)) return;
    const pair = line.match(/^\s*([A-Za-z][A-Za-z0-9_.-]*)\s*:\s*(.*?)\s*$/);
    if (!pair) errors.push(`Metadata line ${index + 1} is not key: value.`);
    else metadata[pair[1]] = pair[2];
  });
  return { metadata, body: match[2], errors };
};

const createLanguage = () => ({ fields: {}, order: [] });
const createModule = (id) => ({ id, languages: { English: createLanguage(), Urdu: createLanguage() } });

export const parseTheoryMarkdown = (markdown) => {
  const frontMatter = parseFrontMatter(markdown);
  const errors = [...frontMatter.errors];
  const modules = [];
  const finalExam = { English: [], Urdu: [] };
  let currentModule = null;
  let currentLanguage = '';
  let currentField = '';
  let inFinalExam = false;
  let currentQuestion = null;
  let buffer = [];

  const flush = () => {
    const value = clean(buffer.join('\n'));
    if (!value) return;
    if (inFinalExam && currentLanguage && currentQuestion) {
      currentQuestion.content = value;
      return;
    }
    if (currentModule && currentLanguage && currentField) {
      currentModule.languages[currentLanguage].fields[currentField] = value;
      currentModule.languages[currentLanguage].order.push(currentField);
    }
  };

  String(frontMatter.body || '').replace(/\r/g, '').split('\n').forEach((line, index) => {
    const moduleHeading = line.match(/^#\s+Module:\s*([A-Za-z0-9][A-Za-z0-9_-]{0,79})\s*$/i);
    const finalHeading = /^#\s+Final exam\s*$/i.test(line);
    const languageHeading = line.match(/^##\s+(English|Urdu)\s*$/i);
    const fieldHeading = line.match(/^###\s+(.+?)\s*$/);
    if (moduleHeading || finalHeading || languageHeading || fieldHeading) flush();
    if (moduleHeading) {
      if (inFinalExam) errors.push(`Module at line ${index + 1} appears after the final exam.`);
      currentModule = createModule(moduleHeading[1]);
      modules.push(currentModule);
      currentLanguage = '';
      currentField = '';
      currentQuestion = null;
      buffer = [];
      return;
    }
    if (finalHeading) {
      inFinalExam = true;
      currentModule = null;
      currentLanguage = '';
      currentField = '';
      currentQuestion = null;
      buffer = [];
      return;
    }
    if (languageHeading) {
      currentLanguage = languageHeading[1][0].toUpperCase() + languageHeading[1].slice(1).toLowerCase();
      if (!languages.has(currentLanguage)) errors.push(`Unknown language at line ${index + 1}.`);
      currentField = '';
      currentQuestion = null;
      buffer = [];
      return;
    }
    if (fieldHeading) {
      const heading = singleLine(fieldHeading[1]);
      buffer = [];
      if (inFinalExam) {
        if (!currentLanguage) errors.push(`Final exam question at line ${index + 1} needs an English or Urdu heading.`);
        else {
          currentQuestion = { title: heading, content: '' };
          finalExam[currentLanguage].push(currentQuestion);
        }
      } else if (!currentModule || !currentLanguage) {
        errors.push(`Field "${heading}" at line ${index + 1} needs a module and language heading.`);
      } else {
        currentField = heading.toLowerCase();
      }
      return;
    }
    buffer.push(line);
  });
  flush();
  return { format: frontMatter.metadata.format || '', metadata: frontMatter.metadata, modules, finalExam, errors };
};

const validateQuestion = (content, path, errors) => {
  const question = valueFrom(content, 'question');
  const options = optionsFrom(content);
  if (!question) errors.push(`${path} needs a question: line.`);
  if (options.length !== 4) errors.push(`${path} needs exactly four checkbox options.`);
  if (options.filter((option) => option.correct).length !== 1) errors.push(`${path} needs exactly one [x] correct option.`);
  return { question, options };
};

const moduleLanguage = (language, module, errors) => {
  const fields = module.languages[language].fields;
  requiredModuleFields.forEach((field) => {
    if (!fields[field]) errors.push(`Module "${module.id}" ${language} is missing "${field}".`);
  });
  const typing = {
    level: valueFrom(fields.typing, 'level'),
    prompt: valueFrom(fields.typing, 'prompt'),
    target: valueFrom(fields.typing, 'target')
  };
  if (!['Key idea typing', 'Guided typing', 'Recall typing'].includes(typing.level)) errors.push(`Module "${module.id}" ${language} needs a supported typing level.`);
  if (!typing.prompt) errors.push(`Module "${module.id}" ${language} needs a typing prompt.`);
  if (typing.level !== 'Recall typing' && !typing.target) errors.push(`Module "${module.id}" ${language} needs a typing target.`);
  return {
    title: singleLine(fields.title),
    content: {
      definitionHeading: language === 'English' ? 'What is it?' : 'یہ کیا ہے؟',
      definition: singleLine(fields.definition),
      dailyLifeHeading: language === 'English' ? 'How might it affect learning or daily life?' : 'یہ سیکھنے یا روزمرہ زندگی کو کیسے متاثر کر سکتا ہے؟',
      dailyLife: singleLine(fields['daily life']),
      strengthsHeading: language === 'English' ? 'What strengths might a person have?' : 'کسی شخص میں کون سی طاقتیں ہو سکتی ہیں؟',
      strengths: singleLine(fields.strengths),
      challengesHeading: language === 'English' ? 'What challenges might they experience?' : 'انہیں کن مشکلات کا سامنا ہو سکتا ہے؟',
      challenges: listFrom(fields.challenges),
      supportsHeading: language === 'English' ? 'What support can help?' : 'کون سی مدد مفید ہو سکتی ہے؟',
      supports: listFrom(fields.supports)
    },
    simple: singleLine(fields.simple),
    example: singleLine(fields.example),
    hint: singleLine(fields.hint),
    typing,
    check: validateQuestion(fields.check, `Module "${module.id}" ${language} check`, errors)
  };
};

export const validateTheoryCourse = (parsed) => {
  const errors = [...(parsed?.errors || [])];
  const metadata = parsed?.metadata || {};
  if (metadata.format !== THEORY_MARKDOWN_FORMAT) errors.push(`format must be ${THEORY_MARKDOWN_FORMAT}.`);
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(String(metadata.id || ''))) errors.push('id must use lowercase letters, numbers, and hyphens.');
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(String(metadata.version || ''))) errors.push('version must be a semantic-style value such as 1.0.0.');
  ['title.en', 'title.ur', 'label.en', 'label.ur', 'notice.en', 'notice.ur'].forEach((key) => {
    if (!singleLine(metadata[key])) errors.push(`Metadata needs ${key}.`);
  });
  const seen = new Set();
  const modules = (parsed?.modules || []).map((module) => {
    if (seen.has(module.id)) errors.push(`Module id "${module.id}" is repeated.`);
    seen.add(module.id);
    return { id: module.id, English: moduleLanguage('English', module, errors), Urdu: moduleLanguage('Urdu', module, errors) };
  });
  if (!modules.length) errors.push('Add at least one module.');
  const englishExam = (parsed?.finalExam?.English || []).map((question, index) => validateQuestion(question.content, `English final question ${index + 1}`, errors));
  const urduExam = (parsed?.finalExam?.Urdu || []).map((question, index) => validateQuestion(question.content, `Urdu final question ${index + 1}`, errors));
  if (!englishExam.length || !urduExam.length) errors.push('Both English and Urdu final exams need at least one question.');
  if (englishExam.length !== urduExam.length) errors.push('English and Urdu final exams must have the same number of questions.');
  return { valid: errors.length === 0, errors, metadata, modules, finalExam: { English: englishExam, Urdu: urduExam } };
};

const learnerQuestion = (question) => ({ question: question.question, options: question.options.map((option) => option.label) });
const privateQuestion = (question) => ({ question: question.question, options: question.options.map((option) => option.label), correctOption: question.options.findIndex((option) => option.correct) });

export const compileTheoryCourse = (validation) => {
  if (!validation?.valid) throw new Error('Only a validated theory-course Markdown file can be compiled.');
  const metadata = validation.metadata;
  const learnerManifest = {
    format: THEORY_MARKDOWN_FORMAT,
    id: metadata.id,
    version: metadata.version,
    type: 'theory',
    languages: ['en', 'ur'],
    title: { en: metadata['title.en'], ur: metadata['title.ur'] },
    label: { en: metadata['label.en'], ur: metadata['label.ur'] },
    contentNotice: { en: metadata['notice.en'], ur: metadata['notice.ur'] },
    modules: validation.modules.map((module, index) => ({
      id: module.id,
      index: index + 1,
      en: { ...module.English, check: learnerQuestion(module.English.check) },
      ur: { ...module.Urdu, check: learnerQuestion(module.Urdu.check) }
    })),
    finalExam: {
      en: validation.finalExam.English.map(learnerQuestion),
      ur: validation.finalExam.Urdu.map(learnerQuestion)
    },
    narration: { requiredForPublication: false, fallback: 'device-text-to-speech' }
  };
  const privateManifest = {
    format: THEORY_MARKDOWN_FORMAT,
    id: metadata.id,
    version: metadata.version,
    type: 'theory',
    answerKeys: {
      modules: validation.modules.map((module) => ({ id: module.id, en: privateQuestion(module.English.check), ur: privateQuestion(module.Urdu.check) })),
      finalExam: { en: validation.finalExam.English.map(privateQuestion), ur: validation.finalExam.Urdu.map(privateQuestion) }
    },
    review: { status: 'validation-ready', generatedFields: [] }
  };
  return { learnerManifest, privateManifest };
};

export const fallbackMcqDraft = ({ prompt, answer, distractors = [] }) => {
  const wrong = [...distractors.map(singleLine).filter(Boolean), 'This statement is not supported by the reviewed module.', 'This response changes the course claim without evidence.', 'This response does not answer the question.'];
  return {
    question: singleLine(prompt),
    options: [singleLine(answer), ...wrong.filter((value) => value !== singleLine(answer)).slice(0, 3)],
    source: 'deterministic-draft',
    reviewRequired: true
  };
};
