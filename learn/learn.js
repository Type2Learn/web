import { getType2LearnGuest } from '/guest-session.js?v=20260731-guest1';

const app = document.getElementById('learn-app');
const preferenceStoragePrefix = 'type2learn-course-preferences-v1:';
const legacyPreferenceStoragePrefix = 'type2learn-learning-preferences-v1:';
const supportedCourseIds = new Set(['course-1-neurodivergent-conditions-v2']);
const selectedCourseId = new URLSearchParams(window.location.search).get('course') || '';
const backgroundNoiseSources = {
  pink: '/assets/audio/background-noise/pink-noise-loop.mp3',
  white: '/assets/audio/background-noise/white-noise-loop.mp3',
  brown: '/assets/audio/background-noise/brown-noise-loop.mp3'
};
const backgroundNoisePreview = { audio: null, type: 'pink', volume: 0.15, playing: false, fadeFrame: null, playRequest: 0 };
const mascotAnimationUrls = ['/assets/2D%20Mascot/blinking.webp?v=20260804-loop1'];
const mascotModuleUrl = '/course/mascot-2d.js?v=20260804-blink1';
// 3D rollback reference: preserve the original model URL alongside the
// untouched course/mascot-3d.js implementation.
// const mascotModelUrl = '/assets/mascot/type2learn-companion.glb';
let mascotAssetsWarmed = false;
let mascotPreloadLinks = [];
let mascotPreview = null;
let mascotPreviewLoad = null;
let setupStage = 'scheme';
let focusedStepIndex = 0;
let mascotLanguageExplicitlyChosen = false;
let layoutBeforeFocused = 'balanced';
let setupFeedbackTimer = 0;
let setupMotionSequence = 0;
const mascotScreenIsSupported = () => window.matchMedia?.('(min-width: 1181px)').matches;

const preferenceControls = [
  { id: 'layout', label: 'Page layout', description: 'How much space sits around one task.', choices: [['focused', 'Focused'], ['balanced', 'Balanced'], ['open', 'Open']] },
  { id: 'colours', label: 'Color style', description: 'How much color appears around the task.', choices: [['flat', 'Flat'], ['balanced', 'Balanced'], ['vivid', 'Vivid']] },
  { id: 'encouragement', label: 'Encouragement', description: 'How visible supportive moments feel.', choices: [['subtle', 'Subtle'], ['balanced', 'Balanced'], ['expressive', 'Expressive']] },
  { id: 'animations', label: 'Animations', description: 'How much supportive movement you would like to see.', choices: [['still', 'Still'], ['gentle', 'Gentle'], ['lively', 'Lively']] },
  { id: 'background-noise', label: 'Background noise', description: 'Optional looping sound, always off to start.', choices: [['off', 'Off'], ['on', 'On']] },
  { id: 'text-to-speech', label: 'Text to speech', description: 'Optional read-aloud support.', choices: [['off', 'Off'], ['on', 'On']] },
  { id: 'urdu-mode', label: 'Urdu mode', description: 'Show the course and Course AI in Urdu. The typing target stays in English.', choices: [['off', 'Off'], ['on', 'On']] },
  { id: 'mascot', label: 'Mascot', description: 'A learning companion when you want one.', choices: [['off', 'Off'], ['on', 'On']] }
];

const defaultChoices = {
  ...Object.fromEntries(preferenceControls.map(({ id, choices }) => [id, id === 'colours' || id === 'layout' ? 'balanced' : id === 'animations' ? 'gentle' : choices[0][0]])),
  'website-scheme': 'calm',
  'urdu-mode': 'off',
  'mascot-language': 'english',
  'mascot-language-explicit': false,
  'mascot-voice': 'text',
  'mascot-voice-language': 'english',
  'background-noise-type': 'pink',
  // A deliberately quiet starting point. The interface caps this at 35% so
  // background sound cannot jump to an unexpectedly loud browser volume.
  'background-noise-volume': '15'
};

const preferenceKey = (user, courseId) => preferenceStoragePrefix
  + encodeURIComponent(user?.uid || user?.email || 'learner')
  + ':' + encodeURIComponent(courseId);

const legacyPreferenceKey = (user) => legacyPreferenceStoragePrefix
  + encodeURIComponent(user?.uid || user?.email || 'learner');

const readPreferences = (user, courseId) => {
  try {
    const value = JSON.parse(window.localStorage.getItem(preferenceKey(user, courseId)) || 'null');
    if (value && typeof value === 'object') return value;
    // Existing general settings are used only to prefill this course once.
    // Continuing saves a separate, course-specific preference record.
    const legacy = JSON.parse(window.localStorage.getItem(legacyPreferenceKey(user)) || 'null');
    return legacy && typeof legacy === 'object' ? legacy : null;
  } catch (_) {
    return null;
  }
};

const savePreferences = (user, courseId, choices) => {
  try {
    window.localStorage.setItem(preferenceKey(user, courseId), JSON.stringify({ version: 1, courseId, complete: true, choices }));
  } catch (_) {
    /* The learner can still continue if this browser blocks local storage. */
  }
};

const warmMascotAssets = () => {
  if (mascotAssetsWarmed || !mascotScreenIsSupported()) return;
  mascotAssetsWarmed = true;
  [
    ['modulepreload', mascotModuleUrl, ''],
    ...mascotAnimationUrls.map((url) => ['preload', url, 'image/webp'])
  ].forEach(([rel, href, type]) => {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    if (rel === 'preload') {
      link.as = 'image';
      link.type = type;
    }
    document.head.append(link);
    mascotPreloadLinks.push(link);
  });
};

