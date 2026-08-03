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
const mascotModelUrl = '/assets/mascot/type2learn-companion.glb';
let mascotAssetsWarmed = false;
let mascotPreview = null;
let mascotPreviewLoad = null;
let setupStage = 'language';
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
  { id: 'mascot', label: 'Mascot', description: 'A learning companion when you want one.', choices: [['off', 'Off'], ['on', 'On']] }
];

const defaultChoices = {
  ...Object.fromEntries(preferenceControls.map(({ id, choices }) => [id, id === 'colours' || id === 'layout' ? 'balanced' : id === 'animations' ? 'gentle' : choices[0][0]])),
  'learning-language': 'english',
  'mascot-language': 'english',
  'mascot-language-explicit': false,
  'mascot-voice': 'text',
  'mascot-behaviour': 'calm',
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
    ['modulepreload', '/vendor/three.module.min.js'],
    ['modulepreload', '/vendor/GLTFLoader.js'],
    ['modulepreload', '/vendor/BufferGeometryUtils.js'],
    ['modulepreload', '/vendor/SkeletonUtils.js'],
    ['preload', mascotModelUrl]
  ].forEach(([rel, href]) => {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    if (rel === 'preload') {
      link.as = 'fetch';
      link.type = 'model/gltf-binary';
      link.crossOrigin = 'anonymous';
    }
    document.head.append(link);
  });
  // The model keeps every animation in one local GLB. Warming this opt-in
  // request before Continue means no individual animation needs to buffer in
  // the course.
  window.fetch?.(mascotModelUrl, { cache: 'force-cache' }).catch(() => {});
};

const setupLanguage = (choices) => choices['learning-language'] === 'urdu' ? 'urdu' : 'english';

const setupCopy = (choices) => setupLanguage(choices) === 'urdu' ? {
  welcome: 'خوش آمدید',
  startingTitle: 'اپنی ابتدائی زبان منتخب کریں۔',
  startingIntro: 'میسکاٹ اس زبان میں شروع ہوگا۔ آپ بعد میں میسکاٹ کے لیے دوسری زبان منتخب کر سکتے ہیں۔',
  startingLabel: 'ابتدائی زبان',
  startingDescription: 'وہ زبان منتخب کریں جو آپ کے میسکاٹ کے لیے بطور ڈیفالٹ استعمال ہو۔',
  useLanguage: 'یہ زبان استعمال کریں',
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
  startingTitle: 'Choose your starting language.',
  startingIntro: 'Your mascot will begin in this language. You can choose a different mascot language later.',
  startingLabel: 'Starting language',
  startingDescription: 'Choose the language your mascot will use by default.',
  useLanguage: 'Use this language',
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
    mascot: { label: 'میسکاٹ', description: 'جب آپ چاہیں ایک سیکھنے والا ساتھی۔', choices: [['off', 'بند'], ['on', 'چالو']] },
    'mascot-language': { label: 'میسکاٹ کی زبان', description: 'یہ آپ کی ابتدائی زبان کے ساتھ شروع ہوتی ہے۔ آپ میسکاٹ کے لیے الگ زبان منتخب کر سکتے ہیں۔', choices: [['english', 'انگریزی'], ['urdu', 'اردو']] },
    'mascot-voice': { label: 'میسکاٹ کی آواز', description: 'جب آواز کے اختیارات منسلک ہوں تو میسکاٹ کا رابطہ منتخب کریں۔', choices: [['text', 'متن'], ['speech', 'آواز'], ['both', 'دونوں']] },
    'mascot-behaviour': { label: 'میسکاٹ کا انداز', description: 'وہ موجودگی منتخب کریں جو آرام دہ محسوس ہو۔', choices: [['low-key', 'پُرسکون'], ['calm', 'نرم'], ['energetic', 'پرجوش']] }
  }
};

const localizedControl = (control, language) => localizedControls[language]?.[control.id]
  ? { ...control, ...localizedControls[language][control.id] }
  : control;

const controlMarkup = (originalControl, selected, language = 'english') => {
  const { id, label, description, choices } = localizedControl(originalControl, language);
  const mascotUnavailable = id === 'mascot' && !mascotScreenIsSupported();
  const copy = setupCopy({ 'learning-language': language });
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
  const language = choices['mascot-language'] || choices['learning-language'];
  return language === 'urdu'
    ? 'السلام علیکم! میں آپ کے ساتھ ایک وقت میں ایک انتخاب پر رہوں گا۔'
    : 'Hi! I can stay with you while you choose one setting at a time.';
};

