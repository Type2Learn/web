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

  '<div class="learn-actions">',
  '<a class="learn-action is-primary" href="#next-step"><i aria-hidden="true"></i> See the next step</a>',
  '<a class="learn-action" href="/pathways/"><i aria-hidden="true"></i> Explore pathways</a>',
  '</div>',
  '</div>',
  '<div class="welcome-visual" aria-hidden="true">',
  '<div class="learning-card-stack">',
  '<article class="learning-card"><strong>Read or hear.</strong><span>Meet one bounded idea with the objective visible.</span><small>01 Encounter</small></article>',
  '<article class="learning-card"><strong>Recall and type.</strong><span>Make thinking visible before the model answer appears.</span><small>02 Produce</small></article>',
  '<article class="learning-card"><strong>Correct, apply, return.</strong><span>Keep progress through useful evidence, not speed.</span><small>03 Keep</small></article>',
  '</div>',
  '</div>',
  '</div>',
  '</section>',
  '<section class="learn-panel-grid" aria-label="Learning home summary">',
  '<article class="learn-panel" id="next-step"><span class="metric-dot" aria-hidden="true"></span><h2>Start with one task.</h2><p>The first imported course screen will appear here. It should show one active action, a completion condition, and an accessible way to pause.</p></article>',
  '<article class="learn-panel" id="supports"><span class="metric-dot" aria-hidden="true"></span><h2>Keep supports private.</h2><p>Motion, spacing, audio, literal help, and pacing controls belong to the learner. They are not a diagnosis or a public score.</p></article>',
  '<article class="learn-panel" id="progress"><span class="metric-dot" aria-hidden="true"></span><h2>Save useful evidence.</h2><p>This shell is ready for resume state, corrections, application work, and return review once the lesson engine is connected.</p></article>',
  '</section>',
  '</main>'
].join('');

const render = (user) => {
  app.innerHTML = '<div class="learn-app" data-learn-app>' + sidebar(user) + mainContent(user) + '</div>';
};

const setupSidebarAutoHide = () => {
  const shell = document.querySelector('[data-learn-app]');
  const sidebarElement = document.querySelector('[data-learn-sidebar]');
  const reveal = document.querySelector('[data-sidebar-reveal]');
  const toggle = document.querySelector('[data-auto-hide-toggle]');
  if (!shell || !sidebarElement || !reveal || !toggle) return;

  let autoHide = readAutoHide();
  let hidden = false;
  let hideTimer = 0;
  let revealTimer = 0;
  let insideSidebar = false;
  let pointerDown = false;
  let pointer = { x: 9999, y: 9999 };
  let outsideClicks = 0;
  let outsideTimer = 0;

  const enabled = () => autoHide && desktopQuery.matches && !reducedMotionQuery.matches;
  const clearHide = () => window.clearTimeout(hideTimer);
  const clearReveal = () => window.clearTimeout(revealTimer);
  const clearOutside = () => {
    outsideClicks = 0;
    window.clearTimeout(outsideTimer);
  };
  const apply = () => {
    shell.classList.toggle('is-sidebar-hidden', enabled() && hidden);
    reveal.classList.toggle('is-active', enabled() && hidden);
    toggle.setAttribute('aria-pressed', String(autoHide));
    toggle.querySelector('span:last-child').textContent = autoHide ? 'On' : 'Off';
  };
  const scheduleHide = (delay = 8500) => {
    clearHide();
    if (!enabled() || insideSidebar) return;
    hideTimer = window.setTimeout(() => {
      hidden = true;
      apply();
    }, delay);
  };
  const show = () => {
    clearReveal();
    hidden = false;
    clearOutside();
    apply();
    scheduleHide();
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
