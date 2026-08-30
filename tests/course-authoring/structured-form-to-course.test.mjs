import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStructuredTheoryMarkdown, normaliseTheoryTypingLevel } from '../../course-authoring-form.js';
import { compileTheoryCourse, parseTheoryMarkdown, validateTheoryCourse } from '../../server/theory-course-markdown.mjs';

// This is intentionally a realistic teacher/admin form payload, rather than a
// hand-authored Markdown fixture. It proves that values typed into every
// bilingual structured section become a learner-safe compiled course.
const structuredCourse = () => ({
  course: {
    id: 'water-and-weather', version: '1.0.0',
    titleEn: 'Water and weather', titleUr: 'پانی اور موسم',
    labelEn: 'Science foundations', labelUr: 'سائنس کی بنیادیں',
    noticeEn: 'This course gives general educational information.',
    noticeUr: 'یہ کورس عمومی تعلیمی معلومات فراہم کرتا ہے۔'
  },
  modules: [{
    id: 'water-cycle',
    en: {
      title: 'The water cycle', definition: 'Water moves between land, water, and air.', dailyLife: 'Rain can refill a local water source.',
      strengths: 'Noticing weather patterns can support scientific thinking.', challenges: 'The cycle has several connected stages.\nWords such as evaporation can be new.', supports: 'Use a simple sequence diagram.\nConnect each stage to a familiar example.',
      simple: 'Water can travel from the ground to the air and back again.', example: 'A puddle can slowly disappear after sunshine warms it.', hint: 'Think about where water goes after a puddle becomes smaller.',
      typingLevel: 'Key idea typing', typingPrompt: 'Type the main idea in your own words.', typingTarget: 'Water can move between land, water, and air.',
      checkQuestion: 'Which statement matches the water cycle?', checkCorrect: 'Water can move between land, water, and air.', checkAlternative1: 'Water stays in exactly one place.', checkAlternative2: 'Rain only happens indoors.', checkAlternative3: 'Sunlight cannot affect water.'
    },
    ur: {
      title: 'پانی کا چکر', definition: 'پانی زمین، پانی کے ذخیرے اور ہوا کے درمیان حرکت کرتا ہے۔', dailyLife: 'بارش مقامی پانی کے ذخیرے کو بھر سکتی ہے۔',
      strengths: 'موسم کے نمونوں کو دیکھنا سائنسی سوچ میں مدد دے سکتا ہے۔', challenges: 'اس چکر میں کئی جڑے ہوئے مراحل ہوتے ہیں۔\nبخارات بننے جیسے الفاظ نئے ہو سکتے ہیں۔', supports: 'سادہ ترتیب والا خاکہ استعمال کریں۔\nہر مرحلے کو مانوس مثال سے ملائیں۔',
      simple: 'پانی زمین سے ہوا میں اور پھر واپس آ سکتا ہے۔', example: 'دھوپ میں گڑھا آہستہ آہستہ خشک ہو سکتا ہے۔', hint: 'سوچیں گڑھا چھوٹا ہونے کے بعد پانی کہاں جاتا ہے۔',
      // This was the previous visible Urdu starter label. The compiler keeps
      // backward compatibility but writes the parser-safe canonical enum.
      typingLevel: 'اہم خیال لکھنا', typingPrompt: 'اہم خیال اپنے الفاظ میں لکھیں۔', typingTarget: 'پانی زمین، پانی کے ذخیرے اور ہوا کے درمیان حرکت کر سکتا ہے۔',
      checkQuestion: 'کون سا بیان پانی کے چکر سے میل کھاتا ہے؟', checkCorrect: 'پانی زمین، پانی کے ذخیرے اور ہوا کے درمیان حرکت کر سکتا ہے۔', checkAlternative1: 'پانی ہمیشہ ایک ہی جگہ رہتا ہے۔', checkAlternative2: 'بارش صرف گھروں کے اندر ہوتی ہے۔', checkAlternative3: 'دھوپ پانی پر اثر نہیں ڈال سکتی۔'
    }
  }],
  finalQuestions: [{
    en: { question: 'What can happen to water in the cycle?', correct: 'It can move between land, water, and air.', alternative1: 'It can never change place.', alternative2: 'It only exists as ice.', alternative3: 'It avoids sunlight.' },
    ur: { question: 'پانی کے چکر میں پانی کے ساتھ کیا ہو سکتا ہے؟', correct: 'یہ زمین، پانی کے ذخیرے اور ہوا کے درمیان حرکت کر سکتا ہے۔', alternative1: 'یہ کبھی جگہ نہیں بدلتا۔', alternative2: 'یہ صرف برف کی شکل میں ہوتا ہے۔', alternative3: 'یہ دھوپ سے بچتا ہے۔' }
  }]
});

test('structured bilingual typing fields compile into a server-valid learner course', () => {
  const built = buildStructuredTheoryMarkdown(structuredCourse());
  assert.deepEqual(built.errors, []);
  assert.match(built.markdown, /# Module: water-cycle/);
  assert.match(built.markdown, /## Urdu[\s\S]*level: Key idea typing/);

  const validation = validateTheoryCourse(parseTheoryMarkdown(built.markdown));
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  const compiled = compileTheoryCourse(validation);
  assert.equal(compiled.learnerManifest.id, 'water-and-weather');
  assert.equal(compiled.learnerManifest.modules[0].ur.typing.level, 'Key idea typing');
  assert.equal(compiled.learnerManifest.modules[0].en.check.options.length, 4);
  assert.equal(JSON.stringify(compiled.learnerManifest).includes('correctOption'), false);
  assert.equal(compiled.privateManifest.answerKeys.modules[0].en.correctOption, 0);
});

test('structured form refuses unsupported activity types before Markdown reaches the server', () => {
  const invalid = structuredCourse();
  invalid.modules[0].en.typingLevel = 'Type every word';
  const built = buildStructuredTheoryMarkdown(invalid);
  assert.equal(built.markdown, '');
  assert.ok(built.errors.some((error) => error.includes('typing activity must be')));
});

test('typing level normalization only recognizes the three reviewed activity types', () => {
  assert.equal(normaliseTheoryTypingLevel('اہم خیال لکھنا'), 'Key idea typing');
  assert.equal(normaliseTheoryTypingLevel('guided typing'), 'Guided typing');
  assert.equal(normaliseTheoryTypingLevel('free writing'), '');
});