const releaseMascotAssets = () => {
  mascotPreloadLinks.forEach((link) => link.remove());
  mascotPreloadLinks = [];
  mascotAssetsWarmed = false;
  mascotPreview?.destroy?.();
  mascotPreview = null;
  mascotPreviewLoad = null;
};

const setupLanguage = (choices) => choices['urdu-mode'] === 'on' ? 'urdu' : 'english';

const setupCopy = (choices) => setupLanguage(choices) === 'urdu' ? {
  welcome: 'خوش آمدید',
  startingTitle: 'اپنی ویب سائٹ کی پیشکش منتخب کریں۔',
  startingIntro: 'یہ آپ کی پوری سیکھنے کی جگہ کا انداز بدلتی ہے۔ آپ اسے بعد میں بھی تبدیل کر سکتے ہیں۔',
  startingLabel: 'ویب سائٹ کی پیشکش',
  startingDescription: 'پُرسکون موجودہ انداز رکھتا ہے؛ کھیل کود رنگین، بچوں کے لیے دوستانہ اور زیادہ دل چسپ ہے۔',
  useLanguage: 'یہ انداز استعمال کریں',
  preferences: 'سیکھنے کی ترجیحات',
  focused: 'توجہ کے ساتھ ترتیب',
  title: 'اپنی سیکھنے کی جگہ ترتیب دیں۔',
  balancedIntro: 'آج وہ اختیارات منتخب کریں جو آپ کے لیے مفید ہوں۔ آپ انہیں بعد میں بدل سکتے ہیں۔',
  openIntro: 'ہر انتخاب کے لیے پوری جگہ رکھی گئی ہے تاکہ آپ انہیں اپنی رفتار سے دیکھ سکیں۔',
  focusedIntro: 'ایک وقت میں ایک واضح انتخاب۔ آپ یہ ترتیبات بعد میں بدل سکتے ہیں۔',
  laterSettings: 'آپ بعد میں اوپر دائیں کونے میں اپنی پروفائل تصویر کے ذریعے ان ترجیحات کو بدل سکتے ہیں۔',
  continue: 'جاری رکھیں',
  keep: 'یہ انتخاب رکھیں',
  course: 'کورس کی طرف جائیں',
  noiseType: 'آواز کی قسم',
  noiseDescription: 'وہ مسلسل آواز منتخب کریں جو آپ کی توجہ کم سے کم ہٹائے۔ آن کرنے پر یہ آہستہ شروع ہوتی ہے۔',
  volume: 'آواز کی سطح',
  quietStart: 'آہستہ شروع ہوتی ہے۔ زیادہ سے زیادہ آواز محدود ہے۔',
  playing: 'بج رہا ہے',
  selectNoise: 'آہستہ شروع کرنے کے لیے آواز کی قسم منتخب کریں۔',
  mascotUnavailable: 'میسکاٹ بڑی اسکرینوں پر دستیاب ہے۔ اس اسکرین پر یہ بند رہے گا۔'
} : {
  welcome: 'Welcome',
  startingTitle: 'Choose your website scheme.',
  startingIntro: 'This changes the presentation of your entire learning space. You can change it later from settings.',
  startingLabel: 'Website scheme',
  startingDescription: 'Calm keeps the current look. Playful is bright, colourful, and kid-friendly.',
  useLanguage: 'Use this scheme',
  preferences: 'Learning preferences',
  focused: 'Focused setup',
  title: 'Set up your learning space.',
  balancedIntro: 'Choose the options that feel useful today. You can revisit them later.',
  openIntro: 'Each choice has its own full space so you can look through it at your own pace.',
  focusedIntro: 'One clear choice at a time. You can revisit these settings later.',
  laterSettings: 'You can change these course preferences later from your profile picture in the top-right corner.',
  continue: 'Continue',
  keep: 'Keep this choice',
  course: 'Continue to course',
  noiseType: 'Noise type',
  noiseDescription: 'Choose the steady sound that feels least distracting. It starts quietly when you choose On.',
  volume: 'Volume',
  quietStart: 'Starts quietly. Maximum output is limited.',
  playing: 'Playing',
  selectNoise: 'Select a noise type to start it at',
  mascotUnavailable: 'Mascot is available on larger screens. This screen is too small, so it will stay off.'
};

