// LEARNING PARTNER PRESENTATION
// No policy is inferred here. The caller supplies a deterministic directive;
// this module only makes its reason and learner choices visible.
const copy = (language, english, urdu) => language === 'ur' ? urdu : english;
const allowedRoles = new Set(['calm-guide', 'learning-partner', 'self-challenge', 'visual-co-explorer']);

// Authored per-module gaps make Learning Partner feel like a genuine teaching
// interaction rather than generic mascot chatter. The partner can ask about
// one missing relationship but cannot supply the learner's answer.
const partnerGaps = [
  ['I understand attention can feel different. I am still unsure how that can make starting a task harder. Can you explain one link?', 'میں سمجھتا ہوں کہ توجہ مختلف محسوس ہو سکتی ہے۔ مجھے ابھی یہ واضح نہیں کہ اس سے کام شروع کرنا کیسے مشکل ہو سکتا ہے۔ کیا آپ ایک تعلق سمجھا سکتے ہیں؟'],
  ['I know dyslexia can affect written language. What is one support that can make a page easier to work with?', 'میں جانتا ہوں کہ ڈسلیکسیا تحریری زبان پر اثر ڈال سکتا ہے۔ کون سی ایک مدد صفحے کے ساتھ کام آسان بنا سکتی ہے؟'],
  ['I understand people can experience the autism spectrum differently. Can you connect one learning experience to one respectful support?', 'میں سمجھتا ہوں کہ لوگ آٹزم اسپیکٹرم کو مختلف طرح سے محسوس کر سکتے ہیں۔ کیا آپ سیکھنے کے ایک تجربے کو ایک باعزت مدد سے جوڑ سکتے ہیں؟'],
  ['I know writing can take extra effort. What could make one written idea easier to organise?', 'میں جانتا ہوں کہ لکھنے میں اضافی محنت لگ سکتی ہے۔ ایک تحریری خیال کو منظم کرنا کس طرح آسان بنایا جا سکتا ہے؟'],
  ['I understand coordination can affect tasks. What is one way to make the next physical step clearer?', 'میں سمجھتا ہوں کہ ہم آہنگی کاموں پر اثر ڈال سکتی ہے۔ اگلا جسمانی قدم واضح بنانے کا ایک طریقہ کیا ہے؟'],
  ['I know numbers can feel difficult in different ways. Can you give one example of a support that keeps a number task understandable?', 'میں جانتا ہوں کہ اعداد مختلف طریقوں سے مشکل محسوس ہو سکتے ہیں۔ کوئی ایک مثال دیں کہ مدد کس طرح عددی کام کو قابلِ فہم رکھ سکتی ہے؟'],
  ['I understand spoken information can be hard to process in some settings. What could make one instruction easier to follow?', 'میں سمجھتا ہوں کہ کچھ جگہوں پر بولی ہوئی معلومات سمجھنا مشکل ہو سکتا ہے۔ ایک ہدایت کو آسان بنانے کے لیے کیا کیا جا سکتا ہے؟'],
  ['I know visual information can need another format. What is one way to keep the same idea accessible?', 'میں جانتا ہوں کہ بصری معلومات کو دوسرے انداز میں درکار ہو سکتی ہیں۔ اسی خیال کو قابلِ رسائی رکھنے کا ایک طریقہ کیا ہے؟'],
  ['I understand people can learn in different ways. What is one respectful support that keeps the task meaningful?', 'میں سمجھتا ہوں کہ لوگ مختلف طریقوں سے سیکھ سکتے ہیں۔ ایک باعزت مدد کیا ہے جو کام کو بامعنی رکھتی ہے؟'],
  ['I know a physical or motor task can need a different route. What could make the next action more accessible?', 'میں جانتا ہوں کہ جسمانی یا حرکی کام کو مختلف طریقہ درکار ہو سکتا ہے۔ اگلا عمل زیادہ قابلِ رسائی کیسے ہو سکتا ہے؟'],
  ['I understand sensory experiences can differ. What is one choice that could make a learning space feel more workable?', 'میں سمجھتا ہوں کہ حسی تجربات مختلف ہو سکتے ہیں۔ کون سا ایک انتخاب سیکھنے کی جگہ کو زیادہ قابلِ عمل بنا سکتا ہے؟']
];