const mascotRailMarkup = (choices) => {
  if (choices.mascot !== 'on') return '';
  if (!mascotScreenIsSupported()) return '';
  const language = choices['mascot-language'] || choices['learning-language'];
  return '<aside class="learning-setup-mascot-rail" data-learning-mascot><div class="learning-mascot-stage" data-learning-mascot-stage aria-hidden="true"></div><p class="learning-mascot-dialogue" lang="' + (language === 'urdu' ? 'ur' : 'en') + '" dir="' + (language === 'urdu' ? 'rtl' : 'ltr') + '">' + mascotDialogue(choices) + '</p></aside>';
};

const mascotLanguageControl = (choices) => controlMarkup({
  id: 'mascot-language',
  label: 'Mascot language',
  description: 'This starts with your learning language. You can choose a different one for the mascot.',
  choices: [['english', 'English'], ['urdu', 'اردو']]
}, choices['mascot-language'] || choices['learning-language'], setupLanguage(choices));

const mascotVoiceControl = (choices) => controlMarkup({
  id: 'mascot-voice',
  label: 'Mascot voice',
  description: 'Choose how the mascot will communicate when voice options are connected.',
  choices: [['text', 'Text'], ['speech', 'Speech'], ['both', 'Both']]
}, choices['mascot-voice'], setupLanguage(choices));

const mascotBehaviourControl = (choices) => controlMarkup({
  id: 'mascot-behaviour',
  label: 'Mascot behaviour',
  description: 'Choose the kind of presence that feels comfortable.',
  choices: [['low-key', 'Low-key'], ['calm', 'Calm'], ['energetic', 'Energetic']]
}, choices['mascot-behaviour'], setupLanguage(choices));

const mascotDetailsMarkup = (choices) => choices.mascot === 'on'
  ? '<div class="learning-mascot-details">' + mascotLanguageControl(choices) + mascotVoiceControl(choices) + mascotBehaviourControl(choices) + '</div>'
  : '';

const setupLanguageAttributes = (choices) => setupLanguage(choices) === 'urdu' ? ' lang="ur" dir="rtl"' : '';
const mascotMainClass = (choices) => choices.mascot === 'on' && mascotScreenIsSupported() ? ' learn-main--with-mascot' : '';

const languageStageMarkup = (choices) => [
  '<main class="learn-main learn-main--single learn-main--language" id="learn-main"' + setupLanguageAttributes(choices) + '>',
  '<section class="learning-single-setting learning-language-setting" aria-labelledby="learning-settings-title">',
  '<header class="learning-settings-header">',
  '<p>' + setupCopy(choices).welcome + '</p>',
  '<h1 id="learning-settings-title">' + setupCopy(choices).startingTitle + '</h1>',
  '<span>' + setupCopy(choices).startingIntro + '</span>',
  '</header>',
  '<div class="learning-language-options">',
  '<section class="learning-control" aria-labelledby="learning-language-label"><h2 id="learning-language-label">' + setupCopy(choices).startingLabel + '</h2><p>' + setupCopy(choices).startingDescription + '</p><div class="preference-options" style="--option-count:2" role="group" aria-label="' + setupCopy(choices).startingLabel + '"><button type="button" data-preference="learning-language" data-value="english" aria-pressed="' + String(choices['learning-language'] === 'english') + '">English</button><button type="button" data-preference="learning-language" data-value="urdu" aria-pressed="' + String(choices['learning-language'] === 'urdu') + '" lang="ur" dir="rtl">اردو</button></div></section>',
  '</div>',
  '<div class="learning-settings-action"><button class="learning-continue" type="button" data-advance-setup="language">' + setupCopy(choices).useLanguage + ' <span aria-hidden="true">→</span></button></div>',
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
  steps.push({ id: 'text-to-speech' }, { id: 'mascot' });
  if (choices.mascot === 'on') steps.push({ id: 'mascot-language' }, { id: 'mascot-voice' }, { id: 'mascot-behaviour' });
  return steps;
};