const localizedControls = {
  urdu: {
    layout: { label: 'صفحے کی ترتیب', description: 'ایک سرگرمی کے گرد جگہ کی مقدار۔', choices: [['focused', 'توجہ کے ساتھ'], ['balanced', 'متوازن'], ['open', 'کھلی']] },
    colours: { label: 'رنگوں کا انداز', description: 'سرگرمی کے گرد رنگ کی مقدار۔', choices: [['flat', 'سادہ'], ['balanced', 'متوازن'], ['vivid', 'نمایاں']] },
    encouragement: { label: 'حوصلہ افزائی', description: 'مددگار لمحات کتنے نمایاں محسوس ہوں۔', choices: [['subtle', 'ہلکی'], ['balanced', 'متوازن'], ['expressive', 'نمایاں']] },
    animations: { label: 'حرکت', description: 'مددگار حرکت کی مقدار جو آپ دیکھنا چاہیں۔', choices: [['still', 'بغیر حرکت'], ['gentle', 'نرم'], ['lively', 'زیادہ']] },
    'background-noise': { label: 'پس منظر کی آواز', description: 'اختیاری مسلسل آواز، شروع میں ہمیشہ بند۔', choices: [['off', 'بند'], ['on', 'چالو']] },
    'text-to-speech': { label: 'متن سے آواز', description: 'اختیاری پڑھ کر سنانے کی مدد۔', choices: [['off', 'بند'], ['on', 'چالو']] },
    'urdu-mode': { label: 'اردو موڈ', description: 'کورس اور کورس کی مصنوعی ذہانت اردو میں دکھائیں۔ ٹائپنگ کا متن انگریزی میں رہتا ہے۔', choices: [['off', 'بند'], ['on', 'چالو']] },
    mascot: { label: 'میسکاٹ', description: 'جب آپ چاہیں ایک سیکھنے والا ساتھی۔', choices: [['off', 'بند'], ['on', 'چالو']] },
    'mascot-language': { label: 'میسکاٹ کی زبان', description: 'یہ آپ کی ابتدائی زبان کے ساتھ شروع ہوتی ہے۔ آپ میسکاٹ کے لیے الگ زبان منتخب کر سکتے ہیں۔', choices: [['english', 'انگریزی'], ['urdu', 'اردو']] },
    'mascot-voice': { label: 'میسکاٹ کی گفتگو', description: 'منتخب کریں کہ میسکاٹ آپ سے کیسے بات کرے گا۔', choices: [['text', 'متن'], ['speech', 'آواز'], ['both', 'دونوں']] },
    'mascot-voice-language': { label: 'میسکاٹ کی آواز', description: 'منتخب کریں کہ میسکاٹ کس زبان میں بولے گا۔', choices: [['english', 'انگریزی'], ['urdu', 'اردو']] }
  }
};

const localizedControl = (control, language) => localizedControls[language]?.[control.id]
  ? { ...control, ...localizedControls[language][control.id] }
  : control;

const controlMarkup = (originalControl, selected, language = 'english') => {
  const { id, label, description, choices } = localizedControl(originalControl, language);
  const mascotUnavailable = id === 'mascot' && !mascotScreenIsSupported();
  const copy = setupCopy({ 'urdu-mode': language === 'urdu' ? 'on' : 'off' });
  return [
  '<section class="learning-control" aria-labelledby="' + id + '-label">',
  '<h2 id="' + id + '-label">' + label + '</h2>',
  '<p>' + description + '</p>',
  '<div class="preference-options" style="--option-count:' + choices.length + '" role="group" aria-label="' + label + '">',
  choices.map(([value, choiceLabel]) => '<button type="button" data-preference="' + id + '" data-value="' + value + '" aria-pressed="' + String(selected === value) + '"' + (mascotUnavailable ? ' disabled' : '') + '>' + choiceLabel + '</button>').join(''),
  '</div>',
  mascotUnavailable ? '<small class="learning-control-unavailable" role="status">' + copy.mascotUnavailable + '</small>' : '',
  '</section>'
].join('');
};

const noiseVolume = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(35, Math.max(0, Math.round(number))) : 15;
};

const noiseType = (value) => ['pink', 'white', 'brown'].includes(value) ? value : 'pink';
const noiseTypeLabel = (value) => noiseType(value)[0].toUpperCase() + noiseType(value).slice(1);

const setBackgroundNoisePreviewStatus = (message) => {
  const status = document.querySelector('[data-background-noise-preview-status]');
  if (status) status.textContent = message;
};

const stopBackgroundNoisePreview = () => {
  backgroundNoisePreview.playRequest += 1;
  if (backgroundNoisePreview.fadeFrame) window.cancelAnimationFrame(backgroundNoisePreview.fadeFrame);
  backgroundNoisePreview.fadeFrame = null;
  if (backgroundNoisePreview.audio) backgroundNoisePreview.audio.pause();
  backgroundNoisePreview.playing = false;
};

const prepareBackgroundNoisePreview = (type, volume) => {
  const safeType = noiseType(type);
  const source = backgroundNoiseSources[safeType];
  const targetVolume = Math.min(.35, Math.max(0, noiseVolume(volume) / 100));
  if (backgroundNoisePreview.audio?.src?.endsWith(source)) {
    backgroundNoisePreview.type = safeType;
    backgroundNoisePreview.volume = targetVolume;
    return backgroundNoisePreview.audio;
  }
  stopBackgroundNoisePreview();
  const audio = new Audio(source);
  audio.loop = true;
  audio.preload = 'auto';
  audio.playsInline = true;
  audio.volume = 0;
  audio.load();
  backgroundNoisePreview.audio = audio;
  backgroundNoisePreview.type = safeType;
  backgroundNoisePreview.volume = targetVolume;
  return audio;
};

