// Reusable, authored-data visual composition. This is deliberately a diagram,
// not an unreviewed generated image: it can be translated, keyboard-read, and
// kept aligned with the curriculum already on the page.
export const visualExplanationMarkup = ({ step, translatedStep, isUrdu, escapeHtml, courseUi }) => {
  const content = isUrdu ? (translatedStep?.content || {}) : (step?.content || {});
  const title = isUrdu ? (translatedStep?.title || step?.title) : step?.title;
  const definition = content.definition || step?.read?.[0] || '';
  const daily = content.dailyLife || step?.read?.[1] || '';
  const strengths = content.strengths || step?.read?.[2] || '';
  const support = Array.isArray(content.supports) ? content.supports[0] : (step?.read?.[3] || '');
  const alt = courseUi('A four-part concept map for ' + title + ': what it is, everyday experiences, strengths, and supportive options.', 'اس موضوع کا چار حصوں والا نقشہ: یہ کیا ہے، روزمرہ تجربات، خوبیاں، اور مدد کے طریقے۔');
  const node = (label, copy, index) => '<section class="course-visual-node course-visual-node--' + index + '"><span>' + escapeHtml(label) + '</span><p>' + escapeHtml(copy) + '</p></section>';
  const connection = '<section class="course-visual-connection" aria-label="' + escapeHtml(courseUi('How this idea connects', 'یہ خیال کیسے جڑتا ہے')) + '"><span class="course-visual-connection-dot" aria-hidden="true">1</span><p><strong>' + escapeHtml(courseUi('Notice the idea', 'خیال کو دیکھیں')) + '</strong><span>' + escapeHtml(courseUi('Understand the experience, name a strength, then choose one supportive next step.', 'تجربہ سمجھیں، ایک خوبی پہچانیں، پھر مدد کا ایک اگلا قدم منتخب کریں۔')) + '</span></p><span class="course-visual-connection-arrow" aria-hidden="true">→</span></section>';
  return '<aside class="course-visual-explanation" data-visual-explanation aria-label="' + escapeHtml(courseUi('Visual explanation', 'بصری وضاحت')) + '"><header><div><p class="course-eyebrow">' + escapeHtml(courseUi('VISUAL EXPLANATION', 'بصری وضاحت')) + '</p><h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(courseUi('A simple map of the idea on this page.', 'اس صفحے کے خیال کا ایک سادہ نقشہ۔')) + '</p></div><button class="course-secondary-button" type="button" data-action="close-visual-explanation">' + escapeHtml(courseUi('Return to lesson', 'سبق کی طرف واپس جائیں')) + '</button></header><div class="course-visual-map" role="img" aria-label="' + escapeHtml(alt) + '">' + node(courseUi('What it is', 'یہ کیا ہے'), definition, 1) + node(courseUi('Everyday experience', 'روزمرہ تجربہ'), daily, 2) + node(courseUi('Strengths', 'خوبیاں'), strengths, 3) + node(courseUi('Support', 'مدد'), support, 4) + '</div>' + connection + '<details class="course-visual-text-equivalent"><summary>' + escapeHtml(courseUi('Read the text version', 'متن کی صورت پڑھیں')) + '</summary><p>' + escapeHtml(alt) + '</p></details></aside>';
};