const focusedStepContent = (step, choices) => {
  if (step.id === 'noise-details') return backgroundNoiseMarkup(choices);
  if (step.id === 'mascot-language') return mascotLanguageControl(choices);
  if (step.id === 'mascot-voice') return mascotVoiceControl(choices);
  if (step.id === 'mascot-behaviour') return mascotBehaviourControl(choices);
  return controlMarkup(controlById(step.id), choices[step.id], setupLanguage(choices));
};

const focusedStageMarkup = (choices) => {
  const copy = setupCopy(choices);
  const steps = focusedSteps(choices);
  const step = steps[Math.min(focusedStepIndex, steps.length - 1)];
  const last = focusedStepIndex >= steps.length - 1;
  const backLabel = focusedStepIndex === 0
    ? (setupLanguage(choices) === 'urdu' ? 'زبان پر واپس' : 'Back to language')
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
  };
  const scheduleReveal = () => {
    if (!enabled() || !hidden || pointerDown || revealTimer) return;
    revealTimer = window.setTimeout(show, 240);
  };

  toggle.addEventListener('click', () => {
    autoHide = !autoHide;
    writeAutoHide(autoHide);
    hidden = false;
    clearHide();
    clearReveal();
    clearOutside();
    apply();
    scheduleHide();
  });

  reveal.addEventListener('pointerenter', scheduleReveal, { passive: true });
  reveal.addEventListener('pointerleave', clearReveal, { passive: true });
  reveal.addEventListener('focus', scheduleReveal);
  reveal.addEventListener('blur', clearReveal);
  reveal.addEventListener('click', show);

  sidebarElement.addEventListener('pointerenter', () => {
    insideSidebar = true;
    clearHide();
    clearOutside();
  }, { passive: true });
  sidebarElement.addEventListener('pointerleave', () => {
    insideSidebar = false;
    scheduleHide();
  }, { passive: true });
  sidebarElement.addEventListener('focusin', () => {
    insideSidebar = true;
    clearHide();
  });
  sidebarElement.addEventListener('focusout', () => {
    insideSidebar = false;
    scheduleHide();
  });

  window.addEventListener('pointermove', (event) => {
    const previous = pointer;
    const dx = event.clientX - previous.x;
    const dy = Math.abs(event.clientY - previous.y);
    pointer = { x: event.clientX, y: event.clientY };
    if (!enabled() || !hidden || pointerDown) {
      clearReveal();
      return;
    }
    const safeY = event.clientY > 28 && event.clientY < window.innerHeight - 28;
    const hardEdge = event.clientX <= 10;
    const intentEdge = event.clientX <= 26 && dx < -0.7 && dy < 18;
    const edgeDwell = event.clientX <= 26 && Math.abs(dx) < 2.5 && dy < 10;
    if (safeY && (hardEdge || intentEdge || edgeDwell)) scheduleReveal();
    else if (event.clientX > 36) clearReveal();
  }, { passive: true });

  window.addEventListener('pointerdown', (event) => {
    pointerDown = true;
    clearReveal();
    if (!enabled() || hidden) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('[data-learn-sidebar], [data-sidebar-reveal]')) {
      clearOutside();
      return;
    }
    outsideClicks += 1;
    if (outsideClicks >= 2) {
      hidden = true;
      clearOutside();
      clearHide();
      apply();
      return;
    }
    window.clearTimeout(outsideTimer);
    outsideTimer = window.setTimeout(clearOutside, 2600);
  }, { passive: true });

  window.addEventListener('pointerup', () => {
    window.setTimeout(() => { pointerDown = false; }, 120);
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (!desktopQuery.matches) hidden = false;
    apply();
    scheduleHide();
  }, { passive: true });

  apply();
  scheduleHide();
};

const boot = async () => {
  let user = null;
  try {
    user = await waitForType2LearnUser();
  } catch (_) {
    user = null;
  }

  if (!user) {
    window.location.replace('/login/?next=%2Flearn%2F');
    return;
  }

  render(user);
  setupSidebarAutoHide();
  document.querySelector('[data-signout]')?.addEventListener('click', async () => {
    await signOutType2LearnUser();
    window.location.assign('/login/');
  });
  window.dispatchEvent(new CustomEvent('type2learn:companion-message', { detail: { event: 'learn-home' } }));
};

boot();