const startBackgroundNoisePreview = (choices) => {
  const type = noiseType(choices['background-noise-type']);
  const volume = noiseVolume(choices['background-noise-volume']);
  const audio = prepareBackgroundNoisePreview(type, volume);
  if (!audio) return;
  const request = ++backgroundNoisePreview.playRequest;
  if (backgroundNoisePreview.fadeFrame) window.cancelAnimationFrame(backgroundNoisePreview.fadeFrame);
  backgroundNoisePreview.fadeFrame = null;
  audio.volume = 0;
  audio.muted = false;
  setBackgroundNoisePreviewStatus('Starting ' + noiseTypeLabel(type) + ' noise at ' + volume + '% volume.');
  audio.play().then(() => {
    if (request !== backgroundNoisePreview.playRequest || audio !== backgroundNoisePreview.audio) {
      audio.pause();
      return;
    }
    backgroundNoisePreview.playing = true;
    const startedAt = window.performance.now();
    const fadeIn = (timestamp) => {
      if (!backgroundNoisePreview.playing || request !== backgroundNoisePreview.playRequest || audio !== backgroundNoisePreview.audio) return;
      const progress = Math.min(1, (timestamp - startedAt) / 420);
      audio.volume = backgroundNoisePreview.volume * progress;
      if (progress < 1) backgroundNoisePreview.fadeFrame = window.requestAnimationFrame(fadeIn);
      else backgroundNoisePreview.fadeFrame = null;
    };
    backgroundNoisePreview.fadeFrame = window.requestAnimationFrame(fadeIn);
    setBackgroundNoisePreviewStatus('Playing ' + noiseTypeLabel(type) + ' noise at ' + volume + '% volume. Choose Off to pause it.');
  }).catch(() => {
    if (request !== backgroundNoisePreview.playRequest || audio !== backgroundNoisePreview.audio) return;
    backgroundNoisePreview.playing = false;
    setBackgroundNoisePreviewStatus('Unable to start ' + noiseTypeLabel(type) + ' noise. Select the sound once more to retry.');
  });
};

const backgroundNoiseMarkup = (choices) => {
  if (choices['background-noise'] !== 'on') return '';
  const copy = setupCopy(choices);
  const volume = noiseVolume(choices['background-noise-volume']);
  const selectedType = ['pink', 'white', 'brown'].includes(choices['background-noise-type'])
    ? choices['background-noise-type']
    : 'pink';
  return [
    '<section class="learning-control learning-noise-details" aria-labelledby="background-noise-options-label">',
    '<h2 id="background-noise-options-label">' + copy.noiseType + '</h2>',
    '<p>' + copy.noiseDescription + '</p>',
    '<div class="preference-options" style="--option-count:3" role="group" aria-label="' + copy.noiseType + '">',
    ['pink', 'white', 'brown'].map((type) => '<button type="button" data-background-noise-type="' + type + '" aria-pressed="' + String(type === selectedType) + '">' + (setupLanguage(choices) === 'urdu' ? ({ pink: 'گلابی', white: 'سفید', brown: 'بھوری' }[type]) : type[0].toUpperCase() + type.slice(1)) + '</button>').join(''),
    '</div>',
    '<label class="noise-volume-control" for="background-noise-volume">',
    '<span>' + copy.volume + ' <strong data-background-noise-volume-output>' + volume + '%</strong></span>',
    '<input id="background-noise-volume" type="range" min="0" max="35" step="1" value="' + volume + '" style="--noise-volume-fill:' + ((volume / 35) * 100).toFixed(2) + '%" data-background-noise-volume aria-describedby="background-noise-volume-help">',
    '</label>',
    '<small id="background-noise-volume-help">' + copy.quietStart + '</small>',
    '<span class="noise-preview-status" data-background-noise-preview-status aria-live="polite">' + (backgroundNoisePreview.playing ? copy.playing + ' ' + noiseTypeLabel(selectedType) + ' · ' + volume + '%' : copy.selectNoise + ' ' + volume + '%') + '</span>',
    '</section>'
  ].join('');
};

const controlById = (id) => preferenceControls.find((control) => control.id === id);

const mascotDialogue = (choices) => {
  const language = choices['mascot-language'] || setupLanguage(choices);
  return language === 'urdu'
    ? 'السلام علیکم! میں آپ کے ساتھ ایک وقت میں ایک انتخاب پر رہوں گا۔'
    : 'Hi! I can stay with you while you choose one setting at a time.';
};

const mascotRailMarkup = (choices) => {
  if (choices.mascot !== 'on') return '';
  if (!mascotScreenIsSupported()) return '';
  const language = choices['mascot-language'] || setupLanguage(choices);
  return '<aside class="learning-setup-mascot-rail" data-learning-mascot><div class="learning-mascot-stage" data-learning-mascot-stage aria-hidden="true"></div><p class="learning-mascot-dialogue" lang="' + (language === 'urdu' ? 'ur' : 'en') + '" dir="' + (language === 'urdu' ? 'rtl' : 'ltr') + '">' + mascotDialogue(choices) + '</p></aside>';
};

const mascotLanguageControl = (choices) => controlMarkup({
  id: 'mascot-language',
  label: 'Mascot language',
  description: 'This starts with your learning language. You can choose a different one for the mascot.',
  choices: [['english', 'English'], ['urdu', 'اردو']]
}, choices['mascot-language'] || setupLanguage(choices), setupLanguage(choices));

const mascotSpeechControl = (choices) => controlMarkup({
  id: 'mascot-voice',
  label: 'Mascot Speech',
  description: 'Choose how your mascot will communicate with you.',
  choices: [['text', 'Text'], ['speech', 'Speech'], ['both', 'Both']]
}, choices['mascot-voice'], setupLanguage(choices));

const mascotVoiceControl = (choices) => controlMarkup({
  id: 'mascot-voice-language',
  label: 'Mascot voice',
  description: 'Choose the language your mascot will speak.',
  choices: [['english', 'English'], ['urdu', 'اردو']]
}, choices['mascot-voice-language'], setupLanguage(choices));

const mascotDetailsMarkup = (choices) => choices.mascot === 'on'
  ? '<div class="learning-mascot-details">' + mascotLanguageControl(choices) + mascotSpeechControl(choices) + mascotVoiceControl(choices) + '</div>'
  : '';

