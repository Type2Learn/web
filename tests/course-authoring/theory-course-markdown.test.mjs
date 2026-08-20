import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THEORY_COURSE_TEMPLATE,
  THEORY_MARKDOWN_FORMAT,
  compileTheoryCourse,
  fallbackMcqDraft,
  parseTheoryMarkdown,
  validateTheoryCourse
} from '../../server/theory-course-markdown.mjs';

const course = () => `---
format: ${THEORY_MARKDOWN_FORMAT}
id: learning-about-water
version: 1.0.0
title.en: Learning about water
title.ur: پانی کے بارے میں سیکھنا
label.en: Educational course
label.ur: تعلیمی کورس
notice.en: Reviewed educational content.
notice.ur: جائزہ شدہ تعلیمی مواد۔
---
# Module: water-cycle
## English
### Title
The water cycle
### Definition
Water can move between land, water, and air.
### Daily life
Rain can refill a water source.
### Strengths
Learners can notice patterns in weather.
### Challenges
- Some words can be unfamiliar.
- A diagram can have several parts.
### Supports
- Read one step at a time.
- Use a labelled diagram.
### Simple
Water moves around and can come back as rain.
### Example
Water in a puddle can slowly dry after sunshine.
### Hint
Think about where the water goes after it dries.
### Typing
level: Key idea typing
prompt: Type the key idea.
target: Water can move between land, water, and air.
### Check
question: Which statement fits the water cycle?
- [x] Water can move between land, water, and air.
- [ ] Water stays in exactly one place forever.
- [ ] Rain is unrelated to water.
- [ ] Diagrams cannot show a process.
## Urdu
### Title
پانی کا چکر
### Definition
پانی زمین، پانی کے ذخیرے اور ہوا کے درمیان حرکت کر سکتا ہے۔
### Daily life
بارش پانی کے ذخیرے کو دوبارہ بھر سکتی ہے۔
### Strengths
سیکھنے والے موسم کے نمونوں کو دیکھ سکتے ہیں۔
### Challenges
- کچھ الفاظ نئے ہو سکتے ہیں۔
- خاکے میں کئی حصے ہو سکتے ہیں۔
### Supports
- ایک وقت میں ایک قدم پڑھیں۔
- ناموں والا خاکہ استعمال کریں۔
### Simple
پانی حرکت کرتا ہے اور بارش بن کر واپس آ سکتا ہے۔
### Example
دھوپ کے بعد گڑھے کا پانی آہستہ آہستہ خشک ہو سکتا ہے۔
### Hint
سوچیں خشک ہونے کے بعد پانی کہاں جاتا ہے۔
### Typing
level: Key idea typing
prompt: اہم خیال لکھیں۔
target: پانی زمین، پانی کے ذخیرے اور ہوا کے درمیان حرکت کر سکتا ہے۔
### Check
question: کون سا بیان پانی کے چکر کو ظاہر کرتا ہے؟
- [x] پانی زمین، پانی کے ذخیرے اور ہوا کے درمیان حرکت کر سکتا ہے۔
- [ ] پانی ہمیشہ ایک ہی جگہ رہتا ہے۔
- [ ] بارش کا پانی سے تعلق نہیں ہے۔
- [ ] خاکہ عمل نہیں دکھا سکتا۔
# Final exam
## English
### Question 1
question: What can rain do?
- [x] Refill a water source.
- [ ] Remove all water from Earth.
- [ ] Stop every cloud.
- [ ] Turn water into rock.
## Urdu
### Question 1
question: بارش کیا کر سکتی ہے؟
- [x] پانی کے ذخیرے کو دوبارہ بھر سکتی ہے۔
- [ ] زمین سے تمام پانی ہٹا سکتی ہے۔
- [ ] ہر بادل کو روک سکتی ہے۔
- [ ] پانی کو پتھر بنا سکتی ہے۔`;