const authoredPartnerGap = (snapshot, language) => {
  const index = Number(snapshot?.moduleIndex);
  const pair = partnerGaps[Number.isInteger(index) ? index : -1];
  // These detailed gaps belong only to the historic reviewed course. Other
  // teacher-published manifests retain the same partner interaction but use
  // their current reviewed module title, rather than inheriting a misleading
  // condition-specific prompt from the compatibility course.
  if (snapshot?.courseId && snapshot.courseId !== 'course-1-neurodivergent-conditions-v2') {
    const title = String(snapshot?.moduleTitle || '').trim();
    return copy(language,
      title ? `I am working through “${title}”. I understand the first part, but I am still unsure how it connects to the next idea. Can you explain one connection in your own words?` : 'I understand part of this idea. Can you help me connect it to the next idea in your own words?',
      title ? `میں «${title}» پر کام کر رہا ہوں۔ میں پہلا حصہ سمجھتا ہوں، مگر ابھی یہ واضح نہیں کہ یہ اگلے خیال سے کیسے جڑتا ہے۔ کیا آپ اپنے الفاظ میں ایک تعلق سمجھا سکتے ہیں؟` : 'میں اس خیال کا ایک حصہ سمجھتا ہوں۔ کیا آپ اسے اپنے الفاظ میں اگلے خیال سے جوڑنے میں میری مدد کر سکتے ہیں؟');
  }
  return pair ? copy(language, pair[0], pair[1]) : copy(language,
    'I understand part of this idea. Can you help me connect it to one practical support in your own words?',
    'میں اس خیال کا ایک حصہ سمجھتا ہوں۔ کیا آپ اسے ایک عملی مدد سے اپنے الفاظ میں جوڑنے میں میری مدد کر سکتے ہیں؟');
};

export const localCompanionDirective = (snapshot) => {
  const signals = snapshot?.signals || {};
  const matched = Object.values(signals).filter(Boolean).length;
  if (matched < 2 || !snapshot?.controls?.enabled || !snapshot?.controls?.proactive) return null;
  const role = allowedRoles.has(snapshot.controls.role) ? snapshot.controls.role : 'calm-guide';
  let trigger = '';
  let action = '';
  if (signals.delayedStart && signals.returned) { trigger = 'starting'; action = 'start-small'; }
  else if (signals.rereads && signals.longReading) { trigger = 're-reading'; action = 'open-visual'; }
  else if (signals.longTypingPause && signals.retries) { trigger = 'working-through-typing'; action = role === 'learning-partner' ? 'teach-partner' : 'smaller-step'; }
  else if (signals.aiRequests && signals.noTaskMovement) { trigger = 'returning'; action = 'return-to-task'; }
  else if (signals.completed && role === 'self-challenge') { trigger = 'ready-for-next-step'; action = 'optional-mission'; }
  else if (signals.assessmentUncertainty) { trigger = 'needs-a-choice'; action = 'process-support'; }
  else return null;
  const language = snapshot.language;
  const messages = {
    'calm-guide': copy(language, 'Start with the first visible sentence only. You can decide what comes next after that.', 'صرف پہلے نظر آنے والے جملے سے شروع کریں۔ اس کے بعد کیا کرنا ہے آپ خود طے کر سکتے ہیں۔'),
    'learning-partner': copy(language, snapshot.phase === 'assessment' ? 'I can help with the process: read the prompt once, choose text or speech, then share your own answer.' : authoredPartnerGap(snapshot, language), snapshot.phase === 'assessment' ? 'میں عمل میں مدد کر سکتا ہوں: سوال ایک بار پڑھیں، متن یا آواز منتخب کریں، پھر اپنا جواب دیں۔' : authoredPartnerGap(snapshot, language)),
    'self-challenge': copy(language, 'Optional mission: connect one idea from this section to a real situation. You can dismiss it without penalty.', 'اختیاری مشن: اس حصے کے ایک خیال کو کسی حقیقی صورتحال سے جوڑیں۔ آپ اسے بغیر کسی دباؤ کے بند کر سکتے ہیں۔'),
    'visual-co-explorer': copy(language, 'Would a simple map help? It can show one connection at a time, and it will only open if you choose it.', 'کیا ایک سادہ نقشہ مددگار ہوگا؟ یہ ایک وقت میں ایک تعلق دکھا سکتا ہے اور صرف آپ کے انتخاب پر کھلے گا۔')
  };
  return { role, trigger, action: role === 'visual-co-explorer' ? 'open-visual' : action, surface: snapshot.layout === 'focused' || snapshot.controls.presence === 'quiet' ? 'quiet-trigger' : 'bubble', message: messages[role] || messages['calm-guide'], reasonCategory: trigger, objectiveIds: snapshot.objectiveIds || [], source: 'authored-local' };
};