const setupLanguageAttributes = (choices) => setupLanguage(choices) === 'urdu' ? ' lang="ur" dir="rtl"' : '';
const mascotMainClass = (choices) => choices.mascot === 'on' && mascotScreenIsSupported() ? ' learn-main--with-mascot' : '';

const websiteSchemeOptions = (choices) => {
  const urdu = setupLanguage(choices) === 'urdu';
  const labels = urdu
    ? [['calm', 'پُرسکون'], ['playful', 'کھیل کود']]
    : [['calm', 'Calm'], ['playful', 'Playful']];
  return labels.map(([value, label]) => '<button type="button" data-preference="website-scheme" data-value="' + value + '" aria-pressed="' + String(choices['website-scheme'] === value) + '">' + label + '</button>').join('');
};

const schemeStageMarkup = (choices) => [
  '<main class="learn-main learn-main--single learn-main--scheme" id="learn-main"' + setupLanguageAttributes(choices) + '>',
  '<section class="learning-single-setting learning-scheme-setting" aria-labelledby="learning-settings-title">',
  '<header class="learning-settings-header">',
  '<p>' + setupCopy(choices).welcome + '</p>',
  '<h1 id="learning-settings-title">' + setupCopy(choices).startingTitle + '</h1>',
  '<span>' + setupCopy(choices).startingIntro + '</span>',
  '</header>',
  '<div class="learning-scheme-options">',
  '<section class="learning-control" aria-labelledby="website-scheme-label"><h2 id="website-scheme-label">' + setupCopy(choices).startingLabel + '</h2><p>' + setupCopy(choices).startingDescription + '</p><div class="preference-options" style="--option-count:2" role="group" aria-label="' + setupCopy(choices).startingLabel + '">' + websiteSchemeOptions(choices) + '</div></section>',
  '</div>',
  '<div class="learning-settings-action"><button class="learning-continue" type="button" data-advance-setup="scheme">' + setupCopy(choices).useLanguage + ' <span aria-hidden="true">→</span></button></div>',
  '</section>',
  '</main>'
].join('');

const focusedSteps = (choices) => {
  const steps = [
    { id: 'layout' },
    { id: 'colours' },
    { id: 'encouragement' },
    { id: 'animations' },
    { id: 'background-noise' }
  ];
  if (choices['background-noise'] === 'on') steps.push({ id: 'noise-details' });
  steps.push({ id: 'text-to-speech' }, { id: 'urdu-mode' }, { id: 'mascot' });
  if (choices.mascot === 'on') steps.push({ id: 'mascot-language' }, { id: 'mascot-voice' }, { id: 'mascot-voice-language' });
  return steps;
};

const focusedStepContent = (step, choices) => {
  if (step.id === 'noise-details') return backgroundNoiseMarkup(choices);
  if (step.id === 'mascot-language') return mascotLanguageControl(choices);
  if (step.id === 'mascot-voice') return mascotSpeechControl(choices);
  if (step.id === 'mascot-voice-language') return mascotVoiceControl(choices);
  return controlMarkup(controlById(step.id), choices[step.id], setupLanguage(choices));
};

const focusedStageMarkup = (choices) => {
  const copy = setupCopy(choices);
  const steps = focusedSteps(choices);
  const step = steps[Math.min(focusedStepIndex, steps.length - 1)];
  const last = focusedStepIndex >= steps.length - 1;
  const backLabel = focusedStepIndex === 0
    ? (setupLanguage(choices) === 'urdu' ? 'ویب سائٹ کی پیشکش پر واپس' : 'Back to website scheme')
    : (setupLanguage(choices) === 'urdu' ? 'واپس' : 'Back');
  return [
    '<main class="learn-main learn-main--focused' + mascotMainClass(choices) + '" id="learn-main"' + setupLanguageAttributes(choices) + '>',
    '<section class="learning-focused-settings" aria-labelledby="learning-settings-title">',
    '<header class="learning-settings-header">',
    '<p>' + copy.focused + '</p>',
    '<h1 id="learning-settings-title">' + copy.title + '</h1>',
    '<span>' + copy.focusedIntro + '</span>',
    '<small class="learning-settings-later">' + copy.laterSettings + '</small>',
    '</header>',
    '<article class="learning-setting-chit learning-setting-chit--focused">',
    focusedStepContent(step, choices),
    '</article>',
    '<div class="learning-settings-action learning-settings-action--split"><button class="learning-back" type="button" data-go-back="focused">' + backLabel + '</button><button class="learning-continue" type="button" data-advance-setup="focused">' + (last ? copy.course : copy.keep) + ' <span aria-hidden="true">→</span></button></div>',
    '</section>',
    mascotRailMarkup(choices),
    '</main>'
  ].join('');
};

const balancedStageMarkup = (choices) => {
  const copy = setupCopy(choices);
  return [
  '<main class="learn-main' + mascotMainClass(choices) + '" id="learn-main"' + setupLanguageAttributes(choices) + '>',
  '<section class="learning-settings" aria-labelledby="learning-settings-title">',
  '<header class="learning-settings-header">',
  '<p>' + copy.preferences + '</p>',
  '<h1 id="learning-settings-title">' + copy.title + '</h1>',
  '<span>' + copy.balancedIntro + '</span>',
  '<small class="learning-settings-later">' + copy.laterSettings + '</small>',
  '</header>',
  '<div class="learning-control-list" aria-label="' + copy.preferences + '">',
  preferenceControls.map((control) => controlMarkup(control, choices[control.id], setupLanguage(choices)) + (control.id === 'background-noise' ? backgroundNoiseMarkup(choices) : '') + (control.id === 'mascot' ? mascotDetailsMarkup(choices) : '')).join(''),
  '</div>',
  '<div class="learning-settings-action learning-settings-action--split"><button class="learning-back" type="button" data-go-back="scheme">' + (setupLanguage(choices) === 'urdu' ? 'ویب سائٹ کی پیشکش پر واپس' : 'Back to website scheme') + '</button><button class="learning-continue" type="button" data-save-preferences>' + copy.continue + ' <span aria-hidden="true">→</span></button></div>',
  '</section>',
  mascotRailMarkup(choices),
  '</main>'
].join('');
};