test('the documented authoring template exposes the required bilingual structure', () => {
  assert.match(THEORY_COURSE_TEMPLATE, /format: type2learn-theory-course\/v1/);
  assert.match(THEORY_COURSE_TEMPLATE, /# Module:/);
  assert.match(THEORY_COURSE_TEMPLATE, /# Final exam/);
  assert.match(THEORY_COURSE_TEMPLATE, /## English/);
  assert.match(THEORY_COURSE_TEMPLATE, /## Urdu/);
});

test('valid bilingual theory Markdown parses and validates deterministically', () => {
  const parsed = parseTheoryMarkdown(course());
  const validation = validateTheoryCourse(parsed);
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  assert.equal(validation.modules.length, 1);
  assert.equal(validation.modules[0].id, 'water-cycle');
  assert.equal(validation.finalExam.English.length, 1);
  assert.equal(validation.finalExam.Urdu.length, 1);
});

test('compiler returns a learner manifest without answer keys and a private manifest with them', () => {
  const compiled = compileTheoryCourse(validateTheoryCourse(parseTheoryMarkdown(course())));
  assert.equal(compiled.learnerManifest.id, 'learning-about-water');
  assert.deepEqual(compiled.learnerManifest.finalExam.en[0].options, ['Refill a water source.', 'Remove all water from Earth.', 'Stop every cloud.', 'Turn water into rock.']);
  assert.equal('correctOption' in compiled.learnerManifest.finalExam.en[0], false);
  assert.equal(compiled.privateManifest.answerKeys.finalExam.en[0].correctOption, 0);
  assert.equal(compiled.privateManifest.answerKeys.modules[0].en.correctOption, 0);
});

test('validation catches a missing Urdu course and wrong MCQ shape', () => {
  const withoutUrdu = course().replace(/## Urdu[\s\S]*?# Final exam/, '# Final exam').replace(/## Urdu[\s\S]*$/, '');
  const validation = validateTheoryCourse(parseTheoryMarkdown(withoutUrdu));
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => /Urdu/.test(error)));
  const brokenQuestion = course().replace('- [ ] Diagrams cannot show a process.', '');
  const broken = validateTheoryCourse(parseTheoryMarkdown(brokenQuestion));
  assert.ok(broken.errors.some((error) => /exactly four/.test(error)));
});

test('deterministic fallback MCQs are review-only drafts with four non-empty options', () => {
  const draft = fallbackMcqDraft({ prompt: 'What is a useful support?', answer: 'Use a labelled diagram.', distractors: ['Use no labels.'] });
  assert.equal(draft.reviewRequired, true);
  assert.equal(draft.source, 'deterministic-draft');
  assert.equal(draft.options.length, 4);
  assert.equal(draft.options[0], 'Use a labelled diagram.');
  assert.ok(draft.options.every(Boolean));
});

test('validation rejects unsupported typing levels and unsafe identifiers', () => {
  const invalidId = validateTheoryCourse(parseTheoryMarkdown(course().replace('id: learning-about-water', 'id: Course With Spaces')));
  assert.ok(invalidId.errors.some((error) => error.startsWith('id must')));
  const invalidTyping = validateTheoryCourse(parseTheoryMarkdown(course().replace('level: Key idea typing', 'level: Type everything')));
  assert.ok(invalidTyping.errors.some((error) => /typing level/.test(error)));
});

test('validation keeps the final understanding check within its reviewed 21-question ceiling', () => {
  const extraEnglish = Array.from({ length: 21 }, (_, index) => `\n### Question ${index + 2}\nquestion: Extra English question ${index + 2}?\n- [x] Reviewed answer\n- [ ] Incorrect one\n- [ ] Incorrect two\n- [ ] Incorrect three`).join('');
  const extraUrdu = Array.from({ length: 21 }, (_, index) => `\n### Question ${index + 2}\nquestion: اضافی اردو سوال ${index + 2}؟\n- [x] جائزہ شدہ جواب\n- [ ] غلط ایک\n- [ ] غلط دو\n- [ ] غلط تین`).join('');
  const oversized = course().replace('\n## Urdu\n### Question 1', `${extraEnglish}\n## Urdu\n### Question 1`).replace(/(\n## Urdu\n### Question 1[\s\S]*)$/, `$1${extraUrdu}`);
  const validation = validateTheoryCourse(parseTheoryMarkdown(oversized));
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => /up to 21 reviewed questions/.test(error)));
});