export const companionBubbleMarkup = ({ directive, language, escapeHtml, focused = false, speechControl = '' }) => {
  if (!directive) return '';
  const actionLabel = {
    'start-small': copy(language, 'Show the first step', 'پہلا قدم دکھائیں'),
    'open-visual': copy(language, 'Show it another way', 'دوسرے طریقے سے دکھائیں'),
    // This is an explicit current-page request to the same Course AI used by
    // the dock. It is not a vague instruction to care for the mascot.
    'teach-partner': copy(language, 'Help with this step', 'اس مرحلے میں مدد'),
    'return-to-task': copy(language, 'Return to this step', 'اس مرحلے پر واپس جائیں'),
    'optional-mission': copy(language, 'Try this mission', 'یہ مشن آزمائیں'),
    'process-support': copy(language, 'Show process support', 'عمل کی مدد دکھائیں'),
    'smaller-step': copy(language, 'Make it smaller', 'اسے چھوٹا کریں')
  }[directive.action] || copy(language, 'Use this support', 'یہ مدد استعمال کریں');
  if (focused || directive.surface === 'quiet-trigger') return '<button class="course-companion-quiet-trigger" type="button" data-action="companion-open" aria-label="' + escapeHtml(copy(language, 'Open mascot support', 'میسکاٹ کی مدد کھولیں')) + '"><span aria-hidden="true">✦</span>' + escapeHtml(copy(language, 'Mascot partner', 'میسکاٹ ساتھی')) + '</button>';
  // Once the shared Course AI has answered, the learner chooses a support in
  // the dock below the mascot. Repeating the same proactive action here would
  // only resend the generic request and make the speech bubble feel cluttered.
  const controls = directive.source === 'companion-chat'
    ? speechControl
    : '<button type="button" class="course-secondary-button" data-action="companion-use" data-companion-action="' + escapeHtml(directive.action) + '">' + escapeHtml(actionLabel) + '</button>' + speechControl;
  return '<aside class="course-companion-bubble" data-companion-bubble role="status" aria-live="polite"><p class="course-eyebrow">' + escapeHtml(copy(language, 'MASCOT PARTNER', 'میسکاٹ ساتھی')) + '</p><p>' + escapeHtml(directive.message) + '</p>' + (controls ? '<div class="course-companion-actions">' + controls + '</div>' : '') + '</aside>';
};

export const companionDockMarkup = ({ language, escapeHtml, draft = '', canSpeak = false, channel = 'text', listening = false, sending = false, status = '' }) => {
  const voiceEnabled = channel === 'speech' || channel === 'both';
  return '<div class="course-companion-dock" data-companion-dock><label><span class="course-visually-hidden">' + escapeHtml(copy(language, 'Message your mascot', 'اپنے میسکاٹ کو پیغام دیں')) + '</span><textarea rows="1" maxlength="900" data-companion-input placeholder="' + escapeHtml(copy(language, voiceEnabled ? 'Speak or write, then review before sending…' : 'Message your mascot…', voiceEnabled ? 'بولیں یا لکھیں، پھر بھیجنے سے پہلے دیکھیں…' : 'اپنے میسکاٹ کو پیغام دیں…')) + '"' + (sending ? ' disabled' : '') + '>' + escapeHtml(draft) + '</textarea></label><div>'
    + (voiceEnabled ? '<button type="button" class="course-secondary-button" data-action="companion-dictation"' + (canSpeak ? '' : ' disabled') + '>' + escapeHtml(copy(language, listening ? 'Listening…' : 'Speak', listening ? 'سن رہا ہوں…' : 'بولیں')) + '</button>' : '')
    + '<button type="button" class="course-primary-button" data-action="companion-send"' + (sending ? ' disabled' : '') + '>' + escapeHtml(copy(language, sending ? 'Thinking…' : 'Send', sending ? 'سوچ رہا ہوں…' : 'بھیجیں')) + '</button></div>'
    + (status ? '<p class="course-companion-dock-status" role="status">' + escapeHtml(status) + '</p>' : '') + '</div>';
};