const openControlRowMarkup = (control, choices) => '<article class="learning-open-row">'
  + controlMarkup(control, choices[control.id], setupLanguage(choices))
  + (control.id === 'background-noise' ? backgroundNoiseMarkup(choices) : '')
  + (control.id === 'mascot' ? mascotDetailsMarkup(choices) : '')
  + '</article>';

const openStageMarkup = (choices) => {
  const copy = setupCopy(choices);
  return [
    '<main class="learn-main learn-main--open' + mascotMainClass(choices) + '" id="learn-main"' + setupLanguageAttributes(choices) + '>',
    '<section class="learning-settings learning-settings--open" aria-labelledby="learning-settings-title">',
    '<header class="learning-settings-header">',
    '<p>' + copy.preferences + '</p>',
    '<h1 id="learning-settings-title">' + copy.title + '</h1>',
    '<span>' + copy.openIntro + '</span>',
    '<small class="learning-settings-later">' + copy.laterSettings + '</small>',
    '</header>',
    '<div class="learning-control-list learning-control-list--open" aria-label="' + copy.preferences + '">',
    preferenceControls.map((control) => openControlRowMarkup(control, choices)).join(''),
    '</div>',
    '<div class="learning-settings-action learning-settings-action--split"><button class="learning-back" type="button" data-go-back="scheme">' + (setupLanguage(choices) === 'urdu' ? 'ویب سائٹ کی پیشکش پر واپس' : 'Back to website scheme') + '</button><button class="learning-continue" type="button" data-save-preferences>' + copy.continue + ' <span aria-hidden="true">→</span></button></div>',
    '</section>',
    mascotRailMarkup(choices),
    '</main>'
  ].join('');
};

const mainContent = (choices) => {
  if (setupStage === 'scheme') return schemeStageMarkup(choices);
  if (setupStage === 'focused') return focusedStageMarkup(choices);
  if (choices.layout === 'open') return openStageMarkup(choices);
  return balancedStageMarkup(choices);
};

const syncMascotPreview = (choices) => {
  const stage = app.querySelector('[data-learning-mascot-stage]');
  if (choices.mascot !== 'on' || !stage || !mascotScreenIsSupported()) {
    mascotPreview?.unmount?.();
    return;
  }
  if (!mascotPreviewLoad) {
    // 3D rollback reference: restore this former loader to reinstate the
    // preserved 3D preview implementation.
    // mascotPreviewLoad = import('/course/mascot-3d.js?v=20260801-settingsmenu6')
    //   .then(({ createCourseMascot }) => {
    //     mascotPreview = createCourseMascot();
    //     return mascotPreview;
    //   })
    //   .catch(() => null);
    mascotPreviewLoad = import(mascotModuleUrl)
      .then(({ createCourseMascot }) => {
        mascotPreview = createCourseMascot();
        return mascotPreview;
      })
      .catch(() => null);
  }
  mascotPreviewLoad.then((mascot) => {
    if (!mascot || !stage.isConnected || stage !== app.querySelector('[data-learning-mascot-stage]') || choices.mascot !== 'on') return;
    mascot.mount(stage, {
      encouragement: choices.encouragement,
      animations: choices.animations,
      scene: 'dashboard',
      location: 'dashboard'
    });
    mascot.present('dashboard');
  });
};

