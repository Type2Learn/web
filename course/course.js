import { COURSE_CONTENT } from './course-content.js';
import { COURSE_AUDIO_MANIFEST, COURSE_AUDIO_MODULE_KEYS } from './course-audio-manifest.js';
import { NarrationService } from './narration.js';
import { createSettingsState, getAvailableInputMethods, loadLearnerSettings, resolveSettings, saveLearnerSettings, setActiveInputMethod, setUserOverride } from './learner-settings.js?v=20260730-course1';
import { clearType2LearnGuest, getType2LearnGuest } from '/guest-session.js?v=20260731-guest1';

(() => {
  'use strict';

  const STORAGE_NAMESPACE = 'type2learn-course-prototype-v1';
  const COURSE_PREFERENCE_NAMESPACE = 'type2learn-course-preferences-v1:';
  const LEGACY_LEARNING_PREFERENCE_NAMESPACE = 'type2learn-learning-preferences-v1:';
  const app = document.getElementById('course-app');
  const liveRegion = document.getElementById('course-live-region');
  let storageKeys = { preferences: '', course: '', learnerId: '' };
  let authenticatedUser = null;
  const narration = { service: null, status: 'idle', activeIndex: -1, activeRange: null, chunks: [], voices: [], scrollFrame: null };
  const BACKGROUND_NOISE_SOURCES = {
    pink: '/assets/audio/background-noise/pink-noise-loop.mp3',
    white: '/assets/audio/background-noise/white-noise-loop.mp3',
    brown: '/assets/audio/background-noise/brown-noise-loop.mp3'
  };
  const BACKGROUND_NOISE_MAX_VOLUME = 0.35;
  const backgroundNoise = {
    audio: null,
    enabled: false,
    type: 'pink',
    volume: 0.12,
    isPlaying: false,
    fadeFrame: null,
    settleTimer: null
  };
  // The optional 3D companion is deliberately lazy-loaded. On smaller
  // screens—or when it is switched off—the model, texture, Three.js, and
  // animation loader are never requested.
  let courseMascot = null;
  let mascotControllerLoad = null;
  let mascotPresentation = { enabled: false, encouragement: 'balanced', language: 'english', voice: 'text', behaviour: 'calm' };
  let lastMascotScene = '';
  let lastMascotSupportEventId = 0;
  const mascotViewportQuery = window.matchMedia?.('(min-width: 1181px)');
  const mascotMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const compactAnimationQuery = window.matchMedia?.('(max-width: 767px)');
  // Voice input is deliberately separate from text-to-speech narration. It is
  // created only after a learner presses the microphone control, so a profile never
  // causes a microphone permission prompt by itself.
  const voiceInput = {
    recognition: null,
    listening: false,
    supported: null,
    status: 'ready',
    statusTimer: null,
    taskKey: '',
    initialResponse: '',
    finalTranscript: '',
    finalResultIndexes: new Set(),
    restartTimer: null,
    restartCount: 0,
    stopRequested: false,
    sessionId: 0,
    lastError: ''
  };
  // A modal render replaces the triggering control, so remember its stable
  // action selector rather than a stale DOM reference. This lets keyboard and
  // assistive-technology users return to the control that opened the dialog.
  let modalReturnFocusSelector = '';

  const COURSE = COURSE_CONTENT;
  const LOCAL_AVA_VOICE_URI = 'type2learn-local-edge-ava';
  const SYSTEM_NARRATION_VOICE_URI = 'type2learn-system-default';

  const hasLocalAvaNarration = () => COURSE_AUDIO_MANIFEST.courseId === COURSE.id
    && COURSE_AUDIO_MANIFEST.courseVersion === COURSE.version
    && COURSE_AUDIO_MODULE_KEYS.length === COURSE.steps.length
    && COURSE_AUDIO_MODULE_KEYS.every((key) => {
      const assets = COURSE_AUDIO_MANIFEST.modules?.[key];
      return Boolean(
        assets?.read
        && assets?.simpleAddon
        && Array.isArray(assets.readCues)
        && assets.readCues.length
        && Array.isArray(assets.simpleAddonCues)
        && assets.simpleAddonCues.length
      );
    });

  const finalExam = () => COURSE.finalExam || { questions: [] };
  const finalExamQuestionCount = () => finalExam().questions.length;

  const sourceReadSections = (step) => {
    const content = step.content;
    if (!content) return step.read || [];
    const sentence = (heading, value) => value ? heading + ': ' + value : '';
    const list = (heading, items) => Array.isArray(items) && items.length ? heading + ': ' + items.join('; ') + '.' : '';
    return [
      sentence(content.definitionHeading, content.definition),
      sentence(content.dailyLifeHeading, content.dailyLife),
      sentence(content.strengthsHeading, content.strengths),
      list(content.challengesHeading, content.challenges),
      list(content.supportsHeading, content.supports)
    ].filter(Boolean);
  };

  COURSE.steps.forEach((step) => {
    step.read = sourceReadSections(step);
  });

  const safeJson = (value, fallback) => {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  };

  const clampBackgroundNoiseVolume = (value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0.12;
    return Math.min(BACKGROUND_NOISE_MAX_VOLUME, Math.max(0, numericValue / 100));
  };

  const learningPreferenceKey = () => COURSE_PREFERENCE_NAMESPACE
    + encodeURIComponent(storageKeys.learnerId || 'learner')
    + ':' + encodeURIComponent(COURSE.id);

  const legacyLearningPreferenceKey = () => LEGACY_LEARNING_PREFERENCE_NAMESPACE
    + encodeURIComponent(storageKeys.learnerId || 'learner');

  const readLearningChoices = () => {
    try {
      const stored = safeJson(localStorage.getItem(learningPreferenceKey()), {}) || {};
      if (stored.choices && typeof stored.choices === 'object') return stored.choices;
      // Keep existing learners' earlier choices available as a one-time
      // starting point. The next save writes only this course's preferences.
      const legacy = safeJson(localStorage.getItem(legacyLearningPreferenceKey()), {}) || {};
      return legacy.choices && typeof legacy.choices === 'object' ? legacy.choices : {};
    } catch (_) {
      // The course still works if this browser does not allow local storage.
      return {};
    }
  };

  const defaultLearningChoices = () => ({
    'learning-language': 'english',
    colours: 'balanced',
    layout: 'balanced',
    encouragement: 'subtle',
    animations: 'gentle',
    'background-noise': 'off',
    'background-noise-type': 'pink',
    'background-noise-volume': '15',
    'text-to-speech': 'off',
    mascot: 'off',
    'mascot-language': 'english',
    'mascot-language-explicit': false,
    'mascot-voice': 'text',
    'mascot-behaviour': 'calm',
    'urdu-mode': 'off'
  });

  const learningChoices = () => ({ ...defaultLearningChoices(), ...readLearningChoices() });

  const coursePreferencesAreSaved = () => {
    try {
      const stored = safeJson(localStorage.getItem(learningPreferenceKey()), {}) || {};
      return Boolean(stored.complete && stored.choices && typeof stored.choices === 'object');
    } catch (_) {
      return false;
    }
  };

  const saveLearningChoices = (choices) => {
    try {
      localStorage.setItem(learningPreferenceKey(), JSON.stringify({
        version: 1,
        courseId: COURSE.id,
        complete: true,
        choices
      }));
    } catch (_) {
      // The course remains usable when this browser blocks local storage.
    }
  };

  const readBackgroundNoisePreferences = () => {
    const choices = readLearningChoices();
    const selectedType = ['pink', 'white', 'brown'].includes(choices['background-noise-type'])
      ? choices['background-noise-type']
      : 'pink';
    // Preserve a previously saved White noise choice during the wording change.
    const enabled = choices['background-noise'] === 'on'
      || (choices['background-noise'] === undefined && choices['white-noise'] === 'on');
    return {
      enabled,
      type: selectedType,
      volume: clampBackgroundNoiseVolume(choices['background-noise-volume'])
    };
  };

  const syncMascotPreferences = () => {
    const choices = learningChoices();
    mascotPresentation = {
      enabled: choices.mascot === 'on',
      encouragement: ['subtle', 'balanced', 'expressive'].includes(choices.encouragement)
        ? choices.encouragement
        : 'subtle',
      animations: effectiveAnimationLevel(),
      language: choices['mascot-language'] === 'urdu'
        ? 'urdu'
        : choices['learning-language'] === 'urdu' ? 'urdu' : 'english',
      voice: ['text', 'speech', 'both'].includes(choices['mascot-voice'])
        ? choices['mascot-voice']
        : 'text',
      behaviour: ['low-key', 'calm', 'energetic'].includes(choices['mascot-behaviour'])
        ? choices['mascot-behaviour']
        : 'calm'
    };
  };

  const cancelBackgroundNoiseFade = () => {
    if (backgroundNoise.fadeFrame) {
      window.cancelAnimationFrame(backgroundNoise.fadeFrame);
      backgroundNoise.fadeFrame = null;
    }
    if (backgroundNoise.settleTimer) {
      window.clearTimeout(backgroundNoise.settleTimer);
      backgroundNoise.settleTimer = null;
    }
  };

  const prepareBackgroundNoiseAudio = () => {
    if (!backgroundNoise.enabled) return null;
    const source = BACKGROUND_NOISE_SOURCES[backgroundNoise.type] || BACKGROUND_NOISE_SOURCES.pink;
    if (backgroundNoise.audio?.src?.endsWith(source)) return backgroundNoise.audio;
    cancelBackgroundNoiseFade();
    if (backgroundNoise.audio) backgroundNoise.audio.pause();
    const audio = new Audio(source);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    audio.playsInline = true;
    backgroundNoise.audio = audio;
    backgroundNoise.isPlaying = false;
    audio.load();
    return audio;
  };

  const pauseBackgroundNoise = (announceChange = false) => {
    cancelBackgroundNoiseFade();
    if (backgroundNoise.audio) backgroundNoise.audio.pause();
    const wasPlaying = backgroundNoise.isPlaying;
    backgroundNoise.isPlaying = false;
    if (announceChange && wasPlaying) announce('Background noise paused.');
  };

  const playBackgroundNoise = async ({ announceChange = true } = {}) => {
    if (!backgroundNoise.enabled) return;
    const audio = prepareBackgroundNoiseAudio();
    if (!audio) return;
    cancelBackgroundNoiseFade();
    // A route transition can delay requestAnimationFrame on some browsers.
    // Start at a deliberately low non-zero level, then smoothly rise to the
    // learner's selected (and capped) value. This prevents a silent control
    // that says “Pause” when the initial fade frame has not run yet.
    audio.volume = Math.min(backgroundNoise.volume, 0.055);
    try {
      await audio.play();
      backgroundNoise.isPlaying = true;
      const startedAt = window.performance.now();
      const fadeIn = (timestamp) => {
        if (!backgroundNoise.isPlaying || audio !== backgroundNoise.audio) return;
        const progress = Math.min(1, (timestamp - startedAt) / 420);
        audio.volume = backgroundNoise.volume * progress;
        if (progress < 1) backgroundNoise.fadeFrame = window.requestAnimationFrame(fadeIn);
        else backgroundNoise.fadeFrame = null;
      };
      backgroundNoise.fadeFrame = window.requestAnimationFrame(fadeIn);
      backgroundNoise.settleTimer = window.setTimeout(() => {
        if (!backgroundNoise.isPlaying || audio !== backgroundNoise.audio) return;
        audio.volume = backgroundNoise.volume;
        backgroundNoise.settleTimer = null;
      }, 520);
      if (announceChange) announce('Background noise started at the selected low volume.');
    } catch (_) {
      backgroundNoise.isPlaying = false;
      if (announceChange) announce('Background noise is ready. Select Start background noise to try again.');
    }
  };

  const syncBackgroundNoisePreferences = () => {
    const preferences = readBackgroundNoisePreferences();
    const sourceChanged = backgroundNoise.type !== preferences.type;
    backgroundNoise.enabled = preferences.enabled;
    backgroundNoise.type = preferences.type;
    backgroundNoise.volume = preferences.volume;
    if (!backgroundNoise.enabled) {
      pauseBackgroundNoise();
      return;
    }
    if (sourceChanged && backgroundNoise.audio) {
      backgroundNoise.audio.pause();
      backgroundNoise.audio = null;
      backgroundNoise.isPlaying = false;
    }
    prepareBackgroundNoiseAudio();
  };

  const defaultPreferences = () => resolveSettings(createSettingsState(null));

  const blankAttempt = () => ({
    response: '',
    guidedIndex: 0,
    lessonTypingVersion: 2,
    selectedAnswer: '',
    submitted: false,
    feedback: '',
    integrityNotice: false,
    alternativeInput: false,
    inputMethod: 'keyboard'
  });

  const blankFinalExamAttempt = () => ({
    questionIndex: 0,
    answers: Array.from({ length: finalExamQuestionCount() }, () => null),
    submitted: false,
    completed: false
  });

  const defaultState = () => ({
    version: 1,
    view: 'dashboard',
    previousView: 'dashboard',
    settings: createSettingsState(null),
    preferences: defaultPreferences(),
    progress: {
      lessonIndex: 0,
      phase: 'preview',
      completedSteps: [],
      attempt: blankAttempt(),
      finalExam: blankFinalExamAttempt()
    },
    modal: '',
    helpOption: '',
    manualExampleVisible: false,
    showSimple: false,
    readingSectionIndex: 0,
    reviewModuleIndex: null,
    settingsMenu: false,
    storageAvailable: true
  });

  const normaliseState = (saved, sharedSettings) => {
    const fresh = defaultState();
    if (!saved || typeof saved !== 'object') return fresh;
    // Shared learner settings are the only live settings source. Historical
    // course preference snapshots are handled once, before normalisation, so a
    // full old resolved object cannot become a permanent set of user overrides.
    fresh.settings = createSettingsState(sharedSettings);
    // Preferences are completed before this route opens. Historical setup
    // screens are intentionally not part of the course flow.
    const savedView = ['dashboard', 'course', 'browse', 'saved'].includes(saved.view) ? saved.view : 'dashboard';
    fresh.view = savedView;
    fresh.previousView = ['dashboard', 'course', 'browse', 'saved'].includes(saved.previousView) ? saved.previousView : 'dashboard';
    fresh.preferences = { ...fresh.preferences, ...resolveSettings(fresh.settings) };
    fresh.preferences.automaticSaving = true;
    if (!['standard', 'large', 'extra-large'].includes(fresh.preferences.textSize)) fresh.preferences.textSize = 'standard';
    if (!['standard', 'relaxed'].includes(fresh.preferences.spacing)) fresh.preferences.spacing = 'standard';
    const savedProgress = saved.progress || {};
    fresh.progress.lessonIndex = Math.min(Math.max(Number(savedProgress.lessonIndex) || 0, 0), COURSE.steps.length - 1);
    fresh.progress.phase = ['preview', 'read', 'type', 'check', 'apply', 'complete', 'exam-intro', 'exam', 'exam-results'].includes(savedProgress.phase) ? savedProgress.phase : 'preview';
    fresh.progress.completedSteps = Array.isArray(savedProgress.completedSteps)
      ? savedProgress.completedSteps.filter((index) => Number.isInteger(index) && index >= 0 && index < COURSE.steps.length)
      : [];
    const savedAttempt = savedProgress.attempt || {};
    fresh.progress.attempt = { ...blankAttempt(), ...savedAttempt };
    // A former one-line typing response cannot represent the new complete
    // section-by-section lesson flow. Start that changed task at section one
    // rather than resuming halfway through a mismatched activity.
    if (fresh.progress.phase === 'type' && savedAttempt.lessonTypingVersion !== 2) {
      fresh.progress.attempt = blankAttempt();
    }
    // The former input-method chooser is no longer part of the interface.
    // Preserve the response itself, but do not leave a legacy mode silently
    // allowing pasted or dropped text after a learner returns.
    fresh.progress.attempt.inputMethod = 'keyboard';
    fresh.progress.attempt.alternativeInput = false;
    const savedExam = savedProgress.finalExam || {};
    const questionCount = finalExamQuestionCount();
    const answers = Array.isArray(savedExam.answers) ? savedExam.answers : [];
    fresh.progress.finalExam = {
      questionIndex: Math.min(Math.max(Number(savedExam.questionIndex) || 0, 0), Math.max(questionCount - 1, 0)),
      answers: Array.from({ length: questionCount }, (_, index) => {
        const answer = answers[index];
        return Number.isInteger(answer) && answer >= 0 && answer < 4 ? answer : null;
      }),
      submitted: Boolean(savedExam.submitted),
      completed: Boolean(savedExam.completed)
    };
    if (fresh.progress.finalExam.completed && fresh.progress.phase === 'exam') fresh.progress.phase = 'exam-results';
    if (fresh.progress.phase === 'exam-results') fresh.progress.finalExam.completed = true;
    if (fresh.progress.finalExam.submitted && fresh.progress.finalExam.answers[fresh.progress.finalExam.questionIndex] === null) fresh.progress.finalExam.submitted = false;
    // Older builds used `showExample` for both a learner's disclosure choice
    // and examples automatically opened by the global setting. Those sources
    // cannot be distinguished safely, so only the new explicit manual value is
    // restored. The resolved global setting is evaluated independently below.
    fresh.manualExampleVisible = Boolean(saved.manualExampleVisible);
    fresh.showSimple = Boolean(saved.showSimple);
    fresh.readingSectionIndex = Math.max(0, Number(saved.readingSectionIndex) || 0);
    return fresh;
  };

  const LEGACY_COURSE_SETTINGS_MIGRATION_VERSION = 1;
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

  const migrateLegacyCoursePreferences = (sharedSettings, legacyPreferences) => {
    let next = createSettingsState(sharedSettings);
    const legacy = legacyPreferences && typeof legacyPreferences === 'object' && !Array.isArray(legacyPreferences)
      ? legacyPreferences
      : {};
    const platform = defaultPreferences();
    const current = resolveSettings(next);
    const candidates = {};

    // Only migrate settings the old in-course controls could change, and only
    // when their saved value differs from the platform default. This preserves
    // meaningful legacy choices without freezing a complete resolved snapshot.
    ['smallerSections', 'readAloud', 'fewerDistractions', 'gentleReminders', 'extraExamples', 'visibleProgress', 'alternativeInput', 'narrationAutoScroll', 'narrationHighlight'].forEach((key) => {
      if (typeof legacy[key] === 'boolean' && legacy[key] !== platform[key]) candidates[key] = legacy[key];
    });
    if (legacy.speechToText === true || legacy.voiceInput === true) candidates.speechToText = true;
    if (['large', 'extra-large'].includes(legacy.textSize)) candidates.textSize = legacy.textSize;
    else if (legacy.textSizeLarge === true) candidates.textSize = 'large';
    if (legacy.spacing === 'relaxed' || legacy.spacingRelaxed === true) candidates.spacing = 'relaxed';
    if (['narrow', 'wide'].includes(legacy.readingWidth)) candidates.readingWidth = legacy.readingWidth;
    if (['0.75', '1.25', '1.5'].includes(String(legacy.narrationSpeed))) candidates.narrationSpeed = String(legacy.narrationSpeed);
    if (typeof legacy.narrationVoice === 'string' && legacy.narrationVoice) candidates.narrationVoice = legacy.narrationVoice;

    Object.entries(candidates).forEach(([key, value]) => {
      // A current learner override or a non-default resolved value (for example
      // from an active support profile) is newer and must win over course legacy.
      if (hasOwn(next.userOverrides, key) || current[key] !== platform[key]) return;
      next = setUserOverride(next, key, value);
    });
    return next;
  };

  const savePreferenceShell = (savedPreferences) => {
    localStorage.setItem(storageKeys.preferences, JSON.stringify({
      version: 2,
      settingsMigrationVersion: LEGACY_COURSE_SETTINGS_MIGRATION_VERSION
    }));
  };

  const loadState = () => {
    try {
      const savedPreferences = safeJson(localStorage.getItem(storageKeys.preferences), {}) || {};
      const savedCourse = safeJson(localStorage.getItem(storageKeys.course), {}) || {};
      let sharedSettings = loadLearnerSettings(storageKeys.learnerId);
      if (Number(savedPreferences.settingsMigrationVersion) < LEGACY_COURSE_SETTINGS_MIGRATION_VERSION) {
        const migrated = migrateLegacyCoursePreferences(sharedSettings, savedPreferences.preferences);
        sharedSettings = saveLearnerSettings(storageKeys.learnerId, migrated);
        // Remove the historical full snapshot after the bounded migration. A
        // failed marker write is harmless: the migration is idempotent because
        // current explicit learner overrides always take priority on retry.
        try { savePreferenceShell(savedPreferences); } catch (_) { /* Best-effort legacy cleanup. */ }
      }
      return normaliseState(savedCourse, sharedSettings);
    } catch (_) {
      const state = defaultState();
      state.storageAvailable = false;
      return state;
    }
  };

  let state = defaultState();
  // Support moments are deliberately ephemeral. Progress is saved, but an
  // acknowledgement is created only by the learner action that earned it; it
  // is never restored from storage or recreated by a settings/modal render.
  let supportEventSequence = 0;
  let activeSupportMoment = null;
  let lastRenderedSupportEventId = 0;
  let supportPopupTimer = 0;
  let lastVisualRouteKey = '';
  let actionMotionSequence = 0;
  let typingPulseTimer = 0;
  let rewardAssetsPreloaded = false;

  const warmRewardAssets = () => {
    if (rewardAssetsPreloaded) return;
    rewardAssetsPreloaded = true;
    ['/assets/rewards/type2learn-section-medal.webp', '/assets/rewards/type2learn-module-medal.webp'].forEach((source) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = source;
    });
  };

  const supportLanguage = () => learningChoices()['learning-language'] === 'urdu' ? 'urdu' : 'english';
  const selectedEncouragementLevel = () => {
    const level = learningChoices().encouragement;
    return ['subtle', 'balanced', 'expressive'].includes(level) ? level : 'subtle';
  };
  const savedAnimationLevel = () => {
    const level = learningChoices().animations;
    return ['still', 'gentle', 'lively'].includes(level) ? level : 'gentle';
  };
  const effectiveAnimationLevel = () => {
    if (savedAnimationLevel() === 'still'
      || state.preferences.reducedMotion
      || state.preferences.quietDisplay
      || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return 'still';
    // Small screens keep all written support but never use the broad, staged
    // movement intended for desktop workspaces.
    if (window.matchMedia?.('(max-width: 767px)')?.matches) return 'gentle';
    return savedAnimationLevel();
  };

  const SUPPORT_MESSAGES = {
    english: {
      'task-entry': {
        subtle: null,
        balanced: ['You can do this', 'One small step at a time. Start whenever you are ready.'],
        expressive: ['You are ready for this', 'You have everything you need for the next clear step.']
      },
      'section-complete': {
        subtle: ['Section complete', 'Nice work.'],
        balanced: ['You did it', 'That part is complete. The next small piece is ready.'],
        expressive: ['You are doing amazing', 'You cleared this section. Keep going one clear part at a time.']
      },
      'answer-correct': {
        subtle: ['Correct', 'Nice work.'],
        balanced: ['You got it', 'That matches the lesson. You are ready for the next step.'],
        expressive: ['You cleared it!', 'That was a strong answer. Your next step is ready when you are.']
      },
      'answer-incorrect': {
        subtle: ['Almost there', 'Try again when you are ready.'],
        balanced: ['You can do this', 'The marked answer can guide your next try.'],
        expressive: ['Keep going — you are learning', 'This try gave you useful information. Look at the marked answer, then choose again.']
      },
      'response-needed': {
        subtle: ['Your space is ready', 'Start when you are ready.'],
        balanced: ['Start with one word', 'You do not need to finish everything at once.'],
        expressive: ['You can begin anywhere', 'Start with the first visible word. Each word you add is progress.']
      },
      'typing-incomplete': {
        subtle: ['Good start', 'Continue from the first character that differs.'],
        balanced: ['You are getting there', 'The matching characters stay marked. Continue from the first one that differs.'],
        expressive: ['Keep going — you have got this', 'The matching characters are already there. Continue from the first character that differs.']
      },
      'module-complete': {
        subtle: ['Module complete', 'Well done.'],
        balanced: ['You completed a whole module', 'You worked through every part. Take the next step when you are ready.'],
        expressive: ['Congratulations — you cleared this module', 'You read, typed, checked, and applied one whole idea.']
      },
      'course-complete': {
        subtle: ['Course complete', 'Well done.'],
        balanced: ['Congratulations', 'You completed every module and the final review.'],
        expressive: ['You did something amazing', 'You completed the whole course journey, one thoughtful step at a time.']
      },
      'system-error': {
        subtle: ['Something did not load correctly', 'Your work is still here.'],
        balanced: ['Something did not load correctly', 'Your work is still here. Try again when you are ready.'],
        expressive: ['Something did not load correctly', 'Your work is still here. Try again when you are ready.']
      }
    },
    urdu: {
      'task-entry': {
        subtle: null,
        balanced: ['آپ یہ کر سکتے ہیں', 'ایک وقت میں ایک چھوٹا قدم۔ جب تیار ہوں شروع کریں۔'],
        expressive: ['آپ اس کے لیے تیار ہیں', 'اگلے واضح قدم کے لیے آپ کے پاس سب کچھ موجود ہے۔']
      },
      'section-complete': {
        subtle: ['حصہ مکمل', 'بہت خوب۔'],
        balanced: ['آپ نے کر لیا', 'یہ حصہ مکمل ہے۔ اگلا چھوٹا حصہ تیار ہے۔'],
        expressive: ['آپ بہت اچھا کر رہے ہیں', 'آپ نے یہ حصہ مکمل کر لیا۔ ایک وقت میں ایک واضح حصہ۔']
      },
      'answer-correct': {
        subtle: ['درست', 'بہت خوب۔'],
        balanced: ['آپ نے درست سمجھا', 'یہ جواب سبق سے ملتا ہے۔ آپ اگلے قدم کے لیے تیار ہیں۔'],
        expressive: ['آپ نے یہ مرحلہ مکمل کر لیا!', 'یہ مضبوط جواب تھا۔ اگلا قدم جب چاہیں تیار ہے۔']
      },
      'answer-incorrect': {
        subtle: ['آپ قریب ہیں', 'جب تیار ہوں دوبارہ کوشش کریں۔'],
        balanced: ['آپ یہ کر سکتے ہیں', 'نشان زد جواب آپ کی اگلی کوشش میں مدد دے سکتا ہے۔'],
        expressive: ['آگے بڑھتے رہیں — آپ سیکھ رہے ہیں', 'اس کوشش سے مفید اشارہ ملا ہے۔ نشان زد جواب دیکھیں، پھر دوبارہ منتخب کریں۔']
      },
      'response-needed': {
        subtle: ['آپ کی جگہ تیار ہے', 'جب تیار ہوں شروع کریں۔'],
        balanced: ['ایک لفظ سے شروع کریں', 'آپ کو سب کچھ ایک ساتھ مکمل نہیں کرنا۔'],
        expressive: ['آپ کہیں سے بھی شروع کر سکتے ہیں', 'پہلے واضح لفظ سے شروع کریں۔ ہر لفظ پیش رفت ہے۔']
      },
      'typing-incomplete': {
        subtle: ['اچھی شروعات', 'پہلے مختلف حرف سے جاری رکھیں۔'],
        balanced: ['آپ قریب پہنچ رہے ہیں', 'درست حروف نشان زد رہیں گے۔ پہلے مختلف حرف سے جاری رکھیں۔'],
        expressive: ['آگے بڑھتے رہیں — آپ یہ کر سکتے ہیں', 'درست حروف پہلے سے موجود ہیں۔ پہلے مختلف حرف سے جاری رکھیں۔']
      },
      'module-complete': {
        subtle: ['ماڈیول مکمل', 'بہت خوب۔'],
        balanced: ['آپ نے ایک پورا ماڈیول مکمل کر لیا', 'آپ نے ہر حصہ مکمل کیا۔ جب چاہیں اگلا قدم لیں۔'],
        expressive: ['مبارک ہو — آپ نے یہ ماڈیول مکمل کر لیا', 'آپ نے ایک پورا خیال پڑھا، ٹائپ کیا، جانچا اور استعمال کیا۔']
      },
      'course-complete': {
        subtle: ['کورس مکمل', 'بہت خوب۔'],
        balanced: ['مبارک ہو', 'آپ نے ہر ماڈیول اور آخری جائزہ مکمل کر لیا۔'],
        expressive: ['آپ نے بہت اچھا کام کیا', 'آپ نے پورا کورس ایک ایک سوچے سمجھے قدم سے مکمل کیا۔']
      },
      'system-error': {
        subtle: ['کچھ درست طور پر لوڈ نہیں ہوا', 'آپ کا کام محفوظ ہے۔'],
        balanced: ['کچھ درست طور پر لوڈ نہیں ہوا', 'آپ کا کام یہیں ہے۔ جب تیار ہوں دوبارہ کوشش کریں۔'],
        expressive: ['کچھ درست طور پر لوڈ نہیں ہوا', 'آپ کا کام یہیں ہے۔ جب تیار ہوں دوبارہ کوشش کریں۔']
      }
    }
  };

  const supportCopy = (moment = activeSupportMoment) => {
    if (!moment) return null;
    if (moment.kind === 'preference-preview') {
      const animationCopy = moment.language === 'urdu' ? {
        still: ['صفحہ پُرسکون رہے گا', 'آپ کے اگلے انتخاب فوراً اور بغیر حرکت کے ظاہر ہوں گے۔'],
        gentle: ['آرام سے آگے بڑھیں', 'آپ کا اگلا قدم نرم اور مختصر حرکت کے ساتھ سامنے آئے گا۔'],
        lively: ['چلیں، اگلا قدم لیتے ہیں!', 'ہر انتخاب، اگلا مرحلہ اور کامیابی واضح اور پُرجوش حرکت کے ساتھ سامنے آئے گی۔']
      } : {
        still: ['Your page will stay calm', 'Your next choices will appear immediately with no extra movement.'],
        gentle: ['Take the next step smoothly', 'Your next action will arrive with a short, gentle transition.'],
        lively: ["Let's keep moving!", 'Buttons, new steps, progress, and successful moments will now respond with clear, energetic motion.']
      };
      const encouragementCopy = moment.language === 'urdu' ? {
        subtle: ['آپ یہ کر سکتے ہیں', 'ہم حوصلہ افزائی مختصر اور کام کے قریب رکھیں گے۔'],
        balanced: ['آپ بہت اچھا کر رہے ہیں', 'ہر اہم قدم کے بعد ایک واضح حوصلہ افزا پیغام سامنے آئے گا۔'],
        expressive: ['آپ کمال کر رہے ہیں — آگے بڑھتے رہیں!', 'آپ کی ہر کامیابی کو نمایاں حوصلہ افزائی کے ساتھ سراہا جائے گا۔']
      } : {
        subtle: ['You can do this', 'Encouragement will stay short and close to your task.'],
        balanced: ['You are doing really well', 'A clear, encouraging popup will meet you after each meaningful step.'],
        expressive: ['You are doing amazing — keep going!', 'Every success will be celebrated clearly while your next step stays easy to find.']
      };
      return moment.result === 'animations'
        ? animationCopy[moment.animationLevel]
        : encouragementCopy[moment.encouragementLevel];
    }
    const personalised = personalizedSupportCopy(moment);
    if (personalised) return personalised;
    if (moment.kind === 'section-complete' && moment.result === 'lesson-complete') {
      const completeCopy = moment.language === 'urdu' ? {
        subtle: ['ٹائپنگ مکمل', 'بہت خوب۔'],
        balanced: ['آپ نے پورا سبق ٹائپ کر لیا', 'آپ نے ہر حصہ مکمل کیا۔ اب مختصر جائزہ تیار ہے۔'],
        expressive: ['مبارک ہو — آپ نے پورا سبق ٹائپ کر لیا', 'ہر حصہ مکمل ہے۔ آپ نے یہ کر دکھایا۔ اب مختصر جائزہ تیار ہے۔']
      } : {
        subtle: ['Lesson typing complete', 'Nice work.'],
        balanced: ['You typed the complete lesson', 'You completed every section. The quick check is ready.'],
        expressive: ['Congratulations — you typed the complete lesson', 'Every section is complete. You did it. The quick check is ready.']
      };
      return completeCopy[moment.encouragementLevel];
    }
    return SUPPORT_MESSAGES[moment.language]?.[moment.kind]?.[moment.encouragementLevel]
      || SUPPORT_MESSAGES.english[moment.kind]?.[moment.encouragementLevel]
      || null;
  };

  // Support is tied to the work that just happened. These messages name the
  // current stage instead of recycling one congratulation across the course.
  const personalizedSupportCopy = (moment) => {
    if (!moment || moment.encouragementLevel === 'subtle') return null;
    const expressive = moment.encouragementLevel === 'expressive';
    const moduleName = moment.module || currentStep?.()?.title || 'this module';
    const urdu = moment.language === 'urdu';
    const typingSections = typeof lessonTypingSections === 'function' ? lessonTypingSections() : [];
    const completedTypingIndex = Math.max(0, (Number(state.progress.attempt?.guidedIndex) || 0) - 1);
    const completedHeading = typingSections[completedTypingIndex]?.heading || 'this lesson section';

    if (urdu) {
      if (moment.kind === 'task-entry') {
        if (moment.result === 'reading') return expressive
          ? [`آئیے ${moduleName} کو سمجھیں`, 'ایک وقت میں ایک خیال پڑھیں۔ آپ اپنی رفتار سے آگے بڑھ سکتے ہیں۔']
          : ['اگلا خیال تیار ہے', 'ایک واضح حصہ پڑھیں، پھر جب مناسب لگے آگے بڑھیں۔'];
        if (moment.result === 'typing') return expressive
          ? ['آپ کے الفاظ تیار ہیں', 'پہلے واضح لفظ سے شروع کریں۔ ہر درست حرف آپ کو آگے لے جا رہا ہے۔']
          : ['ایک لفظ سے شروع کریں', 'باقی حصہ ایک ایک حرف کر کے سامنے آ جائے گا۔'];
        if (moment.result === 'applied-practice') return expressive
          ? ['اب خیال کو استعمال کریں', `آپ نے ${moduleName} سمجھا ہے۔ اب بہترین عملی جواب منتخب کریں۔`]
          : ['ایک عملی انتخاب باقی ہے', 'سبق سے ملتا ہوا جواب منتخب کریں۔'];
        if (moment.result === 'exam-question') return expressive
          ? ['آپ اگلے سوال کے لیے تیار ہیں', 'جو آپ نے سیکھا ہے اسے یاد کریں اور ایک جواب منتخب کریں۔']
          : ['اگلا سوال تیار ہے', 'ایک وقت میں صرف یہی سوال۔'];
      }
      if (moment.kind === 'section-complete' && moment.result === 'typing-section') return expressive
        ? [`آپ نے “${completedHeading}” مکمل کر لیا`, 'بہت خوب — اگلا حصہ تیار ہے اور آپ رفتار برقرار رکھے ہوئے ہیں۔']
        : [`“${completedHeading}” مکمل`, 'آپ نے ایک پورا حصہ ٹائپ کیا۔ اگلا حصہ تیار ہے۔'];
      if (moment.kind === 'answer-correct' && moment.result === 'quick-check') return expressive
        ? [`آپ نے ${moduleName} درست سمجھا`, 'زبردست — آپ نے بنیادی خیال پہچان لیا۔ اب اسے عملی صورت میں استعمال کریں۔']
        : ['درست جواب', 'آپ نے سبق کا بنیادی خیال پہچان لیا۔'];
      if (moment.kind === 'answer-correct' && moment.result === 'applied-practice') return expressive
        ? ['آپ نے خیال کو درست استعمال کیا', 'یہ مضبوط عملی انتخاب تھا۔ آپ پورا ماڈیول مکمل کرنے والے ہیں۔']
        : ['اچھا عملی انتخاب', 'یہ جواب سبق کو حقیقی صورتحال سے جوڑتا ہے۔'];
      if (moment.kind === 'answer-incorrect') return expressive
        ? ['یہ کوشش بھی سیکھنے کا حصہ ہے', 'نشان زد جواب دیکھیں، پھر نئے اشارے کے ساتھ دوبارہ کوشش کریں۔']
        : ['آپ دوبارہ کوشش کر سکتے ہیں', 'درست نشان آپ کے اگلے انتخاب کی رہنمائی کرے گا۔'];
      if (moment.kind === 'module-complete') return expressive
        ? [`مبارک ہو — ${moduleName} مکمل`, 'آپ نے پڑھا، ٹائپ کیا، سمجھ جانچی اور خیال کو استعمال کیا۔ یہ پورا ماڈیول آپ نے مکمل کیا۔']
        : [`${moduleName} مکمل`, 'آپ نے اس ماڈیول کے ہر مرحلے کو مکمل کیا۔'];
      return null;
    }

    if (moment.kind === 'task-entry') {
      if (moment.result === 'reading') return expressive
        ? [`Let’s understand ${moduleName}`, 'Read one idea at a time. You can move forward at your own pace.']
        : ['Your next idea is ready', 'Read one clear section, then continue when it feels settled.'];
      if (moment.result === 'typing') return expressive
        ? ['Your words are ready', 'Begin with the first visible word. Every correct character moves this section forward.']
        : ['Start with one word', 'The rest can follow one character at a time.'];
      if (moment.result === 'applied-practice') return expressive
        ? ['Now make the idea useful', `You have understood ${moduleName}. Choose the response that puts it into practice.`]
        : ['One practical choice remains', 'Choose the response that uses the lesson idea.'];
      if (moment.result === 'exam-question') return expressive
        ? ['You are ready for the next question', 'Bring back what you learned and choose one answer.']
        : ['Your next question is ready', 'Only this one question needs your attention.'];
      if (moment.result === 'module-entry') return expressive
        ? [`A new step begins: ${moduleName}`, 'Take a first look. Nothing needs to be completed all at once.']
        : [`${moduleName} is ready`, 'Begin with the short preview when you are ready.'];
    }
    if (moment.kind === 'section-complete' && moment.result === 'typing-section') return expressive
      ? [`You completed “${completedHeading}”`, 'Amazing work — the next part is ready and you are keeping the lesson moving.']
      : [`“${completedHeading}” is complete`, 'You typed one full section. The next part is ready.'];
    if (moment.kind === 'answer-correct' && moment.result === 'quick-check') return expressive
      ? [`You understood the key idea in ${moduleName}`, 'Excellent — you recognised what matters. Now you can put it into practice.']
      : ['That understanding is correct', 'You identified the lesson’s key idea.'];
    if (moment.kind === 'answer-correct' && moment.result === 'applied-practice') return expressive
      ? ['You used the idea well', 'That was a strong practical choice. You are about to complete the whole module.']
      : ['Strong practical choice', 'That response connects the lesson to a real situation.'];
    if (moment.kind === 'answer-correct' && moment.result === 'exam') return expressive
      ? ['You brought the learning back', 'That answer is correct. Your careful work is showing.']
      : ['Correct answer', 'You recalled the idea successfully.'];
    if (moment.kind === 'answer-incorrect') return expressive
      ? ['This try is part of learning', 'Use the marked answer as a new clue, then try again with that information.']
      : ['You can try this again', 'The correct mark can guide your next choice.'];
    if (moment.kind === 'module-complete') return expressive
      ? [`Congratulations — ${moduleName} is complete`, 'You read, typed, checked your understanding, and applied the idea. You earned this full-module medal.']
      : [`You completed ${moduleName}`, 'Every stage in this module is now complete.'];
    if (moment.kind === 'course-complete') return expressive
      ? ['You completed the entire learning journey', 'Every module and the final review is complete. These milestones came from your work, one step at a time.']
      : ['The complete course is finished', 'You worked through every module and the final review.'];
    return null;
  };

  // Saved answers can be rendered after a reload, when no new support event
  // should be announced or animated. They use the same catalogue as live
  // feedback so wording stays consistent with the learner's current language
  // and encouragement choice.
  const supportCopyFor = (kind, detail = {}) => supportCopy({
    kind,
    result: detail.result || '',
    language: supportLanguage(),
    encouragementLevel: selectedEncouragementLevel()
  });

  const savedSupportMarkup = (kind, detail = {}, className = 'check-feedback') => {
    const copy = supportCopyFor(kind, detail);
    if (!copy) return '';
    const [title, description] = copy;
    return '<p class="' + className + ' ' + (kind === 'answer-correct' ? 'is-correct' : 'is-incorrect') + '" role="note" aria-live="off"><strong>' + escapeHtml(title) + '</strong>' + (description ? ' ' + escapeHtml(description) : '') + '</p>';
  };

  const setSupportMoment = (kind, detail = {}) => {
    const moment = {
      id: ++supportEventSequence,
      kind,
      phase: detail.phase || state.progress.phase,
      layout: selectedCourseLayout(),
      animationLevel: effectiveAnimationLevel(),
      encouragementLevel: selectedEncouragementLevel(),
      module: detail.module || currentStep()?.title || '',
      result: detail.result || '',
      language: supportLanguage()
    };
    activeSupportMoment = moment;
    return moment;
  };

  const clearSupportMoment = () => { activeSupportMoment = null; };
  const supportMomentAnnouncement = (moment = activeSupportMoment) => {
    const copy = supportCopy(moment);
    return copy ? copy.filter(Boolean).join('. ') : '';
  };

  const supportMomentMeta = (moment = activeSupportMoment) => {
    const urdu = moment?.language === 'urdu';
    const metadata = urdu ? {
      'task-entry': ['→', 'اگلا قدم', 'ایک واضح کام پر توجہ دیں۔'],
      'section-complete': ['✓', 'کیا مکمل ہوا', 'اگلے حصے کے لیے تیار ہوں تو آگے بڑھیں۔'],
      'answer-correct': ['✓', 'کیا مکمل ہوا', 'جب مناسب لگے اگلے عمل پر جائیں۔'],
      'answer-incorrect': ['↗', 'اگلا انتخاب', 'درست جواب دیکھیں یا دوسرا جواب منتخب کریں۔'],
      'response-needed': ['→', 'اگلا انتخاب', 'جب تیار ہوں جواب شامل کریں۔'],
      'typing-incomplete': ['↗', 'اگلا انتخاب', 'پہلے مختلف حرف سے جاری رکھیں۔'],
      'module-complete': ['✓', 'کیا مکمل ہوا', 'اگلا مختصر ماڈیول آپ کے لیے تیار ہے۔'],
      'course-complete': ['✓', 'کیا مکمل ہوا', 'اپنی پیش رفت کو جب چاہیں دوبارہ دیکھیں۔'],
      'system-error': ['!', 'اگلا انتخاب', 'آپ کا کام یہی ہے۔ جب تیار ہوں دوبارہ کوشش کریں۔'],
      'preference-preview': ['♥', '', '']
    } : {
      'task-entry': ['→', 'Next step', 'Focus on one clear action.'],
      'section-complete': ['✓', 'What changed', 'Continue when the next section feels right.'],
      'answer-correct': ['✓', 'What changed', 'Move to the next action when it feels right.'],
      'answer-incorrect': ['↗', 'Next choice', 'Review the marked answer or choose another response.'],
      'response-needed': ['→', 'Next choice', 'Add a response when you are ready.'],
      'typing-incomplete': ['↗', 'Next choice', 'Continue from the first character that differs.'],
      'module-complete': ['✓', 'What changed', 'The next short module is ready when you are.'],
      'course-complete': ['✓', 'What changed', 'You can revisit your progress whenever you want.'],
      'system-error': ['!', 'Next choice', 'Your work is still here. Try again when ready.'],
      'preference-preview': ['♥', '', '']
    };
    return metadata[moment?.kind] || metadata['task-entry'];
  };
  const recordSupportMoment = (kind, detail = {}) => {
    const moment = setSupportMoment(kind, detail);
    return supportMomentAnnouncement(moment);
  };

  // The bundled Ava recordings are the normal course narrator. Older builds
  // saved a browser-specific voice URI, which made an existing learner keep
  // hearing their device voice after the recordings were added. Preserve only
  // an explicit "Device voice" choice as an opt-out from the included audio.
  const effectiveNarrationVoice = () => {
    if (state.preferences.narrationVoice === SYSTEM_NARRATION_VOICE_URI) return '';
    if (hasLocalAvaNarration()) return LOCAL_AVA_VOICE_URI;
    return state.preferences.narrationVoice || '';
  };
  const usesLocalAvaNarration = () => effectiveNarrationVoice() === LOCAL_AVA_VOICE_URI && hasLocalAvaNarration();

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({