const effectiveSetupAnimation = (choices) => {
  if (choices.animations === 'still' || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return 'still';
  if (window.matchMedia?.('(max-width: 767px)')?.matches) return 'gentle';
  return choices.animations === 'lively' ? 'lively' : 'gentle';
};

const applySetupPresentation = (choices) => {
  document.body.dataset.setupAnimations = effectiveSetupAnimation(choices);
  document.body.dataset.setupEncouragement = ['subtle', 'balanced', 'expressive'].includes(choices.encouragement)
    ? choices.encouragement
    : 'subtle';
};

const launchSetupControlMotion = (control, event, choices, routeChange = false) => {
  const level = effectiveSetupAnimation(choices);
  if (!control || level === 'still' || control.matches(':disabled, [aria-disabled="true"]')) return;
  const rect = control.getBoundingClientRect();
  const x = Number(event?.clientX) > 0 ? event.clientX : rect.left + rect.width / 2;
  const y = Number(event?.clientY) > 0 ? event.clientY : rect.top + rect.height / 2;
  const echo = document.createElement('span');
  echo.className = 'learning-action-echo learning-action-echo--' + level;
  echo.dataset.setupMotion = String(++setupMotionSequence);
  echo.setAttribute('aria-hidden', 'true');
  echo.style.setProperty('--setup-action-x', x + 'px');
  echo.style.setProperty('--setup-action-y', y + 'px');
  echo.innerHTML = level === 'lively' ? '<i></i><i></i><i></i>' : '<i></i>';
  document.body.append(echo);
  window.setTimeout(() => echo.remove(), level === 'lively' ? 720 : 380);
  if (level !== 'lively' || !routeChange) return;
  const sweep = document.createElement('span');
  sweep.className = 'learning-stage-sweep';
  sweep.setAttribute('aria-hidden', 'true');
  document.body.append(sweep);
  window.setTimeout(() => sweep.remove(), 700);
};

const showSetupFeedback = (kind, choices) => {
  document.querySelectorAll('.learning-encouragement-popup').forEach((node) => node.remove());
  window.clearTimeout(setupFeedbackTimer);
  const encouragement = choices.encouragement || 'subtle';
  if (encouragement === 'subtle') return;
  const urdu = setupLanguage(choices) === 'urdu';
  const copy = kind === 'animations'
    ? (urdu
      ? (choices.animations === 'lively' ? ['چلیں، آگے بڑھتے ہیں!', 'اگلے انتخاب واضح اور پُرجوش حرکت کے ساتھ سامنے آئیں گے۔'] : ['آرام سے آگے بڑھیں', 'اگلا انتخاب نرم حرکت کے ساتھ سامنے آئے گا۔'])
      : (choices.animations === 'lively' ? ["Let's keep moving!", 'Your next choices will respond with clear, energetic motion.'] : ['Take the next step smoothly', 'Your next choice will arrive with a gentle transition.']))
    : (urdu
      ? (encouragement === 'expressive' ? ['آپ بہت اچھا کر رہے ہیں!', 'ہر کامیاب قدم کو واضح طور پر سراہا جائے گا۔'] : ['آپ اچھا کر رہے ہیں', 'ایک وقت میں ایک واضح قدم۔'])
      : (encouragement === 'expressive' ? ['You are doing amazing!', 'Every successful step will be celebrated clearly.'] : ['You are doing well', 'One clear step at a time.']));
  const popup = document.createElement('section');
  popup.className = 'learning-encouragement-popup learning-encouragement-popup--' + encouragement;
  popup.setAttribute('role', 'status');
  popup.setAttribute('aria-live', 'polite');
  if (urdu) {
    popup.lang = 'ur';
    popup.dir = 'rtl';
  }
  const symbol = document.createElement('span');
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = '♥';
  const text = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = copy[0];
  const detail = document.createElement('p');
  detail.textContent = copy[1];
  const progress = document.createElement('i');
  progress.setAttribute('aria-hidden', 'true');
  text.append(title, detail);
  popup.append(symbol, text, progress);
  document.body.append(popup);
  setupFeedbackTimer = window.setTimeout(() => {
    if (effectiveSetupAnimation(choices) === 'still') popup.remove();
    else {
      popup.classList.add('is-leaving');
      window.setTimeout(() => popup.remove(), 320);
    }
  }, 4700);
};

const render = (choices) => {
  applySetupPresentation(choices);
  app.innerHTML = mainContent(choices);
  app.querySelector('#learn-main')?.classList.add('is-learning-stage-entering');
  syncMascotPreview(choices);
};

const updateChoiceUi = (controlId, value) => {
  document.querySelectorAll('[data-preference="' + controlId + '"]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.value === value));
  });
};

const updateNoiseVolumeUi = (value) => {
  const output = document.querySelector('[data-background-noise-volume-output]');
  if (output) output.textContent = noiseVolume(value) + '%';
  const input = document.querySelector('[data-background-noise-volume]');
  if (input) input.style.setProperty('--noise-volume-fill', ((noiseVolume(value) / 35) * 100).toFixed(2) + '%');
};

const boot = async () => {
  if (!supportedCourseIds.has(selectedCourseId)) {
    window.location.replace('/course/');
    return;
  }

  let user = getType2LearnGuest();
  if (!user) {
    try {
      const { waitForType2LearnUser } = await import('/firebase-auth.js?v=20260801-courseflow1');
      user = await waitForType2LearnUser();
    } catch (_) {
      user = null;
    }
  }

  if (!user) {
    window.location.replace('/login/?next=' + encodeURIComponent('/afterlogin/?course=' + encodeURIComponent(selectedCourseId)));
    return;
  }

  const saved = readPreferences(user, selectedCourseId);
  const savedChoices = saved?.choices || {};
  // Preserve an earlier language choice as a one-time migration to the now
  // functional Urdu mode switch. New saves no longer use learning-language.
  const normaliseWebsiteScheme = (value) => value === 'balanced'
    ? 'calm'
    : ['calm', 'playful'].includes(value) ? value : '';
  const savedWebsiteScheme = normaliseWebsiteScheme(savedChoices['website-scheme']);
  const isLegacyLanguagePreference = !savedWebsiteScheme;
  const migratedUrduMode = isLegacyLanguagePreference && savedChoices['learning-language'] === 'urdu'
    ? 'on'
    : savedChoices['urdu-mode'] === 'on'
    ? 'on'
    : savedChoices['urdu-mode'] === 'off'
      ? 'off'
      : 'off';
  const savedScheme = savedWebsiteScheme || window.Type2LearnWebsiteScheme?.get?.() || 'calm';
  const choices = {
    ...defaultChoices,
    colours: window.Type2LearnColorMode?.get?.() || 'balanced',
    ...savedChoices,
    'urdu-mode': migratedUrduMode,
    'website-scheme': savedScheme
  };
  // Do not keep or prefetch the optional 3D companion on a small screen.
  if (!mascotScreenIsSupported()) choices.mascot = 'off';
  window.Type2LearnColorMode?.set(choices.colours, false);
  window.Type2LearnWebsiteScheme?.set(choices['website-scheme'], false);
  render(choices);

  const mascotScreenQuery = window.matchMedia?.('(min-width: 1181px)');
  mascotScreenQuery?.addEventListener?.('change', (event) => {
    if (!event.matches && choices.mascot === 'on') choices.mascot = 'off';
    render(choices);
  });

  app.addEventListener('click', (event) => {
    const motionControl = event.target.closest('button, .preference-options button');
    if (motionControl) {
      const routeChange = Boolean(motionControl.matches('[data-advance-setup], [data-go-back], [data-save-preferences]'));
      launchSetupControlMotion(motionControl, event, choices, routeChange);
    }
    const preferenceButton = event.target.closest('[data-preference]');
    if (preferenceButton) {
      const { preference, value } = preferenceButton.dataset;
      const previousValue = choices[preference];
      choices[preference] = value;
      applySetupPresentation(choices);
      if (preference === 'urdu-mode' && !mascotLanguageExplicitlyChosen) choices['mascot-language'] = value === 'on' ? 'urdu' : 'english';
      if (preference === 'mascot-language') {
        mascotLanguageExplicitlyChosen = true;
        choices['mascot-language-explicit'] = true;
      }
      if (preference === 'colours') window.Type2LearnColorMode?.set(value);
      if (preference === 'website-scheme') window.Type2LearnWebsiteScheme?.set(value);
      if (preference === 'urdu-mode') {
        // Urdu mode updates direction and setup copy immediately. The English
        // typing target remains a later course-level exception.
        render(choices);
        return;
      }
      if (preference === 'layout') {
        if (setupStage === 'balanced') {
          if (value === 'focused') {
            layoutBeforeFocused = ['balanced', 'open'].includes(previousValue) ? previousValue : 'balanced';
            setupStage = 'focused';
            focusedStepIndex = 0;
          }
          render(choices);
          return;
        }
        if (setupStage === 'focused' && value !== 'focused') {
          setupStage = 'balanced';
          render(choices);
          return;
        }
      }
      if (preference === 'background-noise') {
        if (value === 'on') startBackgroundNoisePreview(choices);
        else stopBackgroundNoisePreview();
        render(choices);
        return;
      }
      if (preference === 'mascot' && value === 'on') {
        warmMascotAssets();
        render(choices);
        return;
      }
      if (preference === 'mascot' && value === 'off') {
        releaseMascotAssets();
        render(choices);
        return;
      }
      if (preference === 'mascot' || (preference === 'animations' && choices.mascot === 'on') || (preference === 'mascot-language' && choices.mascot === 'on')) {
        render(choices);
        if (preference === 'animations') showSetupFeedback('animations', choices);
        return;
      }
      updateChoiceUi(preference, value);
      if (preference === 'encouragement' || preference === 'animations') showSetupFeedback(preference, choices);
      return;
    }

    const noiseTypeButton = event.target.closest('[data-background-noise-type]');
    if (noiseTypeButton) {
      choices['background-noise-type'] = noiseTypeButton.dataset.backgroundNoiseType;
      document.querySelectorAll('[data-background-noise-type]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button === noiseTypeButton));
      });
      if (choices['background-noise'] === 'on') startBackgroundNoisePreview(choices);
      return;
    }

    if (event.target.closest('[data-save-preferences]')) {
      savePreferences(user, selectedCourseId, choices);
      window.Type2LearnWebsiteScheme?.set(choices['website-scheme']);
      if (choices.mascot !== 'on') releaseMascotAssets();
      window.location.assign('/course/?course=' + encodeURIComponent(selectedCourseId) + '&start=course');
    }

    const back = event.target.closest('[data-go-back]');
    if (back) {
      if (back.dataset.goBack === 'scheme') {
        setupStage = 'scheme';
      } else if (back.dataset.goBack === 'focused') {
        if (focusedStepIndex > 0) focusedStepIndex -= 1;
        else {
          choices.layout = layoutBeforeFocused;
          setupStage = 'scheme';
        }
      }
      render(choices);
      return;
    }

    const advance = event.target.closest('[data-advance-setup]');
    if (advance) {
      const stage = advance.dataset.advanceSetup;
      if (stage === 'scheme') {
        warmMascotAssets();
        setupStage = 'balanced';
        render(choices);
        return;
      }
      if (stage === 'focused') {
        const steps = focusedSteps(choices);
        if (focusedStepIndex >= steps.length - 1) {
          savePreferences(user, selectedCourseId, choices);
          window.location.assign('/course/?course=' + encodeURIComponent(selectedCourseId) + '&start=course');
          return;
        }
        focusedStepIndex += 1;
        render(choices);
      }
    }
  });

  app.addEventListener('input', (event) => {
    if (!event.target.matches('[data-background-noise-volume]')) return;
    choices['background-noise-volume'] = String(noiseVolume(event.target.value));
    updateNoiseVolumeUi(choices['background-noise-volume']);
    backgroundNoisePreview.volume = Math.min(.35, noiseVolume(choices['background-noise-volume']) / 100);
    if (backgroundNoisePreview.audio) backgroundNoisePreview.audio.volume = backgroundNoisePreview.volume;
  });

  window.addEventListener('pagehide', () => {
    stopBackgroundNoisePreview();
    if (choices.mascot === 'on') mascotPreview?.destroy?.();
    else releaseMascotAssets();
  }, { once: true });
};

boot();
