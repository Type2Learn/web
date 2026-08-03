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
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  const colorModes = ['flat', 'balanced', 'vivid'];
  const currentColorMode = () => window.Type2LearnColorMode?.get?.() || document.documentElement.dataset.colorMode || 'balanced';

  const profileName = () => {
    if (authenticatedUser?.isGuest) return 'Guest learner';
    return authenticatedUser?.displayName?.trim()
      || authenticatedUser?.email?.split('@')[0]
      || 'Type2Learn learner';
  };

  const profileInitials = () => profileName().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'T2';

  const profileAvatar = () => authenticatedUser?.isGuest
    ? '<span class="course-guest-avatar" aria-hidden="true"><img src="/assets/mascot/guest-profile-bunny.webp" alt=""></span>'
    : '<span class="course-profile-initials" aria-hidden="true">' + escapeHtml(profileInitials()) + '</span>';

  const settingsChoiceGroup = (id, label, description, choices, selected) => '<fieldset class="course-settings-choice-group"><legend>' + escapeHtml(label) + '</legend><p>' + escapeHtml(description) + '</p><div role="group" aria-label="' + escapeHtml(label) + '">' + choices.map(([value, optionLabel]) => {
    const isUrdu = /[\u0600-\u06ff]/.test(optionLabel);
    return '<button type="button" data-settings-choice="' + escapeHtml(id) + '" data-value="' + escapeHtml(value) + '" aria-pressed="' + String(value === selected) + '"' + (isUrdu ? ' lang="ur" dir="rtl"' : '') + '>' + escapeHtml(optionLabel) + '</button>';
  }).join('') + '</div></fieldset>';

  const settingsSwitch = (id, label, description, checked, disabled = false) => '<button class="course-settings-switch" type="button" role="switch" aria-checked="' + String(checked) + '" data-settings-toggle="' + escapeHtml(id) + '"' + (disabled ? ' disabled' : '') + '><span><strong>' + escapeHtml(label) + '</strong><small>' + escapeHtml(description) + '</small></span><i aria-hidden="true"><b></b></i></button>';

  const courseSettingsMenu = () => {
    if (!state.settingsMenu) return '';
    const preferencesSaved = coursePreferencesAreSaved();
    const choices = learningChoices();
    const noiseType = ['pink', 'white', 'brown'].includes(choices['background-noise-type']) ? choices['background-noise-type'] : 'pink';
    const noiseVolume = Math.min(35, Math.max(0, Number(choices['background-noise-volume']) || 15));
    const mascotUnavailable = !mascotViewportQuery?.matches;
    const controls = preferencesSaved ? [
      '<div class="course-settings-menu-controls">',
      settingsChoiceGroup('learning-language', 'Starting language', 'Choose the mascot language you would like to begin with.', [['english', 'English'], ['urdu', 'اردو']], choices['learning-language']),
      settingsChoiceGroup('colours', 'Color style', 'Choose how much color appears around the task.', [['flat', 'Flat'], ['balanced', 'Balanced'], ['vivid', 'Vivid']], choices.colours),
      settingsChoiceGroup('layout', 'Page layout', 'Choose how much space sits around one task.', [['focused', 'Focused'], ['balanced', 'Balanced'], ['open', 'Open']], choices.layout),
      settingsChoiceGroup('encouragement', 'Encouragement', 'Choose how visible supportive moments feel.', [['subtle', 'Subtle'], ['balanced', 'Balanced'], ['expressive', 'Expressive']], choices.encouragement),
      settingsChoiceGroup('animations', 'Animations', 'Choose how much supportive movement you would like to see.', [['still', 'Still'], ['gentle', 'Gentle'], ['lively', 'Lively']], choices.animations),
      settingsSwitch('background-noise', 'Background noise', 'Optional looping sound. It always starts quietly.', choices['background-noise'] === 'on'),
      choices['background-noise'] === 'on' ? '<div class="course-settings-noise"><label>Noise type<select data-settings-noise-type><option value="pink"' + (noiseType === 'pink' ? ' selected' : '') + '>Pink</option><option value="white"' + (noiseType === 'white' ? ' selected' : '') + '>White</option><option value="brown"' + (noiseType === 'brown' ? ' selected' : '') + '>Brown</option></select></label><label>Volume <output data-settings-noise-volume-output>' + noiseVolume + '%</output><input type="range" min="0" max="35" step="1" value="' + noiseVolume + '" data-settings-noise-volume></label></div>' : '',
      settingsSwitch('text-to-speech', 'Text to speech', 'Keep optional read-aloud support available. It will not play by itself.', choices['text-to-speech'] === 'on'),
      settingsSwitch('mascot', 'Mascot', mascotUnavailable ? 'Available on larger screens. This screen is too small.' : 'Show your learning companion during this course.', choices.mascot === 'on', mascotUnavailable),
      choices.mascot === 'on' ? settingsChoiceGroup('mascot-language', 'Mascot language', 'This can match or differ from your learning language.', [['english', 'English'], ['urdu', 'اردو']], choices['mascot-language'] || choices['learning-language']) : '',
      choices.mascot === 'on' ? settingsChoiceGroup('mascot-voice', 'Mascot voice', 'Choose how the mascot will communicate when voice options are connected.', [['text', 'Text'], ['speech', 'Speech'], ['both', 'Both']], choices['mascot-voice']) : '',
      choices.mascot === 'on' ? settingsChoiceGroup('mascot-behaviour', 'Mascot behaviour', 'Choose the kind of presence that feels comfortable.', [['low-key', 'Low-key'], ['calm', 'Calm'], ['energetic', 'Energetic']], choices['mascot-behaviour']) : '',
      settingsSwitch('urdu-mode', 'Urdu mode', 'This switch is being prepared. It does not change this lesson language yet.', choices['urdu-mode'] === 'on'),
      '</div>'
    ].join('') : '<p class="course-settings-menu-gate">Choose the available course first. Its personal learning settings will appear here after setup.</p>';
    return '<section class="course-settings-menu" id="course-settings-menu" role="dialog" aria-label="Learning settings"><header><span class="course-settings-profile">' + profileAvatar() + '<strong>' + escapeHtml(profileName()) + '</strong></span><button class="course-settings-close" type="button" data-action="close-settings-menu" aria-label="Close settings">×</button></header>' + controls + '<footer><button class="course-settings-signout" type="button" data-action="signout">Sign out</button></footer></section>';
  };

  const mascotCanAppear = () => Boolean(
    mascotPresentation.enabled
    && state.view !== 'dashboard'
    && mascotViewportQuery?.matches
  );

  const mascotScene = () => {
    if (state.view === 'dashboard') return 'dashboard';
    if (state.view === 'browse') return 'browse';
    if (state.view === 'saved') return 'saved';
    return 'course-' + (state.progress.phase || 'preview');
  };

  const mascotDialogue = () => {
    const moment = activeSupportMoment;
    const urdu = mascotPresentation.language === 'urdu';
    if ((state.modal === 'help' || state.modal === 'explain') && mascotPresentation.enabled) {
      return urdu
        ? 'یہیں رہیں۔ ہم ایک وقت میں صرف اگلا واضح قدم دیکھتے ہیں۔'
        : 'Stay here with me. We only need the next clear step.';
    }
    if (!moment) return '';
    const level = moment.encouragementLevel;
    const subtleDialogue = ['module-complete', 'course-complete', 'system-error'].includes(moment.kind)
      || (moment.kind === 'task-entry' && ['course-entry', 'module-entry'].includes(moment.result));
    if (level === 'subtle' && !subtleDialogue) return '';
    if (level === 'balanced' && moment.kind === 'answer-incorrect') return '';
    const messages = urdu ? {
      'task-entry': 'آپ یہ کر سکتے ہیں۔ ایک وقت میں ایک واضح قدم۔',
      'section-complete': 'آپ نے کر لیا۔ یہ حصہ مکمل ہے۔',
      'answer-correct': 'آپ نے درست سمجھا۔ بہت خوب!',
      'answer-incorrect': 'آپ یہ کر سکتے ہیں۔ نشان زد جواب دیکھیں، پھر دوبارہ کوشش کریں۔',
      'typing-incomplete': 'اچھی شروعات۔ پہلے مختلف حرف سے جاری رکھیں۔',
      'response-needed': 'ایک لفظ سے شروع کریں۔ میں آپ کے ساتھ ہوں۔',
      'module-complete': 'آپ نے پورا ماڈیول مکمل کر لیا۔ یہ بہت اچھا کام ہے۔',
      'course-complete': 'آپ نے بہت اچھا کام کیا۔ ہر قدم اہم تھا۔',
      'system-error': 'آپ کا کام محفوظ ہے۔ جب تیار ہوں دوبارہ کوشش کریں۔'
    } : {
      'task-entry': 'You can do this. One clear step at a time.',
      'section-complete': 'You did it. This part is complete.',
      'answer-correct': 'You got it. Nice work!',
      'answer-incorrect': 'You can do this. Use the marked answer, then try again.',
      'typing-incomplete': 'Nice start. Continue from the first character that differs.',
      'response-needed': 'Start with one word. I am right here with you.',
      'module-complete': 'You cleared a whole module. That is amazing.',
      'course-complete': 'You did something amazing. Every step counted.',
      'system-error': 'Your work is still here. Try again when you are ready.'
    };
    return messages[moment.kind] || '';
  };

  const courseMascotMarkup = (location) => {
    if (!mascotCanAppear()) return '';
    const mascotLanguage = mascotPresentation.language === 'urdu' ? 'ur' : 'en';
    const mascotDirection = mascotPresentation.language === 'urdu' ? 'rtl' : 'ltr';
    const dialogue = mascotDialogue();
    const dialogueMarkup = dialogue
      ? '<p class="course-mascot-dialogue" data-mascot-dialogue aria-live="off" lang="' + mascotLanguage + '" dir="' + mascotDirection + '">' + escapeHtml(dialogue) + '</p>'
      : '';
    return '<aside class="course-mascot-rail course-mascot-rail--' + location + '" data-course-mascot><div class="course-mascot-stage" data-course-mascot-stage aria-hidden="true"></div>' + dialogueMarkup + '</aside>';
  };

  const dashboardWithMascot = (content, location) => {
    if (!mascotCanAppear()) return '<div class="course-dashboard-content">' + content + '</div>';
    return '<div class="course-dashboard-content has-course-mascot"><div class="course-dashboard-primary">' + content + '</div>' + courseMascotMarkup(location) + '</div>';
  };

  const courseTopbar = () => {
    return [
      '<header class="course-topbar" aria-label="Learning navigation">',
      '<div class="course-topbar-inner">',
      '<button class="course-brand" type="button" data-action="pause" aria-label="Pause and save your course"><img src="/assets/type2learn-logo-nav.webp" alt=""><span>TYPE2LEARN</span></button>',
      '<div class="course-topbar-profile">',
      '<button class="course-pause-button" type="button" data-action="pause" aria-label="Pause and save"><span aria-hidden="true">Ⅱ</span><span>Pause &amp; save</span></button>',
      '<button class="course-profile-button" type="button" data-action="toggle-settings-menu" aria-expanded="' + String(Boolean(state.settingsMenu)) + '" aria-controls="course-settings-menu" aria-label="Open learning settings">' + profileAvatar() + '</button>',
      courseSettingsMenu(),
      '</div>',
      '</div>',
      '</header>'
    ].join('');
  };

  const renderShell = (content) => authenticatedUser
    ? '<div class="course-app-shell">' + courseTopbar() + '<div class="course-page-content">' + content + '</div></div>'
    : content;

  const announce = (message) => {
    if (liveRegion) liveRegion.textContent = message;
  };

  const save = (message) => {
    try {
      if (!storageKeys.preferences || !storageKeys.course) throw new Error('Learner storage is not ready.');
      localStorage.setItem(storageKeys.preferences, JSON.stringify({
        version: 2,
        settingsMigrationVersion: LEGACY_COURSE_SETTINGS_MIGRATION_VERSION
      }));
      localStorage.setItem(storageKeys.course, JSON.stringify({
        version: 1,
        view: state.view,
        previousView: state.previousView,
        progress: state.progress,
        manualExampleVisible: state.manualExampleVisible,
        showSimple: state.showSimple,
        readingSectionIndex: state.readingSectionIndex
      }));
      state.settings = saveLearnerSettings(storageKeys.learnerId, state.settings);
      state.storageAvailable = true;
      const saveStatus = document.querySelector('[data-save-status]');
      if (saveStatus) saveStatus.textContent = message || 'Saved locally';
      if (message) announce(message);
    } catch (_) {
      state.storageAvailable = false;
      if (state.view === 'course') recordSupportMoment('system-error', { result: 'saving' });
      const saveStatus = document.querySelector('[data-save-status]');
      if (saveStatus) saveStatus.textContent = 'Saving is unavailable in this browser session.';
      announce('Saving is unavailable in this browser session.');
    }
  };

  const isReviewingModule = () => Number.isInteger(state.reviewModuleIndex)
    && state.reviewModuleIndex >= 0
    && state.reviewModuleIndex < COURSE.steps.length;
  const displayedModuleIndex = () => isReviewingModule() ? state.reviewModuleIndex : state.progress.lessonIndex;
  const currentStep = () => COURSE.steps[displayedModuleIndex()];
  const isLastStep = () => state.progress.lessonIndex === COURSE.steps.length - 1;
  const courseProgress = () => Math.round((state.progress.completedSteps.length / COURSE.steps.length) * 100);
  const isFinalExamPhase = () => ['exam-intro', 'exam', 'exam-results'].includes(state.progress.phase);
  const currentFinalExamQuestion = () => finalExam().questions[state.progress.finalExam.questionIndex];
  const phaseNumber = () => ({ preview: 1, read: 2, type: 3, check: 4, apply: 5, complete: 5 }[state.progress.phase] || 1);

  // The typing work mirrors the lesson the learner has just read. Each
  // content section remains whole—rather than reducing the lesson to a single
  // slogan—so it can be typed and checked one clear piece at a time.
  const lessonTypingSections = (step = currentStep()) => {
    const content = step?.content || {};
    const listText = (items) => Array.isArray(items) ? items.join('\n') : '';
    return [
      { heading: content.definitionHeading, text: content.definition },
      { heading: content.dailyLifeHeading, text: content.dailyLife },
      { heading: content.strengthsHeading, text: content.strengths },
      { heading: content.challengesHeading, text: listText(content.challenges) },
      { heading: content.supportsHeading, text: listText(content.supports) }
    ].filter((section) => String(section.heading || '').trim() && String(section.text || '').trim());
  };

  const usesLessonSectionTyping = () => Boolean(
    state.view === 'course'
      && state.progress.phase === 'type'
      && !isReviewingModule()
      && lessonTypingSections().length
  );

  const activeLessonTypingSection = () => {
    const sections = lessonTypingSections();
    const index = Math.max(0, Math.min(Number(state.progress.attempt.guidedIndex) || 0, Math.max(0, sections.length - 1)));
    return { section: sections[index] || { heading: 'Typing practice', text: '' }, index, total: sections.length };
  };

  const lessonTypingDuration = () => {
    const length = Array.from(activeLessonTypingSection().section.text || '').length;
    return length > 220 ? 'About 2 minutes' : 'About 1 minute';
  };

  const savedTaskLabel = () => ({
    preview: 'Preview this small step',
    read: 'Read this short explanation',
    type: 'Type the current lesson section',
    check: 'Check understanding',
    apply: 'Use the idea in a small situation',
    complete: 'One small step complete',
    'exam-intro': 'Get ready for the final exam',
    exam: 'Answer one final exam question',
    'exam-results': 'Review your final exam results'
  }[state.progress.phase] || 'Continue learning');

  const taskLabel = () => isReviewingModule() ? 'Review a completed module' : savedTaskLabel();

  const taskTime = () => {
    const estimate = isReviewingModule()
      ? (currentStep().duration || 'Ready when you are')
      : ({ preview: 'You can skip this step', read: 'You can skip this step', type: lessonTypingDuration(), check: 'About 1 minute', apply: 'About 1 minute', complete: 'Ready when you are', 'exam-intro': 'You can skip this step', exam: 'One question at a time', 'exam-results': 'Ready when you are' }[state.progress.phase] || 'Ready when you are');
    return estimate;
  };

  // Open layout deliberately keeps a lightweight pace cue. The other layouts
  // keep that area for support instead, so no duration is presented as a
  // requirement or expectation.
  const taskHeaderControls = (paceCopy = taskTime()) => {
    const explain = '<button class="course-task-explain" type="button" data-action="explain-step">Explain this step</button>';
    if (learningChoices().layout === 'open') {
      return '<span class="course-task-header-controls"><span class="course-task-time">' + escapeHtml(paceCopy) + '</span>' + explain + '</span>';
    }
    return '<span class="course-task-header-controls">' + explain + '</span>';
  };

  const applyPreferences = () => {
    const courseChoices = learningChoices();
    // Apply the course's colour choice before feedback and motion are painted.
    // This prevents an older site-wide mode from styling a course popup after
    // the learner has deliberately selected a different colour treatment.
    if (colorModes.includes(courseChoices.colours) && currentColorMode() !== courseChoices.colours) {
      window.Type2LearnColorMode?.set(courseChoices.colours, false);
    }
    document.body.dataset.courseLayout = ['focused', 'balanced', 'open'].includes(courseChoices.layout) ? courseChoices.layout : 'focused';
    document.body.dataset.courseAnimations = effectiveAnimationLevel();
    document.body.dataset.courseAnimationPreference = savedAnimationLevel();
    document.body.dataset.courseEncouragement = selectedEncouragementLevel();
    document.body.dataset.courseDirection = courseChoices['learning-language'] === 'urdu' ? 'rtl' : 'ltr';
    document.body.dataset.courseUrduMode = courseChoices['urdu-mode'] === 'on' ? 'on' : 'off';
    if (effectiveAnimationLevel() === 'lively' && selectedEncouragementLevel() === 'expressive') warmRewardAssets();
    document.body.classList.toggle('course-fewer-distractions', Boolean(state.preferences.fewerDistractions));
    document.body.classList.toggle('course-quiet-display', Boolean(state.preferences.quietDisplay));
    document.body.classList.toggle('course-stable-layout', Boolean(state.preferences.stableLayout));
    document.body.classList.toggle('course-smaller-sections', Boolean(state.preferences.smallerSections));
    document.body.classList.toggle('course-progress-hidden', !state.preferences.visibleProgress);
    document.body.classList.toggle('course-assistive-input', Boolean(state.preferences.oneHandedInput || state.preferences.switchInput));
    document.body.classList.toggle('course-one-handed-input', Boolean(state.preferences.oneHandedInput));
    document.body.classList.toggle('course-switch-input', Boolean(state.preferences.switchInput));
    document.body.classList.toggle('course-keyboard-shortcuts', Boolean(state.preferences.keyboardShortcuts));
    document.body.classList.toggle('course-reduced-movement', Boolean(state.preferences.reducedRepeatedMovement));
    document.body.dataset.courseTextSize = state.preferences.textSize;
    document.body.dataset.courseSpacing = state.preferences.spacing;
    document.body.dataset.courseReadingWidth = state.preferences.readingWidth;
    document.body.dataset.courseNumericProgress = state.preferences.numericProgress;
    document.body.classList.toggle('course-high-contrast', Boolean(state.preferences.highContrast));
    document.body.classList.toggle('course-large-controls', Boolean(state.preferences.largerControls));
    document.body.classList.toggle('course-reduced-motion', Boolean(state.preferences.reducedMotion));
    document.body.classList.toggle('course-content-transitions', contentTransitionsAreEnabled());
    document.body.classList.toggle('course-tts-mode-active', Boolean(state.preferences.readAloud));
  };

  const refreshResolvedPreferences = () => {
    state.preferences = resolveSettings(state.settings);
    state.preferences.automaticSaving = true;
  };

  const setCourseSetting = (key, value) => {
    state.settings = setUserOverride(state.settings, key, value);
    refreshResolvedPreferences();
  };
  const setCourseActiveInputMethod = (method) => {
    state.settings = setActiveInputMethod(state.settings, method);
    const available = getAvailableInputMethods(state.settings);
    const active = available.includes(state.settings.activeInputMethod) ? state.settings.activeInputMethod : 'keyboard';
    state.settings.activeInputMethod = active;
    if (active === 'voice') {
      state.progress.attempt.inputMethod = 'voice';
      state.progress.attempt.alternativeInput = true;
    } else {
      state.progress.attempt.inputMethod = active;
      state.progress.attempt.alternativeInput = active === 'alternative';
      if (voiceInput.listening) stopVoiceInput('Microphone input stopped because you chose another input method.');
    }
    refreshResolvedPreferences();
  };

  const upgradeLegacyNarrationVoice = () => {
    const savedVoice = state.preferences.narrationVoice;
    if (!hasLocalAvaNarration()
      || !savedVoice
      || savedVoice === LOCAL_AVA_VOICE_URI
      || savedVoice === SYSTEM_NARRATION_VOICE_URI) return false;
    setCourseSetting('narrationVoice', LOCAL_AVA_VOICE_URI);
    return true;
  };

  const shouldShowSimple = () => Boolean(state.showSimple || (state.preferences.simplerExplanations && currentStep()?.simple));
  const shouldShowExample = () => Boolean(state.preferences.extraExamples || state.manualExampleVisible);
  const typingIsConceptResponse = () => !usesLessonSectionTyping() && currentStep()?.typing?.level === 'Recall typing';
  const typingAllowsAlternativeInput = () => typingIsConceptResponse() && Boolean(state.preferences.alternativeInput);
  const typingAllowsAlternativeResponse = () => typingIsConceptResponse() && Boolean(state.preferences.alternativeResponses);
  const availableInputMethods = () => getAvailableInputMethods(state.settings);
  const activeInputMethod = () => availableInputMethods().includes(state.settings.activeInputMethod) ? state.settings.activeInputMethod : 'keyboard';
  // Speech input is always a deliberate button press and only appears after the
  // learner enables Speech-to-text in their shared learning settings. Recall
  // responses are concept responses; Key idea and Guided activities retain
  // typing as their stated learning objective and never show a microphone.
  const typingAllowsVoiceInput = () => typingIsConceptResponse() && Boolean(state.preferences.speechToText) && activeInputMethod() === 'voice';
  const usingAlternativeInput = () => Boolean(
    typingIsConceptResponse()
      && ((state.progress.attempt.inputMethod === 'voice' && state.preferences.speechToText)
        || (typingAllowsAlternativeInput() && state.progress.attempt.alternativeInput && activeInputMethod() === 'alternative'))
  );
  const typingIsAccuracyObjective = () => usesLessonSectionTyping() || ['Key idea typing', 'Guided typing'].includes(currentStep()?.typing?.level);
  const numericProgressIsReduced = () => state.preferences.numericProgress === 'reduced';

  const renderAuthChecking = () => '<main class="course-setup" id="course-main"><div class="course-setup-card course-auth-check"><p class="course-eyebrow">Private course access</p><h1>Checking your sign-in&hellip;</h1><p class="course-lead">Preparing your course.</p></div></main>';

  const currentStepSummary = () => {
    if (isReviewingModule()) {
      const reviewLabel = state.preferences.visibleProgress ? 'Reviewing module ' + (displayedModuleIndex() + 1) + ' of ' + COURSE.steps.length : 'Reviewing a completed module';
      return '<span>' + escapeHtml(reviewLabel) + '</span><i aria-hidden="true"></i><span>' + escapeHtml(currentStep().duration || 'Ready when you are') + '</span>';
    }
    if (isFinalExamPhase()) {
      const exam = state.progress.finalExam;
      const detail = !state.preferences.visibleProgress
        ? (state.progress.phase === 'exam-results' ? 'Results and review' : 'One question at a time')
        : state.progress.phase === 'exam'
        ? 'Question ' + (exam.questionIndex + 1) + ' of ' + finalExamQuestionCount()
        : state.progress.phase === 'exam-results'
          ? 'Results and review'
          : finalExamQuestionCount() + ' questions';
      return '<span>Final exam</span><i aria-hidden="true"></i><span>' + escapeHtml(detail) + '</span>';
    }
    const stepNumber = state.progress.lessonIndex + 1;
    const stepLabel = state.preferences.visibleProgress ? 'Step ' + stepNumber + ' of ' + COURSE.steps.length : currentStep().title;
    return '<span>' + escapeHtml(stepLabel) + '</span><i aria-hidden="true"></i><span>' + escapeHtml(currentStep().duration) + '</span>';
  };

  const PLANNED_COURSES = [
    {
      title: 'Introduction to Touch Typing',
      description: 'Build steady keyboard confidence with finger placement, accuracy, and practical typing habits.',
      urduMode: false
    },
    {
      title: 'Introduction to English Language',
      description: 'Practise reading, vocabulary, and written expression through short active-learning tasks.',
      urduMode: false
    },
    {
      title: 'Introduction to Python Programming',
      description: 'Learn core programming ideas by reading, predicting, and writing small Python programs.',
      urduMode: true
    },
    {
      title: 'Introduction to C++ Programming',
      description: 'Explore programming foundations, syntax, and problem-solving with C++.',
      urduMode: true
    },
    {
      title: 'Introduction to C Programming',
      description: 'Learn fundamental programming concepts and how C programs are built step by step.',
      urduMode: true
    },
    {
      title: 'Introduction to ARM Assembly',
      description: 'Explore registers, instructions, and simple programs for ARM-based systems.',
      urduMode: true
    }
  ];

  const availableCourseCard = () => {
    const preferencesReady = coursePreferencesAreSaved();
    return '<section class="course-catalogue-card course-catalogue-card--available" aria-labelledby="available-course-title"><div><p class="course-eyebrow">Available course</p><h2 id="available-course-title">' + escapeHtml(COURSE.title) + '</h2><p class="course-catalogue-setup">' + (preferencesReady
      ? 'Your course choices are ready. You can change them anytime from the profile picture in the top-right corner.'
      : 'Choose this course, then set up the learning options that fit this course.') + '</p><p class="course-catalogue-description">Explore respectful language, everyday experiences, and practical ways to support accessible participation.</p><p class="course-catalogue-language">Urdu mode planned</p></div><button class="course-primary-button" type="button" data-action="course-preferences">Choose this course <span aria-hidden="true">→</span></button></section>';
  };

  const lockedCourseCard = (course) => '<article class="course-catalogue-card course-catalogue-card--locked" aria-label="' + escapeHtml(course.title) + ' is planned and not available yet."><div class="course-catalogue-card-copy"><p class="course-eyebrow">Planned course</p><h2>' + escapeHtml(course.title) + '</h2><p class="course-catalogue-description">' + escapeHtml(course.description) + '</p>' + (course.urduMode ? '<p class="course-catalogue-language">Urdu mode planned</p>' : '') + '</div><div class="course-catalogue-lock" aria-hidden="true"><span>Not available yet</span></div><span class="course-visually-hidden">This planned course is not available yet.</span></article>';

  const courseCatalogue = () => '<section class="course-catalogue" aria-label="Course selection">' + availableCourseCard() + '<div class="course-catalogue-grid">' + PLANNED_COURSES.map(lockedCourseCard).join('') + '</div></section>';

  const renderDashboard = () => '<main class="course-dashboard" id="course-main">' + dashboardWithMascot('<header class="course-dashboard-header"><p class="course-eyebrow">Your learning space</p><h1>One small step at a time.</h1><p>Choose one course to begin. You can set up the learning options for that course before you start.</p></header>' + courseCatalogue(), 'dashboard') + '</main>';

  const renderBrowse = () => '<main class="course-dashboard" id="course-main">' + dashboardWithMascot('<div class="course-panel-page"><button class="course-back-button" type="button" data-action="dashboard">← Back to learning overview</button><p class="course-eyebrow">Browse courses</p><h1>One course is ready for this prototype.</h1><p class="course-lead">Keeping the next choice small helps this experience stay task-focused. More courses can appear here once their content is reviewed.</p><article class="course-listing"><div><span class="course-status">Prototype course</span><h2>' + escapeHtml(COURSE.title) + '</h2><p>' + COURSE.steps.length + ' short, non-diagnostic modules about general experiences, respectful language, and accessible participation.</p></div><button class="course-primary-button" type="button" data-action="course-preferences">Choose this course <span aria-hidden="true">→</span></button></article></div>', 'browse') + '</main>';


  const moduleProgressItem = (step, index, includeFinalExam = false) => {
    const complete = state.progress.completedSteps.includes(index);
    const active = isReviewingModule()
      ? index === displayedModuleIndex()
      : (!includeFinalExam || !isFinalExamPhase()) && index === state.progress.lessonIndex;
    const status = active
      ? (isReviewingModule() ? 'Reviewing now' : taskLabel())
      : complete ? 'Completed · Review' : 'Available next';
    const details = complete && !active
      ? '<button type="button" data-action="review-module" data-module-index="' + index + '" aria-label="Review completed module ' + (index + 1) + ': ' + escapeHtml(step.title) + '"><strong>' + escapeHtml(step.title) + '</strong><small>' + escapeHtml(status) + '</small></button>'
      : '<div><strong>' + escapeHtml(step.title) + '</strong><small>' + escapeHtml(status) + '</small></div>';
    return '<li class="' + (complete ? 'is-complete ' : '') + (active ? 'is-active ' : '') + (complete && !active ? 'is-reviewable' : '') + '"' + (active ? ' aria-current="step"' : '') + '><span>' + (complete ? '✓' : index + 1) + '</span>' + details + '</li>';
  };

  const courseModuleStripWithFinalExam = () => {
    const modules = COURSE.steps.map((step, index) => moduleProgressItem(step, index, true)).join('');
    const examActive = isFinalExamPhase() && !isReviewingModule();
    const examComplete = Boolean(state.progress.finalExam.completed);
    const examStatus = examActive
      ? taskLabel()
      : examComplete
        ? 'Completed'
        : 'Available after module ' + COURSE.steps.length;
    const examItem = '<li class="course-module-exam ' + (examComplete ? 'is-complete ' : '') + (examActive ? 'is-active' : '') + '"><span>' + (examComplete ? '✓' : COURSE.steps.length + 1) + '</span><div><strong>' + escapeHtml(finalExam().title || 'Final exam') + '</strong><small>' + escapeHtml(examStatus) + '</small></div></li>';
    return '<nav class="course-module-strip" aria-label="' + (state.preferences.visibleProgress ? 'Course progress' : 'Course module navigation') + '"><div class="course-module-strip-heading"><p class="course-eyebrow">' + (state.preferences.visibleProgress ? 'Course progress' : 'Course modules') + '</p><span>' + COURSE.steps.length + ' small modules · one final exam</span></div><ol class="course-module-list">' + modules + examItem + '</ol></nav>';
  };

  const courseNextStepCopy = () => {
    if (isReviewingModule()) return 'Return to your saved current task';
    return ({
    preview: 'Read the short explanation',
    read: 'Type the first lesson section',
    type: 'Complete the lesson typing',
    check: 'Use the idea in a small situation',
    apply: 'Mark this step complete',
    complete: isLastStep() ? 'Start the final exam' : 'Preview the next short step',
    'exam-intro': 'Start the first exam question',
    exam: state.progress.finalExam.submitted
      ? state.progress.finalExam.questionIndex === finalExamQuestionCount() - 1 ? 'See your final results' : 'Move to the next question'
      : 'Submit your selected answer',
    'exam-results': 'Return to your learning overview'
    }[state.progress.phase] || 'Continue learning');
  };

  const courseReturnLocation = () => {
    if (isReviewingModule()) {
      const savedStep = COURSE.steps[state.progress.lessonIndex];
      return savedStep.title + ' · ' + savedTaskLabel();
    }
    if (state.progress.phase === 'exam') return 'Final exam · Question ' + (state.progress.finalExam.questionIndex + 1) + ' of ' + finalExamQuestionCount();
    if (state.progress.phase === 'exam-intro') return 'Final exam · Ready to begin';
    if (state.progress.phase === 'exam-results') return 'Final exam · Results and review';
    return currentStep().title + ' · ' + taskLabel();
  };

  const courseProgressWithFinalExam = () => {
    if (!isFinalExamPhase()) return courseProgressBar();
    const exam = state.progress.finalExam;
    const total = finalExamQuestionCount();
    const answered = exam.answers.filter((answer) => Number.isInteger(answer)).length;
    const progress = state.progress.phase === 'exam-results' ? total : state.progress.phase === 'exam' ? Math.min(exam.questionIndex + (exam.submitted ? 1 : 0), total) : 0;
    const status = state.progress.phase === 'exam-results'
      ? 'Results are ready'
      : state.progress.phase === 'exam'
        ? 'Question ' + (exam.questionIndex + 1) + ' of ' + total
        : 'Ready when you are';
    return '<section class="course-progress-panel" aria-label="Learning progress"><div><p>Course progress</p><strong>Final exam</strong><span>One calm question at a time</span></div><div class="course-progress-bars"><div><span>Final exam · ' + escapeHtml(status) + '</span><progress value="' + progress + '" max="' + total + '">' + progress + ' of ' + total + '</progress></div><div><span>Course modules · ' + state.progress.completedSteps.length + ' lessons completed</span><progress value="' + state.progress.completedSteps.length + '" max="' + COURSE.steps.length + '">' + state.progress.completedSteps.length + ' of ' + COURSE.steps.length + '</progress></div><div><span>Answers saved · ' + answered + ' of ' + total + '</span><progress value="' + answered + '" max="' + total + '">' + answered + ' of ' + total + '</progress></div></div></section>';
  };

  const selectedCourseLayout = () => {
    const layout = learningChoices().layout;
    return ['focused', 'balanced', 'open'].includes(layout) ? layout : 'balanced';
  };

  const courseHeaderMarkup = (layout) => {
    const isBalanced = layout === 'balanced';
    return '<button class="course-back-button" type="button" data-action="dashboard">&larr; Back to learning overview</button><header class="course-heading"><div><p class="course-eyebrow">' + escapeHtml(isReviewingModule() ? COURSE.label : isFinalExamPhase() ? 'Course final exam' : COURSE.label) + '</p><h1 id="course-course-title" tabindex="-1">' + escapeHtml(COURSE.title) + '</h1>' + (isBalanced ? '' : '<p class="course-step-meta">' + currentStepSummary() + '</p>') + '</div>' + (isBalanced ? '' : '<span class="course-saved-status" data-save-status>' + (state.storageAvailable ? 'Saved locally' : 'Saving unavailable') + '</span>') + '</header>';
  };

  const courseNowPanelMarkup = () => '<section class="course-now-panel"><div><span>What am I doing?</span><strong>' + escapeHtml(taskLabel()) + '</strong></div><div><span>What is next?</span><strong>' + escapeHtml(courseNextStepCopy()) + '</strong></div><div><span>Can I pause?</span><strong>Use Pause &amp; save in the top bar.</strong></div></section>';

  const renderCourseWithFinalExam = () => {
    const layout = selectedCourseLayout();
    const focused = layout === 'focused';
    const balanced = layout === 'balanced';
    const shellClass = 'course-learning-shell course-learning-shell--' + layout + (mascotCanAppear() ? ' has-course-mascot' : '');
    const context = focused ? '' : courseHeaderMarkup(layout) + (balanced ? '' : courseNowPanelMarkup());
    const taskProgress = focused || balanced ? '' : courseProgressWithFinalExam();
    return '<main class="course-learning" id="course-main"><div class="' + shellClass + '">' + (focused ? '' : courseModuleStripWithFinalExam()) + '<section class="course-workspace course-workspace--' + layout + '">' + context + renderTask() + taskProgress + '</section>' + courseMascotMarkup('lesson') + '</div></main>' + renderModal();
  };

  const renderSavedWithFinalExam = () => '<main class="course-dashboard" id="course-main">' + dashboardWithMascot('<div class="course-panel-page"><button class="course-back-button" type="button" data-action="dashboard">&larr; Back to learning overview</button><p class="course-eyebrow">Saved lessons</p><h1>Your learning is waiting in one clear place.</h1><p class="course-lead">The course returns to the current small task, along with your response and support choices in this browser.</p><article class="saved-card"><span class="course-status">Saved locally</span><h2>' + escapeHtml(COURSE.title) + '</h2><p>' + escapeHtml(courseReturnLocation()) + '</p><div><button class="course-primary-button" type="button" data-action="continue-course">Return to this step <span aria-hidden="true">→</span></button></div></article></div>', 'saved') + '</main>';

  const readingSections = () => {
    const content = currentStep().content;
    if (!content) return (currentStep().read || []).map((value, index) => ({ heading: index === 0 ? 'Key idea' : '', value }));
    return [
      { heading: content.definitionHeading, value: content.definition },
      { heading: content.dailyLifeHeading, value: content.dailyLife },
      { heading: content.strengthsHeading, value: content.strengths },
      { heading: content.challengesHeading, value: content.challenges },
      { heading: content.supportsHeading, value: content.supports }
    ].filter(({ heading, value }) => Boolean(heading && value));
  };

  const smallerSectionsAreActive = () => Boolean(
    state.preferences.smallerSections
      && state.progress.phase === 'read'
      && !isReviewingModule()
  );

  const currentReadingSectionIndex = () => {
    const total = readingSections().length;
    if (!total) return 0;
    return Math.min(Math.max(0, Number(state.readingSectionIndex) || 0), total - 1);
  };

  const visibleReadingSections = () => {
    const sections = readingSections();
    if (!smallerSectionsAreActive()) return sections;
    return sections.slice(currentReadingSectionIndex(), currentReadingSectionIndex() + 1);
  };

  const contentTransitionsAreEnabled = () => effectiveAnimationLevel() !== 'still';

  const authoredAdditionalExamples = () => {
    const step = currentStep() || {};
    const values = [];
    const add = (candidate) => {
      if (Array.isArray(candidate)) candidate.forEach(add);
      else if (typeof candidate === 'string' && candidate.trim()) values.push(candidate.trim());
    };
    // These are explicit curriculum fields that a future reviewed lesson may
    // provide. A support bullet is not silently repurposed as a second example.
    add(step.additionalExample);
    add(step.additionalExamples);
    add(step.examples);
    add(step.content?.additionalExample);
    add(step.content?.additionalExamples);
    const primary = String(step.example || '').trim();
    return [...new Set(values)].filter((value) => value !== primary);
  };

  const exampleCardsMarkup = (narrationState) => {
    const first = String(currentStep()?.example || '').trim();
    const card = (label, value) => '<aside class="course-example" aria-label="' + escapeHtml(label) + '">' + readingTextMarkup('strong', label, narrationState) + readingTextMarkup('p', value, narrationState) + '</aside>';
    const additional = authoredAdditionalExamples().map((value, index) => card(index === 0 ? 'Another example' : 'Additional example ' + (index + 1), value));
    return [first ? card('Example', first) : '', ...additional].join('');
  };

  const readingSectionProgress = () => {
    if (!smallerSectionsAreActive()) return '';
    const total = readingSections().length;
    const index = currentReadingSectionIndex();
    return '<p class="course-reading-section-progress" aria-live="polite">Small section ' + (index + 1) + ' of ' + total + '. Finish this part, then choose the next section.</p>';
  };

  const readingTaskActions = () => {
    const exampleControl = state.preferences.extraExamples
      ? ''
      : '<button class="course-secondary-button" type="button" data-action="show-example">' + (shouldShowExample() ? 'Hide examples' : 'Show examples') + '</button>';
    if (!smallerSectionsAreActive()) return exampleControl + '<button class="course-primary-button" type="button" data-action="read-complete">Continue <span aria-hidden="true">→</span></button>';
    const index = currentReadingSectionIndex();
    const total = readingSections().length;
    const previous = index > 0
      ? '<button class="course-secondary-button" type="button" data-action="previous-reading-section">Previous section</button>'
      : '';
    const example = exampleControl;
    const primary = index < total - 1
      ? '<button class="course-primary-button" type="button" data-action="next-reading-section">Next section <span aria-hidden="true">→</span></button>'
      : '<button class="course-primary-button" type="button" data-action="read-complete">Continue <span aria-hidden="true">→</span></button>';
    return previous + example + primary;
  };

  const readingNarrationChunks = () => {
    const chunks = readingSections().map(({ heading, value }, index) => ({
      id: 'read-' + index,
      label: heading || 'Section ' + (index + 1),
      text: [heading, Array.isArray(value) ? value.join('. ') : value].filter(Boolean).join('. ')
    }));
    if (shouldShowSimple()) chunks.push({ id: 'simple', label: 'A simpler way to say it', text: 'A simpler way to say it. ' + currentStep().simple });
    if (shouldShowExample()) {
      const primary = String(currentStep()?.example || '').trim();
      if (primary) chunks.push({ id: 'example', label: 'Example', text: 'Example. ' + primary });
      authoredAdditionalExamples().forEach((value, index) => {
        const label = index === 0 ? 'Another example' : 'Additional example ' + (index + 1);
        chunks.push({ id: 'example-extra-' + index, label, text: label + '. ' + value });
      });
    }
    return chunks.filter((chunk) => chunk.text);
  };

  const renderedNarrationChunks = () => Array.from(app.querySelectorAll('[data-narration-text][data-narration-index]'))
    .sort((first, second) => Number(first.dataset.narrationIndex) - Number(second.dataset.narrationIndex))
    .map((element, index) => {
      const parent = element.closest('.course-reading-section, .course-simple-copy, .course-example');
      const label = parent?.querySelector('h3, strong')?.textContent?.trim() || 'Lesson text';
      return {
        id: 'read-' + index,
        label,
        text: (element.dataset.narrationSource || element.textContent).trim()
      };
    })
    .filter((chunk) => chunk.text);

  const narrationChunkIndexes = (chunks, predicate) => (Array.isArray(chunks) ? chunks : []).reduce((indexes, chunk, index) => {
    if (predicate(String(chunk?.text || '').trim())) indexes.push(index);
    return indexes;
  }, []);

  const mapAudioTextToNarrationChunks = (audioText, chunks) => {
    const source = String(audioText || '');
    const lowerSource = source.toLowerCase();
    let cursor = 0;
    return (Array.isArray(chunks) ? chunks : []).reduce((maps, chunk, index) => {
      const text = String(chunk?.text || '').trim();
      if (!text) return maps;
      let sourceStart = source.indexOf(text, cursor);
      if (sourceStart < 0) sourceStart = lowerSource.indexOf(text.toLowerCase(), cursor);
      if (sourceStart < 0) return maps;
      maps.push({
        index,
        sourceStart,
        sourceEnd: sourceStart + text.length,
        startOffset: Math.max(0, Number(chunk?.startOffset) || 0)
      });
      cursor = sourceStart + text.length;
      return maps;
    }, []);
  };

  const localAvaPlaylist = (chunks) => {
    if (!usesLocalAvaNarration()) return [];
    const audioKey = COURSE_AUDIO_MODULE_KEYS[displayedModuleIndex()];
    const assets = COURSE_AUDIO_MANIFEST.modules?.[audioKey];
    if (!assets?.read) return [];
    const step = currentStep();
    const readText = [step.title, ...sourceReadSections(step)].filter(Boolean).join(' ');
    const simpleLabel = 'A simpler way to say it';
    const simpleText = String(step.simple || '').trim();
    const exampleText = String(step.example || '').trim();
    const additionalExampleTexts = authoredAdditionalExamples();
    const exampleLabels = ['Example', 'Another example', ...additionalExampleTexts.slice(1).map((_, index) => 'Additional example ' + (index + 2))];
    const optionalExampleChunks = new Set([...exampleLabels, exampleText, ...additionalExampleTexts].filter(Boolean));
    const mainChunkIndexes = narrationChunkIndexes(chunks, (text) => text
      && text !== simpleLabel
      && text !== simpleText
      && !optionalExampleChunks.has(text));
    if (!mainChunkIndexes.length) return [];
    const mainChunks = mainChunkIndexes.map((index) => chunks[index]);
    const readMap = mapAudioTextToNarrationChunks(readText, mainChunks)
      .map((entry) => ({ ...entry, index: mainChunkIndexes[entry.index] }));
    // Never use a whole-module recording for a smaller visible section unless
    // every visible narration chunk maps back to the paired source text. If
    // authored copy changes later, browser speech can still read only the
    // rendered section instead of an unbounded recording reading ahead.
    if (smallerSectionsAreActive() && readMap.length !== mainChunkIndexes.length) return [];
    const visibleSectionEnd = smallerSectionsAreActive() && readMap.length
      ? Math.max(...readMap.map((entry) => entry.sourceEnd))
      : null;
    const playlist = [{
      src: assets.read,
      text: readText,
      chunkIndexes: mainChunkIndexes,
      // Keep source ranges tied only to text that is actually narrated. The
      // service leaves an unrendered module-title intro unhighlighted instead
      // of moving the green marker to an unrelated visible section.
      chunkMap: readMap,
      // Exact WordBoundary cues were produced with this versioned MP3, so the
      // media clock and current-word marker use the same source timeline.
      wordCues: assets.readCues,
      // The recording contains the whole module. When a learner chose smaller
      // sections, stop at the end of the visible section instead of continuing
      // into lesson text that has not been opened yet.
      stopAtSourceChar: visibleSectionEnd
    }];
    if (shouldShowSimple() && assets.simpleAddon && step.simple) {
      const simpleChunkIndexes = narrationChunkIndexes(chunks, (text) => text === simpleLabel || text === simpleText);
      if (simpleChunkIndexes.length) {
        const simpleChunks = simpleChunkIndexes.map((index) => chunks[index]);
        const simpleMap = mapAudioTextToNarrationChunks(step.simple, simpleChunks)
          .map((entry) => ({ ...entry, index: simpleChunkIndexes[entry.index] }));
        playlist.push({
          src: assets.simpleAddon,
          text: step.simple,
          chunkIndexes: simpleChunkIndexes,
          chunkMap: simpleMap,
          wordCues: assets.simpleAddonCues
        });
      }
    }
    return playlist;
  };

  const configureLocalAvaPlaylist = (service, chunks) => {
    if (typeof service?.setAudioPlaylist !== 'function') return [];
    const playlist = localAvaPlaylist(chunks);
    service.setAudioPlaylist(playlist);
    return playlist;
  };

  const narrationVoiceOptions = () => (hasLocalAvaNarration()
    ? '<option value="' + LOCAL_AVA_VOICE_URI + '">Microsoft Edge Ava (included)</option>'
    : '') + '<option value="' + SYSTEM_NARRATION_VOICE_URI + '">Device voice</option>';

  const narrationStatusCopy = () => ({
    idle: 'Ready to listen. Choose Listen, or choose a section to start there.',
    playing: 'Listening. The current section is marked in the panel.',
    paused: 'Paused. Choose Resume when you are ready.',
    finished: 'Finished. You can listen again or choose another section.',
    unsupported: 'Narration is not available in this browser. You can use your device’s usual reading support.',
    error: 'Narration could not continue. The lesson text is still available to read.'
  }[narration.status] || 'Ready to listen.');

  const narrationControls = () => '<section class="course-narration-controls" aria-label="Narration controls"><div class="course-narration-actions"><button class="course-secondary-button narration-primary-button" type="button" data-action="narration-listen" data-narration-listen>Listen</button><button class="course-secondary-button" type="button" data-action="narration-pause" data-narration-pause hidden>Pause</button><button class="course-secondary-button" type="button" data-action="narration-stop" data-narration-stop hidden>Stop</button><button class="course-text-button narration-restart" type="button" data-action="narration-restart">Restart</button></div><div class="course-narration-preferences"><label class="narration-select"><span>Playback speed</span><select data-narration-speed aria-label="Narration playback speed"><option value="0.75"' + (state.preferences.narrationSpeed === '0.75' ? ' selected' : '') + '>0.75×</option><option value="1"' + (state.preferences.narrationSpeed === '1' ? ' selected' : '') + '>1×</option><option value="1.25"' + (state.preferences.narrationSpeed === '1.25' ? ' selected' : '') + '>1.25×</option><option value="1.5"' + (state.preferences.narrationSpeed === '1.5' ? ' selected' : '') + '>1.5×</option></select></label><label class="narration-select"><span>Voice</span><select data-narration-voice aria-label="Narration voice">' + narrationVoiceOptions() + '</select></label><label class="narration-toggle"><input type="checkbox" data-narration-autoscroll' + (state.preferences.narrationAutoScroll ? ' checked' : '') + '><span>Auto-scroll</span></label></div><p class="narration-status" data-narration-status role="status" aria-live="polite">' + escapeHtml(narrationStatusCopy()) + '</p></section>';

  const narrationChunkButton = (index, label) => '<button class="narration-chunk-button" type="button" data-action="narration-jump" data-narration-chunk-button data-narration-index="' + index + '" aria-label="Listen from ' + escapeHtml(label) + '">Listen from here</button>';

  const textToSpeechStatusCopy = () => ({
    idle: state.progress.phase === 'read' || isReviewingModule()
      ? 'Text to speech is ready. Choose Listen, or click or tap inside lesson text to start from that point.'
      : 'Text to speech is ready. Choose Listen when you want the current task read aloud.',
    playing: state.preferences.narrationHighlight === false
      ? 'Text to speech is playing. Narration highlighting is off.'
      : 'Text to speech is playing. The current word is highlighted as it is read.',
    paused: 'Text to speech is paused. Choose Resume when you are ready.',
    finished: 'Text to speech finished. You can listen again, restart, or select another section.',
    unsupported: 'Text to speech is not available in this browser. You can use your device’s usual reading support.',
    error: 'Text to speech could not continue. The lesson text is still available to read.'
  }[narration.status] || 'Text to speech is ready.');

  const textToSpeechOptions = () => '<section class="course-narration-controls" aria-label="Text to speech options"><div class="course-narration-preferences"><label class="narration-select"><span>Playback speed</span><select data-narration-speed aria-label="Text to speech playback speed"><option value="0.75"' + (state.preferences.narrationSpeed === '0.75' ? ' selected' : '') + '>0.75×</option><option value="1"' + (state.preferences.narrationSpeed === '1' ? ' selected' : '') + '>1×</option><option value="1.25"' + (state.preferences.narrationSpeed === '1.25' ? ' selected' : '') + '>1.25×</option><option value="1.5"' + (state.preferences.narrationSpeed === '1.5' ? ' selected' : '') + '>1.5×</option></select></label><label class="narration-select"><span>Voice</span><select data-narration-voice aria-label="Text to speech voice">' + narrationVoiceOptions() + '</select></label><label class="narration-toggle"><input type="checkbox" data-narration-autoscroll' + (state.preferences.narrationAutoScroll ? ' checked' : '') + '><span>Auto-scroll</span></label></div><p class="narration-status" data-narration-status role="status" aria-live="polite">' + escapeHtml(textToSpeechStatusCopy()) + '</p></section>';

  const readingTextMarkup = (tagName, value, narrationState) => {
    const interactive = Boolean(narrationState);
    if (!interactive) return '<' + tagName + '>' + escapeHtml(value) + '</' + tagName + '>';
    const index = narrationState.index++;
    return '<' + tagName + '><button class="course-narration-text" type="button" data-narration-text data-narration-index="' + index + '" aria-label="Start text to speech here: ' + escapeHtml(value) + '">' + escapeHtml(value) + '</button></' + tagName + '>';
  };

  const readingContentMarkup = (interactive = false) => {
    const narrationState = interactive ? { index: 0 } : null;
    const sections = visibleReadingSections().map(({ heading, value }) => {
      const title = readingTextMarkup('h3', heading || 'Key idea', narrationState);
      const content = Array.isArray(value)
        ? '<ul class="course-reading-list">' + value.map((item) => readingTextMarkup('li', item, narrationState)).join('') + '</ul>'
        : readingTextMarkup('p', value, narrationState);
      return '<section class="course-reading-section">' + title + content + '</section>';
    });
    if (shouldShowSimple()) {
      // Put the authored plain-language version first so enabling this support
      // changes what the learner encounters immediately instead of placing the
      // simpler wording after a long detailed explanation.
      sections.unshift('<section class="course-simple-copy">' + readingTextMarkup('strong', 'A simpler way to say it', narrationState) + readingTextMarkup('p', currentStep().simple, narrationState) + '</section>');
    }
    if (shouldShowExample()) {
      sections.push(exampleCardsMarkup(narrationState));
    }
    if (state.preferences.recap && currentStep().simple && !shouldShowSimple()) {
      sections.push('<aside class="course-recap"><strong>Quick recap</strong><p>' + escapeHtml(currentStep().simple) + '</p></aside>');
    }
    return sections.join('');
  };

  const previewTask = () => '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">Preview</p><h2 id="course-task-heading" tabindex="-1">See the path before you begin</h2><p>This step contains reading, one complete lesson section at a time to type, a quick check, and one adapted practice activity.</p></div>' + taskHeaderControls() + '</div><div class="course-reading-copy"><section class="course-reading-section"><h3>Objective</h3><p>Understand one respectful idea from “' + escapeHtml(currentStep().title) + '” and use it in a small situation.</p></section><section class="course-reading-section"><h3>What stays in your control</h3><p>You can pause, use support controls, use your usual compatible input tools, or ask for help. There are no countdown timers, speed scores, or autoplay audio.</p></section><section class="course-reading-section"><h3>Completion</h3><p>Read, type each lesson section one at a time, check understanding, and choose a practical response.</p></section></div><div class="course-task-actions"><button class="course-primary-button" type="button" data-action="preview-complete">Begin this small step <span aria-hidden="true">→</span></button></div></article>';

  const readTask = () => '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">Learn</p><h2 id="course-task-heading" tabindex="-1">Read this short explanation</h2><p>' + (smallerSectionsAreActive() ? 'Read one small section at a time. You decide when to move to the next part.' : 'Read at your own pace. Move on when the explanation feels clear enough.') + '</p></div>' + taskHeaderControls() + '</div>' + readingSectionProgress() + '<div class="course-reading-copy" data-structured="true">' + readingContentMarkup(false) + '</div><div class="course-task-actions">' + readingTaskActions() + '</div></article>';

  const readTaskWithTextToSpeech = () => '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">Learn</p><h2 id="course-task-heading" tabindex="-1">Read this short explanation</h2><p>Text to speech mode is on. Click or tap inside the text where you want it to begin, or focus a text part and press Enter or Space. The current word is highlighted as it is read.</p></div>' + taskHeaderControls() + '</div>' + readingSectionProgress() + '<div class="course-reading-copy course-tts-reading" data-narration-content data-structured="true">' + readingContentMarkup(true) + '</div><div class="course-task-actions">' + readingTaskActions() + '</div></article>';

  const reviewModuleTask = () => {
    const interactive = Boolean(state.preferences.readAloud);
    return '<article class="course-task-card course-review-card"><div class="course-task-top"><div><p class="course-task-label">Completed module review</p><h2 id="course-task-heading" tabindex="-1">' + escapeHtml(currentStep().title) + '</h2><p>You are reviewing a completed module. Your current task is still saved and will be ready when you return.</p></div>' + taskHeaderControls() + '</div><div class="course-reading-copy' + (interactive ? ' course-tts-reading' : '') + '"' + (interactive ? ' data-narration-content' : '') + ' data-structured="true">' + readingContentMarkup(interactive) + '</div><div class="course-task-actions"><button class="course-primary-button" type="button" data-action="return-from-module-review">Return to current task <span aria-hidden="true">→</span></button></div></article>';
  };

  const inputMethodLabels = {
    keyboard: 'Keyboard typing',
    voice: 'Voice input',
    alternative: 'Alternative response when available',
    switch: 'Switch-friendly keyboard controls',
    'one-handed': 'One-handed keyboard layout'
  };
  const inputMethodSelector = () => {
    if (!typingIsConceptResponse()) return '';
    const methods = availableInputMethods();
    if (methods.length < 2) return '';
    const active = activeInputMethod();
    return '<label class="course-input-method-select"><span>Active input method</span><select data-active-input-method aria-describedby="course-input-method-help">' + methods.map((method) => '<option value="' + escapeHtml(method) + '"' + (method === active ? ' selected' : '') + '>' + escapeHtml(inputMethodLabels[method] || method) + '</option>').join('') + '</select><small id="course-input-method-help">One method is active at a time. Other selected methods stay available when a task supports them.</small></label>';
  };
  const typingTarget = () => {
    const typing = currentStep().typing;
    if (usesLessonSectionTyping()) {
      const { section, index, total } = activeLessonTypingSection();
      return inputMethodSelector() + '<div class="guided-typing lesson-section-typing"><span>Section ' + (index + 1) + ' of ' + total + '</span><p class="typing-target">' + escapeHtml(section.text) + '</p></div>';
    }
    if (typing.level !== 'Guided typing') return inputMethodSelector() + '<p class="typing-target">' + escapeHtml(typing.target || '') + '</p>';
    const phraseIndex = Math.min(state.progress.attempt.guidedIndex, typing.phrases.length - 1);
    return inputMethodSelector() + '<div class="guided-typing"><span>Phrase ' + (phraseIndex + 1) + ' of ' + typing.phrases.length + '</span><p class="typing-target">' + escapeHtml(typing.phrases[phraseIndex]) + '</p></div>';
  };

  // This is deliberately visual rather than an aria-live announcement: it can
  // change as someone types without repeatedly interrupting a screen reader.
  // It gives the encouraging, in-the-moment reassurance selected by the
  // learner while leaving the typing mechanism itself calm and predictable.
  const remainingTypingWords = (response = state.progress.attempt.response || '') => {
    const referenceWords = (activeTypingReference() || '').trim().split(/\s+/).filter(Boolean);
    const typed = response.trim();
    if (!referenceWords.length || !typed) return referenceWords.length;
    // A partly typed final word is still the learner's current word, rather
    // than a false claim that it has been completed. This keeps the estimate
    // encouraging and honest without tracking keystrokes for scoring.
    const completedWords = typed.endsWith(' ') ? typed.split(/\s+/).filter(Boolean).length : Math.max(0, typed.split(/\s+/).filter(Boolean).length - 1);
    return Math.max(0, referenceWords.length - completedWords);
  };

  const typingMomentumCopy = (response = state.progress.attempt.response || '') => {
    const level = selectedEncouragementLevel();
    if (level === 'subtle') return '';
    const urdu = supportLanguage() === 'urdu';
    const referenceLength = Math.max(1, Array.from(activeTypingReference() || '').length);
    const ratio = Math.min(1, Array.from(response).length / referenceLength);
    const wordsLeft = remainingTypingWords(response);
    const messages = urdu ? {
      start: level === 'expressive' ? 'آپ یہ کر سکتے ہیں۔ پہلے لفظ سے شروع کریں۔' : 'آپ یہ کر سکتے ہیں۔ ایک لفظ سے شروع کریں۔',
      early: level === 'expressive' ? 'بہت خوب — آپ آگے بڑھ رہے ہیں۔' : 'اچھی شروعات۔',
      middle: level === 'expressive' ? 'آپ بہت اچھا کر رہے ہیں۔ ایک وقت میں ایک لفظ۔' : 'آپ اچھا کر رہے ہیں۔',
      near: level === 'expressive'
        ? 'بس ' + Math.max(1, wordsLeft) + ' لفظ باقی ہیں — آپ یہ حصہ مکمل کرنے والے ہیں۔'
        : 'بس ' + Math.max(1, wordsLeft) + ' لفظ باقی ہیں۔'
    } : {
      start: level === 'expressive' ? 'You can do this. Start with the first word.' : 'You can do this. Start with one word.',
      early: level === 'expressive' ? 'Nice work — you are already moving forward.' : 'Nice start.',
      middle: level === 'expressive' ? 'You are doing amazing. One word at a time.' : 'You are doing well.',
      near: level === 'expressive'
        ? 'Just ' + Math.max(1, wordsLeft) + ' word' + (wordsLeft === 1 ? '' : 's') + ' to go — you are about to clear this section.'
        : 'Just ' + Math.max(1, wordsLeft) + ' word' + (wordsLeft === 1 ? '' : 's') + ' to go.'
    };
    if (!response) return messages.start;
    if (ratio >= .78) return messages.near;
    if (ratio >= .38) return messages.middle;
    return messages.early;
  };

  const typingMomentumStage = (response = state.progress.attempt.response || '') => {
    const referenceLength = Math.max(1, Array.from(activeTypingReference() || '').length);
    const ratio = Math.min(1, Array.from(response).length / referenceLength);
    if (!response) return 'start';
    if (ratio >= .78) return 'near';
    if (ratio >= .38) return 'middle';
    return 'early';
  };

  const typingMomentumMarkup = () => {
    const copy = typingMomentumCopy();
    return copy
      ? '<p class="course-typing-momentum" data-typing-momentum data-momentum-stage="' + typingMomentumStage() + '" aria-live="off">' + escapeHtml(copy) + '</p>'
      : '';
  };

  const typingTask = () => {
    const typing = currentStep().typing;
    const attempt = state.progress.attempt;
    const sectionTyping = usesLessonSectionTyping();
    const activeSection = sectionTyping ? activeLessonTypingSection() : null;
    const voiceInputAvailable = typingAllowsVoiceInput();
    const responseLabel = voiceInputAvailable ? 'Type or speak your response' : 'Type your response';
    const inputHelp = voiceInputAvailable
      ? 'Use the microphone beside the response field to speak, or type your response. Speech input starts only when you choose the microphone.'
      : typing.level === 'Recall typing'
        ? 'Use your own words. Your response is not ranked or scored for speed.'
        : 'Paste is blocked in keyboard practice. Press Enter to check this response. Use Shift+Enter for a new line.';
    const feedback = attempt.feedback ? '<p class="typing-feedback" role="alert">' + escapeHtml(attempt.feedback) + '</p>' : '';
    const integrity = attempt.integrityNotice ? '<p class="integrity-note">A large amount of text appeared at once. That is okay—this course will use a short understanding check rather than a speed score.</p>' : '';
    const label = sectionTyping ? 'Lesson typing · section ' + (activeSection.index + 1) + ' of ' + activeSection.total : typing.level;
    const title = sectionTyping ? activeSection.section.heading : 'Make one idea visible';
    const prompt = sectionTyping ? 'Type the complete section below. Take the time you need.' : typing.prompt;
    const note = sectionTyping ? 'This is one complete part of the lesson. It is not ranked or scored for speed.' : 'Use this space to show your thinking. It is not ranked or scored for speed.';
    const nextAction = sectionTyping && activeSection.index < activeSection.total - 1
      ? 'Check this section'
      : sectionTyping
        ? 'Continue to quick check'
        : typing.level === 'Guided typing' && attempt.guidedIndex < typing.phrases.length - 1
          ? 'Check this phrase'
          : typing.level === 'Recall typing' ? 'Review my explanation' : 'Check my sentence';
    return '<article class="course-task-card course-typing-task"><div class="course-typing-body"><div class="course-task-top"><div><p class="course-task-label">' + escapeHtml(label) + '</p><h2 id="course-task-heading" tabindex="-1">' + escapeHtml(title) + '</h2><p>' + escapeHtml(prompt) + '</p></div>' + taskHeaderControls() + '</div><div class="typing-practice"><p class="typing-note">' + escapeHtml(note) + '</p>' + typingMomentumMarkup() + typingTarget() + '<label class="course-input-label" for="course-typing-input">' + responseLabel + '</label><textarea id="course-typing-input" data-typing-input rows="4" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="' + escapeHtml(typing.placeholder || 'Type the visible section here…') + '" aria-describedby="typing-help">' + escapeHtml(attempt.response) + '</textarea><p id="typing-help" class="course-input-help">' + inputHelp + '</p>' + integrity + feedback + '</div></div><div class="course-task-actions"><button class="course-primary-button" type="button" data-action="check-typing">' + nextAction + ' <span aria-hidden="true">→</span></button></div></article>';
  };

  const checkTask = () => {
    const check = currentStep().check;
    const selected = state.progress.attempt.selectedAnswer;
    const feedback = state.progress.attempt.feedback;
    return '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">Quick check</p><h2 id="course-task-heading" tabindex="-1">Check understanding</h2><p>Choose the answer that best matches the short explanation.</p></div>' + taskHeaderControls() + '</div>' + (state.progress.attempt.integrityNotice ? '<p class="integrity-note">This quick check keeps the focus on understanding, not on how text entered the box.</p>' : '') + '<fieldset class="course-check-options"><legend>' + escapeHtml(check.question) + '</legend>' + check.options.map(([label, correct], index) => '<label class="course-check-option' + (selected === String(index) ? ' is-selected' : '') + '"><input type="radio" name="course-check" value="' + index + '" data-check-answer' + (selected === String(index) ? ' checked' : '') + '><span>' + escapeHtml(label) + '</span></label>').join('') + '</fieldset>' + (feedback ? '<p class="check-feedback" role="alert">' + escapeHtml(feedback) + '</p>' : '') + '<div class="course-task-actions">' + (feedback && selected && !check.options[Number(selected)][1] ? '<button class="course-secondary-button" type="button" data-action="return-to-read">Read this step again</button><button class="course-secondary-button" type="button" data-action="simple-read">Explain more simply</button>' : '') + '<button class="course-primary-button" type="button" data-action="submit-check"' + (selected === '' ? ' disabled' : '') + '>Check understanding <span aria-hidden="true">→</span></button></div></article>';
  };

  const practiceSupport = () => currentStep().content?.supports?.[0] || currentStep().example || 'Ask the learner what would help with the task.';
  const applyTask = () => {
    const selected = state.progress.attempt.selectedAnswer;
    const choices = [[practiceSupport(), true], ['Assume one support will work for everyone.', false], ['Make the learner explain or prove a diagnosis before offering support.', false], ['Withhold support until the learner finishes the task alone.', false]];
    const feedback = state.progress.attempt.feedback;
    return '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">Adapted practice</p><h2 id="course-task-heading" tabindex="-1">Use the idea in a small situation</h2><p>A learner is working on a similar task. Which response best uses the idea from this module?</p></div>' + taskHeaderControls() + '</div><fieldset class="course-check-options"><legend>Choose one practical response.</legend>' + choices.map(([label], index) => '<label class="course-check-option' + (selected === String(index) ? ' is-selected' : '') + '"><input type="radio" name="course-apply" value="' + index + '" data-apply-answer' + (selected === String(index) ? ' checked' : '') + '><span>' + escapeHtml(label) + '</span></label>').join('') + '</fieldset>' + (feedback ? '<p class="check-feedback" role="alert">' + escapeHtml(feedback) + '</p>' : '') + '<div class="course-task-actions"><button class="course-primary-button" type="button" data-action="submit-apply"' + (selected === '' ? ' disabled' : '') + '>Finish this step <span aria-hidden="true">→</span></button></div></article>';
  };

  const taskOptionState = (index, selected, correctIndex, submitted) => {
    if (!submitted) return index === selected ? ' is-selected' : '';
    if (index === correctIndex) return ' is-correct' + (index === selected ? ' is-selected' : '');
    return index === selected ? ' is-incorrect is-selected' : '';
  };

  const taskOptionFeedback = (index, selected, correctIndex, submitted) => {
    if (!submitted) return '';
    if (index === correctIndex && index === selected) return '<span class="course-answer-state">✓ Correct</span>';
    if (index === correctIndex) return '<span class="course-answer-state">✓ Correct answer</span>';
    if (index === selected) return '<span class="course-answer-state">Not correct</span>';
    return '';
  };

  const renderedTaskOptions = (options, name, dataAttribute) => {
    const selected = state.progress.attempt.selectedAnswer === '' ? null : Number(state.progress.attempt.selectedAnswer);
    const correctIndex = options.findIndex(([, correct]) => correct);
    const submitted = Boolean(state.progress.attempt.submitted);
    return options.map(([label], index) => '<label class="course-check-option' + taskOptionState(index, selected, correctIndex, submitted) + '"><input type="radio" name="' + name + '" value="' + index + '" ' + dataAttribute + (index === selected ? ' checked' : '') + (submitted ? ' disabled' : '') + '><span>' + escapeHtml(label) + '</span>' + taskOptionFeedback(index, selected, correctIndex, submitted) + '</label>').join('');
  };

  const checkTaskWithFeedback = () => {
    const check = currentStep().check;
    const selected = state.progress.attempt.selectedAnswer === '' ? null : Number(state.progress.attempt.selectedAnswer);
    const correctIndex = check.options.findIndex(([, correct]) => correct);
    const submitted = Boolean(state.progress.attempt.submitted);
    const correct = submitted && selected === correctIndex;
    const feedback = submitted ? savedSupportMarkup(correct ? 'answer-correct' : 'answer-incorrect', { result: 'quick-check' }) : '';
    const actions = !submitted
      ? '<button class="course-primary-button" type="button" data-action="submit-check"' + (selected === null ? ' disabled' : '') + '>Submit answer <span aria-hidden="true">→</span></button>'
      : correct
        ? '<button class="course-primary-button" type="button" data-action="continue-check">Continue <span aria-hidden="true">→</span></button>'
        : '<button class="course-secondary-button" type="button" data-action="retry-question">Choose another answer</button><button class="course-secondary-button" type="button" data-action="return-to-read">Read this step again</button><button class="course-secondary-button" type="button" data-action="simple-read">Explain more simply</button>';
    return '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">Quick check</p><h2 id="course-task-heading" tabindex="-1">Check understanding</h2><p>Choose the answer that best matches the short explanation.</p></div>' + taskHeaderControls() + '</div>' + (state.progress.attempt.integrityNotice ? '<p class="integrity-note">This quick check keeps the focus on understanding, not on how text entered the box.</p>' : '') + '<fieldset class="course-check-options' + (submitted ? ' is-submitted' : '') + '"><legend>' + escapeHtml(check.question) + '</legend>' + renderedTaskOptions(check.options, 'course-check', 'data-check-answer') + '</fieldset>' + feedback + '<div class="course-task-actions">' + actions + '</div></article>';
  };

  const applyTaskWithFeedback = () => {
    const choices = [[practiceSupport(), true], ['Assume one support will work for everyone.', false], ['Make the learner explain or prove a diagnosis before offering support.', false], ['Withhold support until the learner finishes the task alone.', false]];
    const selected = state.progress.attempt.selectedAnswer === '' ? null : Number(state.progress.attempt.selectedAnswer);
    const correctIndex = choices.findIndex(([, correct]) => correct);
    const submitted = Boolean(state.progress.attempt.submitted);
    const correct = submitted && selected === correctIndex;
    const feedback = submitted ? savedSupportMarkup(correct ? 'answer-correct' : 'answer-incorrect', { result: 'applied-practice' }) : '';
    const actions = !submitted
      ? '<button class="course-primary-button" type="button" data-action="submit-apply"' + (selected === null ? ' disabled' : '') + '>Submit answer <span aria-hidden="true">→</span></button>'
      : correct
        ? '<button class="course-primary-button" type="button" data-action="continue-apply">Complete this step <span aria-hidden="true">→</span></button>'
        : '<button class="course-secondary-button" type="button" data-action="retry-question">Choose another answer</button>';
    return '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">Adapted practice</p><h2 id="course-task-heading" tabindex="-1">Use the idea in a small situation</h2><p>A learner is working on a similar task. Which response best uses the idea from this module?</p></div>' + taskHeaderControls() + '</div><fieldset class="course-check-options' + (submitted ? ' is-submitted' : '') + '"><legend>Which response best uses the idea from this module?</legend>' + renderedTaskOptions(choices, 'course-apply', 'data-apply-answer') + '</fieldset>' + feedback + '<div class="course-task-actions">' + actions + '</div></article>';
  };

  const completeTask = () => '<article class="course-task-card course-complete-card"><div class="completion-mark" aria-hidden="true">✓</div><p class="course-task-label">Progress update</p><h2 id="course-task-heading" tabindex="-1">One small step complete.</h2><p>' + (isLastStep() ? 'You have reached the end of this prototype course. Your completed steps and settings are saved locally.' : 'Your progress is saved. You can come back whenever you are ready, or continue to the next short step.') + '</p><div class="course-task-actions"><button class="course-secondary-button" type="button" data-action="save-exit">Save and exit</button><button class="course-primary-button" type="button" data-action="next-step">' + (isLastStep() ? 'Return to learning overview' : 'Continue to step ' + (state.progress.lessonIndex + 2)) + ' <span aria-hidden="true">→</span></button></div></article>';

  const finalModuleCompleteTask = () => '<article class="course-task-card course-complete-card"><div class="completion-mark" aria-hidden="true">✓</div><p class="course-task-label">Course modules complete</p><h2 id="course-task-heading" tabindex="-1">The 11 learning modules are complete.</h2><p>Your completed modules and settings are saved locally. When you are ready, complete the final exam one question at a time. It has ' + finalExamQuestionCount() + ' questions and no timer.</p><div class="course-task-actions"><button class="course-secondary-button" type="button" data-action="save-exit">Save and exit</button><button class="course-primary-button" type="button" data-action="start-final-exam">Start final exam <span aria-hidden="true">→</span></button></div></article>';

  const completionTask = () => isLastStep() ? finalModuleCompleteTask() : completeTask();

  const examOptionState = (index, selected, correctIndex, submitted) => {
    if (!submitted) return index === selected ? ' is-selected' : '';
    if (index === correctIndex) return ' is-correct' + (index === selected ? ' is-selected' : '');
    return index === selected ? ' is-incorrect is-selected' : '';
  };

  const examOptionFeedback = (index, selected, correctIndex, submitted) => {
    if (!submitted) return '';
    if (index === correctIndex && index === selected) return '<span class="exam-answer-state">✓ Correct</span>';
    if (index === correctIndex) return '<span class="exam-answer-state">✓ Correct answer</span>';
    if (index === selected) return '<span class="exam-answer-state">Not correct</span>';
    return '';
  };

  const finalExamIntroTask = () => '<article class="course-task-card course-final-exam exam-intro-card"><div class="course-task-top"><div><p class="course-task-label">Final exam</p><h2 id="course-task-heading" tabindex="-1">Finish with one question at a time.</h2><p>' + escapeHtml(finalExam().description || 'Use what you learned across the course.') + '</p></div>' + taskHeaderControls() + '</div><p>This is a calm review of the course. There are ' + finalExamQuestionCount() + ' multiple-choice questions, each with four choices. There is no timer, speed score, or ranking.</p><p>Your progress is saved after each choice. You can pause and return to the same question whenever you need.</p><div class="course-task-actions"><button class="course-secondary-button" type="button" data-action="save-exit">Save and exit</button><button class="course-primary-button" type="button" data-action="start-final-exam">Start final exam <span aria-hidden="true">→</span></button></div></article>';

  const finalExamQuestionTask = () => {
    const exam = state.progress.finalExam;
    const question = currentFinalExamQuestion();
    if (!question) return '<article class="course-task-card course-final-exam"><p class="course-task-label">Final exam</p><h2 id="course-task-heading" tabindex="-1">The final exam is not available.</h2><p>Please return to the course overview and try again.</p><div class="course-task-actions"><button class="course-primary-button" type="button" data-action="dashboard">Return to learning overview</button></div></article>';
    const selected = exam.answers[exam.questionIndex];
    const correctIndex = question.options.findIndex(([, correct]) => correct);
    const submitted = Boolean(exam.submitted);
    const feedback = submitted ? savedSupportMarkup(selected === correctIndex ? 'answer-correct' : 'answer-incorrect', { result: 'exam' }, 'exam-feedback') : '';
    const action = submitted
      ? '<button class="course-primary-button" type="button" data-action="next-exam-question">' + (exam.questionIndex === finalExamQuestionCount() - 1 ? 'See final results' : 'Next question') + ' <span aria-hidden="true">→</span></button>'
      : '<button class="course-primary-button" type="button" data-action="submit-exam-answer"' + (selected === null || typeof selected === 'undefined' ? ' disabled' : '') + '>Submit answer <span aria-hidden="true">→</span></button>';
    return '<article class="course-task-card course-final-exam"><div class="course-task-top"><div><p class="course-task-label">Final exam</p><h2 id="course-task-heading" tabindex="-1">Answer one question at a time.</h2><p>Choose the answer that best fits what you learned. You can change your choice before you submit it.</p></div>' + taskHeaderControls('One question at a time') + '</div><fieldset class="course-check-options" aria-describedby="exam-question-help' + (submitted ? ' exam-feedback' : '') + '"><legend class="exam-question-card" id="exam-question-card" tabindex="-1"><span class="exam-question-count">Question ' + (exam.questionIndex + 1) + ' of ' + finalExamQuestionCount() + '</span><strong>' + escapeHtml(question.question) + '</strong><span id="exam-question-help">Choose one answer, then submit when you are ready.</span></legend>' + question.options.map(([label], index) => '<label class="course-check-option exam-option' + examOptionState(index, selected, correctIndex, submitted) + '"><input type="radio" name="final-exam-answer" value="' + index + '" data-exam-answer' + (index === selected ? ' checked' : '') + (submitted ? ' disabled' : '') + '><span class="exam-option-copy">' + escapeHtml(label) + '</span>' + examOptionFeedback(index, selected, correctIndex, submitted) + '</label>').join('') + '</fieldset>' + feedback + '<div class="course-task-actions">' + action + '</div></article>';
  };

  const finalExamScore = () => finalExam().questions.reduce((score, question, index) => score + (state.progress.finalExam.answers[index] === question.options.findIndex(([, correct]) => correct) ? 1 : 0), 0);

  const finalExamResultsTask = () => {
    const questions = finalExam().questions;
    const score = finalExamScore();
    const total = questions.length;
    const percentage = total ? Math.round((score / total) * 100) : 0;
    const incorrect = total - score;
    const review = questions.map((question, index) => {
      const selected = state.progress.finalExam.answers[index];
      const correctIndex = question.options.findIndex(([, correct]) => correct);
      const isCorrect = selected === correctIndex;
      const selectedLabel = Number.isInteger(selected) && question.options[selected] ? question.options[selected][0] : 'No answer recorded';
      return '<li class="' + (isCorrect ? 'is-correct' : 'is-incorrect') + '"><h3>Question ' + (index + 1) + ': ' + escapeHtml(question.question) + '</h3><p>Your answer: <span class="exam-answer-state">' + escapeHtml(selectedLabel) + (isCorrect ? ' · Correct' : ' · Not correct') + '</span></p><p>Correct answer: <strong>' + escapeHtml(question.options[correctIndex][0]) + '</strong></p></li>';
    }).join('');
    return '<article class="course-task-card course-final-exam exam-results-card"><div class="course-task-top"><div><p class="course-task-label">Final exam results</p><h2 id="course-task-heading" tabindex="-1">Your course review is complete.</h2><p>Your score is based only on the answers you selected. It does not use time, typing speed, or your support settings.</p></div>' + taskHeaderControls('Saved locally') + '</div><section class="exam-score" aria-label="Final exam score"><strong class="exam-score-value">' + score + '/' + total + '</strong><div><p>' + percentage + '% correct</p><span>' + score + ' correct · ' + incorrect + ' incorrect</span></div></section><section aria-labelledby="exam-review-heading"><h3 id="exam-review-heading">Question-by-question review</h3><p>Review what you selected and the correct answer for each question.</p><ol class="exam-review-list">' + review + '</ol></section><div class="course-task-actions"><button class="course-primary-button" type="button" data-action="return-course">Return to learning overview <span aria-hidden="true">→</span></button></div></article>';
  };

  const activeTypingReference = () => {
    const typing = currentStep().typing;
    if (usesLessonSectionTyping()) return activeLessonTypingSection().section.text || '';
    if (typing.level === 'Guided typing') {
      return typing.phrases[Math.min(state.progress.attempt.guidedIndex, typing.phrases.length - 1)] || '';
    }
    return typing.target || typing.reference || '';
  };

  const renderTypingCharacters = (reference, response, animatedIndex = -1) => {
    const referenceCharacters = Array.from(reference);
    const responseCharacters = Array.from(response);
    const visualCaret = '<span class="typing-caret" aria-hidden="true"></span>';
    const referenceMarkup = referenceCharacters.map((character, index) => {
      const caret = index === responseCharacters.length ? visualCaret : '';
      if (index >= responseCharacters.length) return caret + '<span class="typing-character is-pending">' + escapeHtml(character) + '</span>';
      const stateClass = responseCharacters[index] === character ? 'is-correct' : 'is-incorrect';
      const justTyped = index === animatedIndex ? ' is-just-typed' : '';
      return caret + '<span class="typing-character ' + stateClass + justTyped + '">' + escapeHtml(responseCharacters[index]) + '</span>';
    }).join('');
    const extraMarkup = responseCharacters.slice(referenceCharacters.length)
      .map((character, index) => '<span class="typing-character is-extra' + (referenceCharacters.length + index === animatedIndex ? ' is-just-typed' : '') + '">' + escapeHtml(character) + '</span>')
      .join('');
    return referenceMarkup + extraMarkup + (responseCharacters.length >= referenceCharacters.length ? visualCaret : '');
  };

  const syncTypingTester = (input, animateNewestCharacter = false) => {
    const field = input.closest('.typing-tester');
    const overlay = field?.querySelector('[data-typing-overlay]');
    if (!overlay) return;
    const previousValue = input.dataset.typingPreviousValue ?? input.value;
    const addedOneCharacter = animateNewestCharacter
      && input.value.length === previousValue.length + 1;
    overlay.innerHTML = renderTypingCharacters(activeTypingReference(), input.value, addedOneCharacter ? input.value.length - 1 : -1);
    input.dataset.typingPreviousValue = input.value;
    overlay.scrollTop = input.scrollTop;
    overlay.scrollLeft = input.scrollLeft;
    const referenceCharacters = Array.from(activeTypingReference() || '');
    const responseCharacters = Array.from(input.value || '');
    const newestIndex = responseCharacters.length - 1;
    const correctlyTypedCharacter = addedOneCharacter
      && !field.classList.contains('is-free-response')
      && newestIndex >= 0
      && responseCharacters[newestIndex] === referenceCharacters[newestIndex];
    if (correctlyTypedCharacter && effectiveAnimationLevel() === 'lively') {
      // One compact, local acknowledgement of a correct keystroke. Wrong
      // characters stay visibly red, but never receive a punitive movement.
      window.clearTimeout(typingPulseTimer);
      field.classList.remove('is-correct-keystroke');
      void field.offsetWidth;
      field.classList.add('is-correct-keystroke');
      typingPulseTimer = window.setTimeout(() => field.classList.remove('is-correct-keystroke'), 310);
    }
    const momentum = input.closest('.typing-practice')?.querySelector('[data-typing-momentum]');
    if (momentum) {
      const nextCopy = typingMomentumCopy(input.value);
      if (nextCopy && momentum.textContent !== nextCopy) {
        momentum.textContent = nextCopy;
        momentum.dataset.momentumStage = typingMomentumStage(input.value);
        momentum.classList.remove('is-momentum-changing');
        // Restart only the learner-triggered message change in Lively mode.
        void momentum.offsetWidth;
        momentum.classList.add('is-momentum-changing');
      }
    }
  };

  const keepGuidedTypingCursorAtEnd = (input) => {
    const field = input?.closest('.typing-tester');
    if (!input || !field || field.classList.contains('is-free-response')) return;
    const end = input.value.length;
    if (input.selectionStart !== end || input.selectionEnd !== end) input.setSelectionRange(end, end);
  };

  const buildTypingTester = () => {
    if (state.view !== 'course' || state.progress.phase !== 'type') return;
    const practice = app.querySelector('.typing-practice');
    const textarea = practice?.querySelector('[data-typing-input]');
    const label = practice?.querySelector('.course-input-label');
    if (!practice || !textarea || !label || practice.querySelector('.typing-tester')) return;

    practice.querySelector('.guided-typing')?.remove();
    practice.querySelector('.typing-target')?.remove();

    const typing = currentStep().typing;
    const sectionTyping = usesLessonSectionTyping();
    const activeSection = sectionTyping ? activeLessonTypingSection() : null;
    const voiceInputAvailable = typingAllowsVoiceInput();
    const freeResponse = !sectionTyping && typing.level === 'Recall typing';
    const voiceTaskKey = [state.progress.lessonIndex, typing.level, activeSection?.index ?? state.progress.attempt.guidedIndex].join(':');
    if (voiceInput.taskKey !== voiceTaskKey) {
      if (voiceInput.statusTimer) window.clearTimeout(voiceInput.statusTimer);
      voiceInput.statusTimer = null;
      voiceInput.taskKey = voiceTaskKey;
      voiceInput.status = 'ready';
    }
    const reference = activeTypingReference();
    const field = document.createElement('div');
    field.className = 'typing-tester' + (freeResponse ? ' is-free-response' : '') + (sectionTyping ? ' is-lesson-section' : '');
    if (sectionTyping) {
      const explicitLines = reference.split('\n').length;
      const wrappedLines = Math.ceil(Array.from(reference).length / 64);
      const visibleLines = Math.min(10, Math.max(5, explicitLines, wrappedLines));
      field.style.setProperty('--lesson-typing-height', (visibleLines * 25 + 34) + 'px');
    }

    const readableReference = document.createElement('span');
    readableReference.id = 'typing-reference';
    readableReference.className = 'course-live-region';
    readableReference.textContent = freeResponse
      ? 'Prompt: ' + (typing.reference || typing.prompt)
      : 'Text to type: ' + reference;
    field.append(readableReference);

    if (freeResponse) {
      const prompt = document.createElement('p');
      prompt.className = 'typing-tester-prompt';
      prompt.textContent = typing.reference || typing.prompt;
      field.append(prompt);
    } else {
      const overlay = document.createElement('div');
      overlay.className = 'typing-tester-overlay';
      overlay.dataset.typingOverlay = '';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = renderTypingCharacters(reference, textarea.value);
      field.append(overlay);
    }

    const phraseLabel = sectionTyping
      ? 'Section ' + (activeSection.index + 1) + ' of ' + activeSection.total + ' — type the complete visible section'
      : typing.level === 'Guided typing'
        ? 'Phrase ' + (state.progress.attempt.guidedIndex + 1) + ' of ' + typing.phrases.length + ' — type the visible phrase'
      : (freeResponse ? 'Write your response in the field' : 'Type the visible text in the field');
    label.textContent = voiceInputAvailable ? 'Type or speak your response' : phraseLabel;
    textarea.classList.add('typing-tester-input');
    textarea.removeAttribute('rows');
    textarea.removeAttribute('placeholder');
    textarea.setAttribute('aria-label', label.textContent);
    textarea.setAttribute('aria-describedby', 'typing-reference typing-help');
    const typingHelp = practice.querySelector('#typing-help');
    if (typingHelp && !typingHelp.textContent.includes('Press Enter to check this response.')) typingHelp.textContent += ' Press Enter to check this response. Use Shift+Enter for a new line.';
    label.insertAdjacentElement('afterend', field);
    field.append(textarea);
    if (voiceInputAvailable) {
      const controls = document.createElement('div');
      controls.className = 'typing-tester-controls';
      controls.dataset.voiceInputControls = '';
      const supported = Boolean(voiceRecognitionConstructor());
      controls.innerHTML = '<button class="course-secondary-button typing-mic-button" type="button" data-action="start-voice-input" aria-label="Use microphone to speak your response" aria-describedby="course-voice-input-status"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 14.5a3 3 0 0 0 3-3v-5a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm-5-3v.5a5 5 0 0 0 10 0v-.5M12 17v4M8.5 21h7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg><span data-voice-input-button-label>Speak</span></button><button class="course-secondary-button typing-mic-stop" type="button" data-action="stop-voice-input" aria-describedby="course-voice-input-status" hidden>Stop</button>';
      field.append(controls);
      const status = document.createElement('p');
      status.className = 'typing-voice-input-status';
      status.id = 'course-voice-input-status';
      status.dataset.voiceInputStatus = '';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.textContent = 'Ready. Microphone input is optional. Typing stays available.';
      field.append(status);
      voiceInput.supported = supported;
      renderVoiceInputState(supported ? voiceInput.status : 'unsupported');
    }
    textarea.dataset.typingPreviousValue = textarea.value;
    syncTypingTester(textarea);
    keepGuidedTypingCursorAtEnd(textarea);
  };

  const voiceRecognitionConstructor = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;

  const voiceInputStateDefinition = (status) => ({
    ready: { name: 'Ready', button: 'Speak', active: false, disabled: false, label: 'Use microphone to speak your response', copy: 'Ready. Microphone input is optional. Typing stays available.' },
    listening: { name: 'Listening', button: 'Listening', active: true, disabled: true, label: 'Listening for your response', copy: 'Listening. Speak in short phrases, then choose Stop when you are finished. Typing stays available.' },
    recognising: { name: 'Recognising', button: 'Recognising', active: true, disabled: true, label: 'Recognising your spoken response', copy: 'Recognising. Your words are being added to the response field. Typing stays available.' },
    stopped: { name: 'Stopped', button: 'Speak again', active: false, disabled: false, label: 'Start microphone input again', copy: 'Stopped. Your response is still in the field, and typing stays available.' },
    unsupported: { name: 'Unsupported', button: 'Unsupported', active: false, disabled: true, label: 'Microphone input is unsupported in this browser', copy: 'Unsupported. This browser does not provide speech recognition. Type your response instead.' },
    'permission-denied': { name: 'Permission denied', button: 'Try again', active: false, disabled: false, label: 'Try microphone input again after changing permission', copy: 'Permission denied. Allow microphone access for this site, or type your response instead.' },
    error: { name: 'Error', button: 'Try again', active: false, disabled: false, label: 'Try microphone input again', copy: 'Error. Microphone input could not continue. Your response is still here, and typing stays available.' }
  }[status] || null);

  const renderVoiceInputState = (requestedStatus = voiceInput.status, detail = '') => {
    const definition = voiceInputStateDefinition(requestedStatus) || voiceInputStateDefinition('error');
    voiceInput.status = voiceInputStateDefinition(requestedStatus) ? requestedStatus : 'error';
    voiceInput.listening = definition.active;
    app.querySelectorAll('[data-voice-input-controls]').forEach((controls) => {
      controls.dataset.voiceInputState = voiceInput.status;
    });
    app.querySelectorAll('[data-action="start-voice-input"]').forEach((button) => {
      button.disabled = definition.disabled;
      if (definition.disabled) button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
      button.setAttribute('aria-label', definition.label);
      const label = button.querySelector('[data-voice-input-button-label]');
      if (label) label.textContent = definition.button;
    });
    app.querySelectorAll('[data-action="stop-voice-input"]').forEach((button) => {
      button.hidden = !definition.active;
    });
    const status = app.querySelector('[data-voice-input-status]');
    if (status) status.textContent = detail ? definition.name + '. ' + detail : definition.copy;
  };

  const stopVoiceInput = (message = '', nextStatus = 'stopped') => {
    const recognition = voiceInput.recognition;
    voiceInput.stopRequested = true;
    voiceInput.sessionId += 1;
    if (voiceInput.restartTimer) {
      window.clearTimeout(voiceInput.restartTimer);
      voiceInput.restartTimer = null;
    }
    if (voiceInput.statusTimer) {
      window.clearTimeout(voiceInput.statusTimer);
      voiceInput.statusTimer = null;
    }
    voiceInput.recognition = null;
    voiceInput.listening = false;
    voiceInput.initialResponse = '';
    voiceInput.finalTranscript = '';
    voiceInput.finalResultIndexes = new Set();
    voiceInput.restartCount = 0;
    voiceInput.lastError = '';
    if (recognition) {
      try { recognition.stop(); } catch (_) { /* Stopping is best-effort. */ }
    }
    renderVoiceInputState(nextStatus, message);
  };

  const scheduleVoiceRecognitionRestart = (sessionId, message, delay = 350) => {
    if (sessionId !== voiceInput.sessionId || voiceInput.stopRequested) return;
    if (voiceInput.restartTimer) window.clearTimeout(voiceInput.restartTimer);
    if (voiceInput.restartCount >= 10) {
      stopVoiceInput('Speech recognition could not stay connected. Your response is still here; type or choose Try again.', 'error');
      return;
    }
    voiceInput.restartCount += 1;
    renderVoiceInputState('listening', message);
    voiceInput.restartTimer = window.setTimeout(() => {
      voiceInput.restartTimer = null;
      beginVoiceRecognitionCycle(sessionId);
    }, delay);
  };

  const beginVoiceRecognitionCycle = (sessionId) => {
    if (sessionId !== voiceInput.sessionId || voiceInput.stopRequested) return;
    const Recognition = voiceRecognitionConstructor();
    let recognition;
    try {
      recognition = new Recognition();
    } catch (_) {
      scheduleVoiceRecognitionRestart(sessionId, 'The microphone is reconnecting. You can keep your place and try speaking again.', 500);
      return;
    }
    voiceInput.recognition = recognition;
    voiceInput.finalResultIndexes = new Set();
    voiceInput.lastError = '';
    recognition.lang = document.documentElement.lang || 'en-US';
    // Browsers can end a recognition object after a short pause even in
    // continuous mode. A fresh object is created for each retry because some
    // implementations will not reliably restart an object that has ended.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (sessionId !== voiceInput.sessionId || voiceInput.recognition !== recognition || voiceInput.stopRequested) return;
      voiceInput.listening = true;
      voiceInput.finalResultIndexes = new Set();
      voiceInput.lastError = '';
      state.progress.attempt.inputMethod = 'voice';
      state.progress.attempt.alternativeInput = true;
      renderVoiceInputState('listening');
      announce('Microphone input is listening.');
    };
    recognition.onresult = (event) => {
      if (sessionId !== voiceInput.sessionId || voiceInput.recognition !== recognition || voiceInput.stopRequested) return;
      renderVoiceInputState('recognising');
      if (voiceInput.statusTimer) window.clearTimeout(voiceInput.statusTimer);
      voiceInput.statusTimer = window.setTimeout(() => {
        voiceInput.statusTimer = null;
        if (sessionId === voiceInput.sessionId && voiceInput.recognition === recognition && !voiceInput.stopRequested) renderVoiceInputState('listening');
      }, 700);
      let finalTranscript = voiceInput.finalTranscript;
      let interimTranscript = '';
      const resultStart = Math.max(0, Number(event.resultIndex) || 0);
      Array.from(event.results || []).slice(resultStart).forEach((result, offset) => {
        const resultIndex = resultStart + offset;
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) {
          if (!voiceInput.finalResultIndexes.has(resultIndex)) {
            voiceInput.finalResultIndexes.add(resultIndex);
            finalTranscript = [finalTranscript, transcript].filter(Boolean).join(' ').trim();
          }
        } else interimTranscript += transcript + ' ';
      });
      voiceInput.finalTranscript = finalTranscript;
      voiceInput.restartCount = 0;
      const transcript = [finalTranscript, interimTranscript.trim()].filter(Boolean).join(' ').trim();
      if (!transcript) return;
      const input = app.querySelector('[data-typing-input]');
      const nextValue = [voiceInput.initialResponse, transcript].filter(Boolean).join(' ');
      state.progress.attempt.response = nextValue;
      state.progress.attempt.feedback = '';
      if (input) {
        input.value = nextValue;
        syncTypingTester(input);
      }
      save('Voice input added to your response.');
    };
    recognition.onerror = (event) => {
      if (sessionId !== voiceInput.sessionId || voiceInput.recognition !== recognition || voiceInput.stopRequested) return;
      const errorCode = String(event?.error || 'unknown');
      voiceInput.lastError = errorCode;
      if (errorCode === 'no-speech' || errorCode === 'aborted' || errorCode === 'network') {
        renderVoiceInputState('listening', errorCode === 'network'
          ? 'Speech recognition briefly lost its connection and is reconnecting. Typing stays available.'
          : 'No speech was heard yet. The microphone is staying ready, and typing stays available.');
        return;
      }
      const permissionDenied = errorCode === 'not-allowed' || errorCode === 'service-not-allowed';
      const error = permissionDenied
        ? 'Enable microphone permission for this site, or type your response instead.'
        : errorCode === 'audio-capture'
          ? 'No working microphone was found. Check your device input, or type your response instead.'
          : errorCode === 'language-not-supported'
            ? 'Speech recognition does not support this language on your device. You can type your response instead.'
            : 'Microphone input could not continue. You can type your response instead.';
      stopVoiceInput(error, permissionDenied ? 'permission-denied' : 'error');
      announce((permissionDenied ? 'Permission denied. ' : 'Microphone error. ') + error);
    };
    recognition.onend = () => {
      if (sessionId !== voiceInput.sessionId || voiceInput.recognition !== recognition || voiceInput.stopRequested) return;
      voiceInput.recognition = null;
      const networkDelay = voiceInput.lastError === 'network' ? 800 : 350;
      scheduleVoiceRecognitionRestart(
        sessionId,
        voiceInput.lastError === 'network'
          ? 'Speech recognition briefly lost its connection. The microphone is reconnecting.'
          : 'The microphone paused briefly. It is still listening for your response.',
        networkDelay
      );
    };
    try {
      recognition.start();
    } catch (_) {
      if (voiceInput.recognition === recognition) voiceInput.recognition = null;
      scheduleVoiceRecognitionRestart(sessionId, 'The microphone is starting again. Your response is still here.', 500);
    }
  };

  const startVoiceInput = () => {
    if (!typingAllowsVoiceInput()) {
      announce(typingIsConceptResponse()
        ? 'Enable Voice input and speech-to-text in Learning settings before using the microphone.'
        : 'This is a typing-only activity, so microphone input is not shown.');
      return;
    }
    const Recognition = voiceRecognitionConstructor();
    voiceInput.supported = Boolean(Recognition);
    if (!Recognition) {
      renderVoiceInputState('unsupported');
      announce('Microphone input is not available in this browser. Typing remains available.');
      return;
    }
    stopVoiceInput('', 'ready');
    voiceInput.stopRequested = false;
    voiceInput.restartCount = 0;
    voiceInput.lastError = '';
    voiceInput.sessionId += 1;
    const sessionId = voiceInput.sessionId;
    voiceInput.initialResponse = state.progress.attempt.response.trim();
    voiceInput.finalTranscript = '';
    voiceInput.finalResultIndexes = new Set();
    renderVoiceInputState('listening', 'Starting microphone input. Speak when your browser shows that it is listening. Typing stays available.');
    beginVoiceRecognitionCycle(sessionId);
  };

  const addTypingSupportControls = () => {
    if (state.view !== 'course' || state.progress.phase !== 'type') return;
    const practice = app.querySelector('.typing-practice');
    if (!practice) return;
    if (!practice.querySelector('[data-typing-objective]')) {
      const objective = document.createElement('p');
      objective.className = 'course-input-help course-typing-objective';
      objective.dataset.typingObjective = '';
      objective.textContent = typingIsAccuracyObjective()
        ? 'This activity checks the visible typing practice sentence. It does not measure speed.'
        : 'This activity checks your idea, not spelling or handwriting. You can use a typed, speech-to-text, or other valid response when the option is available.';
      practice.querySelector('#typing-help')?.insertAdjacentElement('afterend', objective);
    }
    if (typingIsAccuracyObjective() && state.preferences.alternativeInput && !practice.querySelector('[data-typing-objective-note]')) {
      const note = document.createElement('p');
      note.className = 'course-input-help';
      note.dataset.typingObjectiveNote = '';
      note.textContent = 'This is a keyboard typing practice, so the visible sentence stays the learning objective. Your device’s keyboard, switch, and one-handed input can still be used.';
      practice.querySelector('#typing-help')?.insertAdjacentElement('afterend', note);
    }
    if (typingAllowsAlternativeInput() && !practice.querySelector('[data-alternative-input-note]')) {
      const note = document.createElement('p');
      note.className = 'course-input-help';
      note.dataset.alternativeInputNote = '';
      note.textContent = 'Alternative input changes how a response is entered, not what makes it valid. An authored input route appears beside the field only when this activity provides one.';
      practice.querySelector('#typing-help')?.insertAdjacentElement('afterend', note);
    }
    if (typingAllowsAlternativeResponse() && !practice.querySelector('[data-alternative-response-note]')) {
      const note = document.createElement('p');
      note.className = 'course-input-help';
      note.dataset.alternativeResponseNote = '';
      note.textContent = 'Alternative response formats change the form of an answer only when the learning objective and authored activity allow it. This activity still checks the same concept.';
      practice.querySelector('#typing-help')?.insertAdjacentElement('afterend', note);
    }
  };

  const applyRenderedSupportBehavior = () => {
    if (state.view !== 'course') return;
    const nowPanels = app.querySelectorAll('.course-now-panel');
    nowPanels.forEach((panel) => {
      const next = panel.children[1];
      panel.classList.toggle('course-no-next-step', !state.preferences.visibleNextSteps);
      if (next) next.hidden = !state.preferences.visibleNextSteps;
    });
    const workspace = app.querySelector('.course-workspace');
    if (workspace && selectedCourseLayout() === 'open' && state.preferences.advanceNotice && !workspace.querySelector('[data-transition-notice]')) {
      const notice = document.createElement('p');
      notice.className = 'course-transition-notice';
      notice.dataset.transitionNotice = '';
      notice.textContent = 'This screen keeps one task visible. Next: ' + courseNextStepCopy() + '.';
      workspace.querySelector('.course-now-panel')?.insertAdjacentElement('afterend', notice);
    }
    if (state.preferences.literalInstructions) {
      const top = app.querySelector('.course-task-top > div');
      if (top && !top.querySelector('[data-literal-instruction]')) {
        const instruction = document.createElement('p');
        instruction.className = 'course-literal-instruction';
        instruction.dataset.literalInstruction = '';
        instruction.innerHTML = '<strong>Do this:</strong> ' + escapeHtml(taskLabel()) + '. <strong>Finish when:</strong> ' + escapeHtml(courseNextStepCopy()) + '.';
        top.append(instruction);
      }
    }
    const taskCard = app.querySelector('.course-task-card');
    if (taskCard && state.preferences.extraHints && currentStep()?.hint && !taskCard.querySelector('[data-extra-hint]')) {
      const hint = document.createElement('details');
      hint.className = 'course-extra-hint';
      hint.dataset.extraHint = '';
      hint.innerHTML = '<summary>Optional hint</summary><p>' + escapeHtml(currentStep().hint) + '</p>';
      taskCard.querySelector('.course-task-top')?.insertAdjacentElement('afterend', hint);
    }
    if (taskCard && !taskCard.querySelector('[data-input-access-note]') && (state.preferences.switchInput || state.preferences.keyboardShortcuts)) {
      const note = document.createElement('p');
      note.className = 'course-input-access-note';
      note.dataset.inputAccessNote = '';
      const messages = [];
      if (state.preferences.switchInput) messages.push('Switch input is on: use Tab to move between controls, then Space or Enter to activate the focused control.');
      if (state.preferences.keyboardShortcuts) messages.push('Keyboard shortcuts are on: Alt+P opens Pause and save; Alt+H opens I’m stuck.');
      note.textContent = messages.join(' ');
      taskCard.querySelector('.course-task-top')?.insertAdjacentElement('afterend', note);
    }
    if (!state.preferences.extraHints) {
      app.querySelector('[data-help-option="hint"]')?.remove();
    }
    if (!state.preferences.restBreaks) {
      app.querySelector('[data-help-option="break"]')?.remove();
    }
    if (state.preferences.readAloud) {
      const reading = app.querySelector('.course-tts-reading');
      if (reading && !reading.previousElementSibling?.matches?.('[data-written-access-note]')) {
        const note = document.createElement('p');
        note.className = 'course-written-access-note';
        note.dataset.writtenAccessNote = '';
        note.textContent = 'Written lesson text stays visible while optional text to speech plays.';
        reading.insertAdjacentElement('beforebegin', note);
      }
    }
    app.querySelectorAll('.course-progress-panel').forEach((panel) => {
      if (!numericProgressIsReduced()) return;
      panel.querySelector('strong')?.replaceChildren(document.createTextNode('One small step at a time'));
      panel.querySelectorAll('.course-progress-bars span').forEach((label, index) => {
        label.textContent = index === 0 ? 'Current learning step' : (isFinalExamPhase() ? 'Saved course progress' : 'Course progress');
      });
    });
    app.querySelectorAll('[data-action="show-example"]').forEach((button) => {
      button.textContent = shouldShowExample() ? 'Hide examples' : 'Show examples';
    });
    addTypingSupportControls();
  };

  const structureReadingContent = () => {
    if (state.view !== 'course' || state.progress.phase !== 'read') return;
    const reading = app.querySelector('.course-reading-copy');
    const content = currentStep().content;
    if (!reading || reading.classList.contains('course-narration-content') || !content || reading.dataset.structured) return;
    reading.querySelectorAll(':scope > p').forEach((paragraph) => paragraph.remove());

    const sections = [
      [content.definitionHeading, content.definition],
      [content.dailyLifeHeading, content.dailyLife],
      [content.strengthsHeading, content.strengths],
      [content.challengesHeading, content.challenges],
      [content.supportsHeading, content.supports]
    ];
    const fragment = document.createDocumentFragment();
    sections.forEach(([heading, value]) => {
      if (!heading || !value) return;
      const section = document.createElement('section');
      section.className = 'course-reading-section';
      const title = document.createElement('h3');
      title.textContent = heading;
      section.append(title);
      if (Array.isArray(value)) {
        const list = document.createElement('ul');
        list.className = 'course-reading-list';
        value.forEach((item) => {
          const listItem = document.createElement('li');
          listItem.textContent = item;
          list.append(listItem);
        });
        section.append(list);
      } else {
        const paragraph = document.createElement('p');
        paragraph.textContent = value;
        section.append(paragraph);
      }
      fragment.append(section);
    });
    reading.prepend(fragment);
    reading.dataset.structured = 'true';
  };

  const addSourceNotice = () => {
    if (state.view !== 'course' || state.progress.phase !== 'read' || state.progress.lessonIndex !== 0) return;
    const reading = app.querySelector('.course-reading-copy');
    if (!reading || reading.querySelector('[data-course-content-notice]')) return;
    const notice = document.createElement('aside');
    notice.className = 'course-content-notice';
    notice.dataset.courseContentNotice = '';
    notice.textContent = COURSE.contentNotice;
    reading.prepend(notice);
  };

  const addCourseConclusion = () => {
    if (state.view !== 'course' || state.progress.phase !== 'complete' || !isLastStep() || !COURSE.conclusion) return;
    const card = app.querySelector('.course-complete-card');
    const actions = card?.querySelector('.course-task-actions');
    if (!card || !actions || card.querySelector('[data-course-conclusion]')) return;
    const conclusion = document.createElement('section');
    conclusion.className = 'course-conclusion';
    conclusion.dataset.courseConclusion = '';
    const title = document.createElement('h3');
    title.textContent = COURSE.conclusion.title;
    conclusion.append(title);
    COURSE.conclusion.paragraphs.forEach((paragraph) => {
      const copy = document.createElement('p');
      copy.textContent = paragraph;
      conclusion.append(copy);
    });
    actions.insertAdjacentElement('beforebegin', conclusion);
  };

  const updateCourseCopy = () => {
    if (state.view === 'browse') {
      const listingCopy = app.querySelector('.course-listing p');
      if (listingCopy) listingCopy.textContent = COURSE.steps.length + ' short, non-diagnostic modules plus a calm final exam about general experiences, respectful language, and accessible participation.';
    }
    if (state.view === 'course') {
      const moduleCopy = app.querySelector('.course-module-strip-heading > span');
      if (moduleCopy) moduleCopy.textContent = COURSE.steps.length + ' small modules · one final exam';
    }
  };

  const syncNarrationVoiceOptions = () => {
    const select = app.querySelector('[data-narration-voice]');
    if (!select) return;
    select.innerHTML = narrationVoiceOptions();
    select.value = state.preferences.narrationVoice === SYSTEM_NARRATION_VOICE_URI
      ? SYSTEM_NARRATION_VOICE_URI
      : effectiveNarrationVoice();
    select.disabled = narration.status === 'unsupported' || (!hasLocalAvaNarration() && narration.voices.length === 0);
  };

  const cancelNarrationAutoScroll = () => {
    if (narration.scrollFrame !== null && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(narration.scrollFrame);
    narration.scrollFrame = null;
  };

  const narrationScrollUsesReducedMotion = () => {
    const systemPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    return Boolean(state.preferences.reducedMotion || state.preferences.quietDisplay || systemPreference?.matches);
  };

  const narrationScrollTopClearance = () => 24;

  const smoothNarrationScrollTo = (targetTop) => {
    const startTop = Math.max(0, Number(window.scrollY ?? window.pageYOffset) || 0);
    const destination = Math.max(0, Number(targetTop) || 0);
    const distance = destination - startTop;
    if (Math.abs(distance) < 2) return;
    cancelNarrationAutoScroll();
    if (narrationScrollUsesReducedMotion() || typeof window.requestAnimationFrame !== 'function') {
      window.scrollTo?.({ left: 0, top: destination, behavior: 'auto' });
      return;
    }
    const duration = Math.min(460, Math.max(220, 170 + Math.abs(distance) * 0.18));
    let startedAt = null;
    const step = (timestamp) => {
      if (startedAt === null) startedAt = timestamp;
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      // A gentle ease-out keeps the current section readable without a sudden jump.
      const eased = 1 - Math.pow(1 - progress, 3);
      window.scrollTo?.({ left: 0, top: startTop + (distance * eased), behavior: 'auto' });
      if (progress < 1) narration.scrollFrame = window.requestAnimationFrame(step);
      else narration.scrollFrame = null;
    };
    narration.scrollFrame = window.requestAnimationFrame(step);
  };

  const scrollActiveNarrationChunk = () => {
    if (!state.preferences.narrationAutoScroll || narration.activeIndex < 0) return;
    const activeChunk = app.querySelector('[data-narration-text][data-narration-index="' + narration.activeIndex + '"]');
    if (!activeChunk) return;
    const rect = activeChunk.getBoundingClientRect?.();
    if (!rect || !Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) return;
    const upperBoundary = narrationScrollTopClearance();
    const lowerBoundary = Math.max(upperBoundary + 72, (window.innerHeight || 0) - 36);
    let delta = 0;
    if (rect.top < upperBoundary || rect.height > lowerBoundary - upperBoundary) delta = rect.top - upperBoundary;
    else if (rect.bottom > lowerBoundary) delta = rect.bottom - lowerBoundary;
    else return;
    const currentTop = Math.max(0, Number(window.scrollY ?? window.pageYOffset) || 0);
    const maximumTop = Math.max(0, (document.documentElement?.scrollHeight || 0) - (window.innerHeight || 0));
    smoothNarrationScrollTo(Math.min(maximumTop, Math.max(0, currentTop + delta)));
  };

  window.addEventListener('wheel', cancelNarrationAutoScroll, { passive: true });
  window.addEventListener('touchstart', cancelNarrationAutoScroll, { passive: true });

  const restoreNarrationText = (element) => {
    const source = element.dataset.narrationSource;
    if (!source) return;
    element.textContent = source;
    delete element.dataset.narrationSource;
  };

  const renderNarrationProgress = (element, range) => {
    const source = element.dataset.narrationSource || element.textContent || '';
    if (!element.dataset.narrationSource) element.dataset.narrationSource = source;
    const start = Math.min(Math.max(Number(range?.start) || 0, 0), source.length);
    const end = Math.min(Math.max(Number(range?.end) || start, start), source.length);
    if (!end || end <= start) {
      restoreNarrationText(element);
      return;
    }
    const spoken = source.slice(0, start);
    const current = source.slice(start, end);
    const remaining = source.slice(end);
    element.innerHTML = (spoken ? '<span class="course-tts-spoken" data-tts-spoken>' + escapeHtml(spoken) + '</span>' : '')
      + '<mark class="course-tts-highlight" data-tts-highlight>' + escapeHtml(current) + '</mark>'
      + escapeHtml(remaining);
  };

  const syncNarrationUi = () => {
    const hasActiveChunk = narration.activeIndex >= 0 && ['playing', 'paused'].includes(narration.status);
    const highlighting = state.preferences.narrationHighlight !== false;
    app.querySelectorAll('[data-narration-text][data-narration-index]').forEach((chunk) => {
      const active = hasActiveChunk && Number(chunk.dataset.narrationIndex) === narration.activeIndex;
      chunk.classList.toggle('is-narration-active', active && highlighting);
      chunk.classList.toggle('is-speaking', active && highlighting);
      if (active && highlighting) chunk.setAttribute('data-current-speech', 'true');
      else chunk.removeAttribute('data-current-speech');
      const range = active && narration.activeRange?.index === narration.activeIndex ? narration.activeRange : null;
      if (active && range && highlighting) renderNarrationProgress(chunk, range);
      else restoreNarrationText(chunk);
    });

    const status = app.querySelector('[data-narration-status]');
    if (status) status.textContent = textToSpeechStatusCopy();

    const listen = app.querySelector('[data-narration-listen]');
    if (listen) {
      listen.disabled = narration.status === 'playing' || narration.status === 'unsupported';
      listen.textContent = narration.status === 'paused' ? 'Resume' : narration.status === 'finished' ? 'Listen again' : 'Listen';
    }
    const pause = app.querySelector('[data-narration-pause]');
    if (pause) pause.hidden = narration.status !== 'playing';
    const stop = app.querySelector('[data-narration-stop]');
    if (stop) stop.hidden = !['playing', 'paused'].includes(narration.status);
    syncNarrationVoiceOptions();
  };

  const ensureNarrationService = () => {
    if (narration.service) return narration.service;
    narration.service = new NarrationService({
      onStateChange: (status) => {
        narration.status = status;
        if (status !== 'playing') cancelNarrationAutoScroll();
        syncNarrationUi();
        if (status === 'playing') announce('Text to speech started from the selected section.');
        else if (status === 'paused') announce('Text to speech paused.');
        else if (status === 'finished') announce('Text to speech finished.');
        else if (status === 'unsupported') announce('Text to speech is not available in this browser. You can use your device’s usual reading support.');
        else if (status === 'error') announce('Text to speech could not continue. The lesson text is still available to read.');
      },
      onChunkChange: (index) => {
        narration.activeIndex = index;
        narration.activeRange = index >= 0 ? { index, start: 0, end: 0 } : null;
        syncNarrationUi();
        if (index >= 0) window.requestAnimationFrame(scrollActiveNarrationChunk);
      },
      onBoundary: ({ index, charIndex, charLength, startOffset }) => {
        if (!Number.isInteger(index) || index < 0) return;
        const start = Math.max(0, Number(startOffset) || 0) + Math.max(0, Number(charIndex) || 0);
        narration.activeRange = {
          index,
          start,
          end: start + Math.max(1, Number(charLength) || 1)
        };
        syncNarrationUi();
      },
      onVoicesChange: (voices) => {
        narration.voices = voices;
        syncNarrationVoiceOptions();
      }
    });
    narration.status = narration.service.status;
    narration.voices = narration.service.voices;
    return narration.service;
  };

  const prepareNarrationForRenderedTask = () => {
    const service = ensureNarrationService();
    service.configure({
      rate: state.preferences.narrationSpeed,
      voiceURI: effectiveNarrationVoice(),
      volume: Number(state.preferences.narrationVolume)
    });
    if (state.view === 'course' && (state.progress.phase === 'read' || isReviewingModule()) && state.preferences.readAloud) {
      narration.chunks = renderedNarrationChunks();
      service.setChunks(narration.chunks);
      configureLocalAvaPlaylist(service, narration.chunks);
      narration.activeIndex = -1;
      narration.activeRange = null;
      narration.status = service.status;
      syncNarrationUi();
      return;
    }
    service.setAudioPlaylist?.([]);
    narration.chunks = [];
    narration.activeIndex = -1;
    narration.activeRange = null;
    service.stop({ silent: true });
    if (service.supported) service.setStatus('idle');
  };

  const genericNarrationChunks = () => {
    if (state.progress.phase === 'read' || isReviewingModule()) return renderedNarrationChunks().length ? renderedNarrationChunks() : readingNarrationChunks();
    const step = currentStep();
    const typing = step.typing || {};
    const check = step.check || {};
    if (state.progress.phase === 'exam-intro') return [{ id: 'final-exam-intro', label: 'Final exam introduction', text: [finalExam().title, finalExam().description, 'There are ' + finalExamQuestionCount() + ' questions. There is no timer.'].filter(Boolean).join('. ') }];
    if (state.progress.phase === 'exam') {
      const question = currentFinalExamQuestion();
      return question ? [{ id: 'final-exam-question', label: 'Final exam question', text: [question.question, ...question.options.map(([label]) => label)].filter(Boolean).join('. ') }] : [];
    }
    if (state.progress.phase === 'exam-results') return [{ id: 'final-exam-results', label: 'Final exam results', text: 'Your final exam results and question-by-question review are available on this page.' }];
    if (state.progress.phase === 'type') {
      if (usesLessonSectionTyping()) {
        const { section, index, total } = activeLessonTypingSection();
        return [{ id: 'typing-section-' + index, label: 'Typing section ' + (index + 1) + ' of ' + total, text: [section.heading, section.text].filter(Boolean).join('. ') }];
      }
      return [{ id: 'task-prompt', label: 'Current typing task', text: [typing.prompt, typing.target || typing.reference].filter(Boolean).join('. ') }];
    }
    if (state.progress.phase === 'check') return [{ id: 'question', label: 'Question', text: [check.question, ...(check.options || []).map(([label]) => label)].filter(Boolean).join('. ') }];
    if (state.progress.phase === 'apply') return [{ id: 'practice', label: 'Practice question', text: 'Choose one practical response. ' + practiceSupport() }];
    return [{ id: 'task', label: taskLabel(), text: [step.title, ...sourceReadSections(step)].filter(Boolean).join('. ') }];
  };

  const startNarration = (index) => {
    const enablingTextToSpeech = !state.preferences.readAloud;
    if (enablingTextToSpeech) {
      setCourseSetting('readAloud', true);
      save('Text to speech mode is on.');
      render();
    }
    const service = ensureNarrationService();
    const readingTask = state.view === 'course' && (state.progress.phase === 'read' || isReviewingModule());
    if (!readingTask) {
      narration.chunks = genericNarrationChunks();
      service.setAudioPlaylist?.([]);
      service.setChunks(narration.chunks);
    } else {
      narration.chunks = renderedNarrationChunks();
      if (!narration.chunks.length) narration.chunks = readingNarrationChunks();
      service.setChunks(narration.chunks);
      configureLocalAvaPlaylist(service, narration.chunks);
    }
    service.configure({
      rate: state.preferences.narrationSpeed,
      voiceURI: effectiveNarrationVoice(),
      volume: Number(state.preferences.narrationVolume)
    });
    const startIndex = Number.isInteger(index) ? index : (narration.status === 'finished' ? 0 : undefined);
    service.start(startIndex);
    save('Text to speech preference saved.');
  };

  const pointInsideNarrationText = (event) => {
    let node = event.target;
    let offset = 0;
    if (typeof document.caretPositionFromPoint === 'function') {
      const position = document.caretPositionFromPoint(event.clientX, event.clientY);
      if (position) {
        node = position.offsetNode;
        offset = position.offset;
      }
    } else if (typeof document.caretRangeFromPoint === 'function') {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (range) {
        node = range.startContainer;
        offset = range.startOffset;
      }
    }
    const sourceElement = node?.nodeType === 3 ? node.parentElement : node;
    const textElement = sourceElement?.closest?.('[data-narration-text][data-narration-index]');
    if (!textElement) return null;
    let characterOffset = 0;
    if (node && typeof document.createRange === 'function') {
      try {
        const range = document.createRange();
        range.selectNodeContents(textElement);
        range.setEnd(node, offset);
        characterOffset = range.toString().length;
      } catch (_) {
        characterOffset = 0;
      }
    }
    return { element: textElement, index: Number(textElement.dataset.narrationIndex), characterOffset };
  };

  const startNarrationFromChunkPoint = (requestedIndex, requestedOffset = 0) => {
    if (!state.preferences.readAloud || state.view !== 'course' || (state.progress.phase !== 'read' && !isReviewingModule())) return;
    if (!Number.isInteger(requestedIndex)) return;
    const service = ensureNarrationService();
    const chunks = renderedNarrationChunks();
    if (!chunks.length || !chunks[requestedIndex]) return;
    let startIndex = requestedIndex;
    const characterOffset = Math.max(0, Number(requestedOffset) || 0);
    const rawRemainingText = chunks[startIndex].text.slice(characterOffset);
    const leadingWhitespace = rawRemainingText.length - rawRemainingText.trimStart().length;
    const remainingText = rawRemainingText.trim();
    if (remainingText) chunks[startIndex] = { ...chunks[startIndex], text: remainingText, startOffset: characterOffset + leadingWhitespace };
    else {
      startIndex = chunks.findIndex((chunk, index) => index > requestedIndex && chunk.text.trim());
      if (startIndex < 0) return;
    }
    narration.chunks = chunks;
    narration.activeIndex = -1;
    narration.activeRange = null;
    service.setChunks(chunks);
    const playlist = configureLocalAvaPlaylist(service, chunks);
    // Examples are optional visual additions and do not have a matching Ava
    // recording. Starting from one should use the device fallback instead of
    // unexpectedly restarting the main recorded lesson from its beginning.
    if (usesLocalAvaNarration() && playlist.length && !playlist.some((track) => track.chunkIndexes.includes(startIndex))) {
      service.setAudioPlaylist([]);
    }
    service.configure({
      rate: state.preferences.narrationSpeed,
      voiceURI: effectiveNarrationVoice(),
      volume: Number(state.preferences.narrationVolume)
    });
    service.start(startIndex);
    save('Text to speech started from the selected point.');
  };

  const startNarrationFromTextPoint = (event) => {
    const point = pointInsideNarrationText(event);
    if (!point) return;
    startNarrationFromChunkPoint(point.index, point.characterOffset);
  };

  const supportMomentBelongsToCurrentTask = () => Boolean(
    activeSupportMoment
      && state.view === 'course'
      && activeSupportMoment.phase === state.progress.phase
  );

  // The strongest celebration is intentionally narrow: it is only earned by
  // a successful learner action when *both* learner controls ask for the
  // most visible presentation. It is never used for an error, a rerender, or
  // an automatic state change.
  const shouldCelebrateSupportMoment = (moment, isNew) => Boolean(
    isNew
      && moment
      && moment.animationLevel === 'lively'
      && moment.encouragementLevel === 'expressive'
      && ['section-complete', 'answer-correct', 'module-complete', 'course-complete'].includes(moment.kind)
  );

  const supportVisualKind = (moment = activeSupportMoment) => {
    if (!moment) return 'entry';
    if (moment.kind === 'section-complete') return moment.result === 'lesson-complete' ? 'lesson' : 'section';
    if (moment.kind === 'answer-correct') return moment.result === 'applied-practice' ? 'applied' : 'correct';
    if (moment.kind === 'module-complete') return 'module';
    if (moment.kind === 'course-complete') return 'course';
    if (['answer-incorrect', 'typing-incomplete', 'response-needed', 'system-error'].includes(moment.kind)) return 'recovery';
    if (moment.kind === 'preference-preview') return 'preference';
    return 'entry';
  };

  const successCelebrationMarkup = (moment, isNew) => {
    if (!shouldCelebrateSupportMoment(moment, isNew)) return '';
    const visual = supportVisualKind(moment);
    const moduleReward = ['module', 'course'].includes(visual);
    const medalSource = moduleReward
      ? '/assets/rewards/type2learn-module-medal.webp'
      : '/assets/rewards/type2learn-section-medal.webp';
    const medalCount = ['section', 'lesson'].includes(visual) ? 3 : visual === 'course' ? 3 : 1;
    const medals = Array.from({ length: medalCount }, (_, index) => {
      const source = visual === 'course' && index > 0 ? '/assets/rewards/type2learn-section-medal.webp' : medalSource;
      return '<img class="course-success-medal course-success-medal--' + (index + 1) + '" src="' + source + '" alt="">';
    }).join('');
    const petalCount = visual === 'correct' ? 6 : visual === 'section' ? 10 : 14;
    const petals = Array.from({ length: petalCount }, (_, index) => '<span class="course-success-petal course-success-petal--' + (index + 1) + '" aria-hidden="true"></span>').join('');
    const rays = Array.from({ length: visual === 'course' ? 8 : 5 }, (_, index) => '<span class="course-success-ray course-success-ray--' + (index + 1) + '" aria-hidden="true"></span>').join('');
    return '<div class="course-success-celebration course-success-celebration--' + visual + '" aria-hidden="true"><span class="course-success-halo"></span><div class="course-success-celebration-rays">' + rays + '</div><div class="course-success-celebration-medals">' + medals + '</div><div class="course-success-celebration-petals">' + petals + '</div></div>';
  };

  const supportMomentMarkup = (isNew) => {
    const moment = activeSupportMoment;
    const copy = supportCopy(moment);
    if (!moment || !copy) return '';
    const [title, detail] = copy;
    const [symbol, metaLabel, nextStep] = supportMomentMeta(moment);
    const layout = ['focused', 'balanced', 'open'].includes(moment.layout) ? moment.layout : selectedCourseLayout();
    const isPopup = moment.encouragementLevel !== 'subtle';
    const isOpenPopup = isPopup && layout === 'open';
    const isFocusedPopup = isPopup && layout === 'focused';
    const isBalancedPopup = isPopup && layout === 'balanced';
    const isUrdu = moment.language === 'urdu';
    const label = isUrdu
      ? (moment.kind === 'preference-preview' ? 'آپ کے لیے' : moment.encouragementLevel === 'expressive' ? 'شاباش!' : 'حوصلہ افزائی')
      : (moment.kind === 'preference-preview' ? 'For you' : moment.encouragementLevel === 'expressive' ? 'Great work!' : 'Encouragement');
    const nextMarkup = isOpenPopup || !isPopup
      ? (metaLabel && nextStep ? '<p class="course-support-next"><span>' + escapeHtml(metaLabel) + '</span>' + escapeHtml(nextStep) + '</p>' : '')
      : (isBalancedPopup || isFocusedPopup ? '<p class="course-support-next course-support-next--line" aria-hidden="true"></p>' : '');
    const symbolMarkup = (!isPopup || isOpenPopup)
      ? '<span class="course-support-symbol" aria-hidden="true">' + escapeHtml(symbol) + '</span>'
      : '';
    const labelMarkup = isFocusedPopup ? '' : '<span class="course-support-label">' + escapeHtml(label) + '</span>';
    const detailMarkup = (!isFocusedPopup && detail) ? '<p>' + escapeHtml(detail) + '</p>' : '';
    return '<section id="course-support-feedback" class="course-support-moment course-support-moment--' + escapeHtml(moment.kind) + ' course-support-moment--' + escapeHtml(moment.encouragementLevel) + (isPopup ? ' course-support-popup course-support-popup--' + layout : '') + (isNew ? ' is-new-support-moment' : '') + '" data-support-moment="' + moment.id + '" data-support-kind="' + escapeHtml(moment.kind) + '" data-support-layout="' + layout + '" data-support-visual="' + supportVisualKind(moment) + '" tabindex="-1" ' + (isNew ? 'role="status" aria-live="polite"' : 'role="note" aria-live="off"') + (isUrdu ? ' lang="ur" dir="rtl"' : '') + '>' + symbolMarkup + '<div class="course-support-copy">' + labelMarkup + '<strong>' + escapeHtml(title) + '</strong>' + detailMarkup + nextMarkup + '</div><span class="course-support-progress" aria-hidden="true"></span></section>';
  };

  const insertInlineSupportMoment = (card, markup) => {
    if (!card || !markup) return;
    let anchor = null;
    if (state.progress.phase === 'type') anchor = card.querySelector('.course-input-label, .typing-tester');
    else if (['check', 'apply', 'exam'].includes(state.progress.phase)) anchor = card.querySelector('.course-check-options');
    else if (state.progress.phase === 'read') anchor = card.querySelector('.course-reading-copy');
    if (anchor) anchor.insertAdjacentHTML('beforebegin', markup);
    else {
      const actions = card.querySelector('.course-task-actions');
      if (actions) actions.insertAdjacentHTML('beforebegin', markup);
      else card.insertAdjacentHTML('beforeend', markup);
    }
  };

  // Support moments should belong to the task that earned them.  A mascot
  // narrows the usable work column, so centring against the viewport put the
  // acknowledgement between the work and the mascot instead of over the
  // activity.  Keep its vertical screen position calm and predictable, but
  // calculate its horizontal centre and available width from the live task.
  const positionSupportPopupInTask = (popup, card = app.querySelector('.course-task-card')) => {
    if (!popup || !card || !popup.isConnected || !card.isConnected) return;
    const cardRect = card.getBoundingClientRect();
    const viewportInset = 18;
    const availableLeft = Math.max(viewportInset, cardRect.left);
    const availableRight = Math.min(window.innerWidth - viewportInset, cardRect.right);
    const availableWidth = Math.max(0, availableRight - availableLeft);
    if (availableWidth < 1) return;
    // A moment should read like a considered acknowledgement, not a wide
    // announcement banner.  These caps also keep it comfortably inside the
    // work column beside the mascot.
    const preferredMaximum = popup.closest('body')?.dataset.courseEncouragement === 'expressive' ? 660 : 580;
    const popupWidth = Math.max(0, Math.min(preferredMaximum, availableWidth - 40));
    popup.style.setProperty('--course-support-popup-x', (availableLeft + (availableWidth / 2)) + 'px');
    popup.style.setProperty('--course-support-popup-width', Math.max(0, popupWidth) + 'px');
  };

  // A support moment is a transient acknowledgement, never a control a
  // learner has to manage.  The next real interaction clears it immediately
  // while leaving the task itself and any earned visual moment intact.
  const dismissActiveSupportPopup = () => {
    const popup = app.querySelector('.course-support-popup');
    if (!popup) return;
    window.clearTimeout(supportPopupTimer);
    popup.remove();
  };

  const scheduleSupportPopupDismissal = (moment) => {
    window.clearTimeout(supportPopupTimer);
    if (!moment || moment.encouragementLevel === 'subtle') return;
    const visibleFor = ['module-complete', 'course-complete'].includes(moment.kind) ? 7200 : 5200;
    supportPopupTimer = window.setTimeout(() => {
      const popup = app.querySelector('[data-support-moment="' + moment.id + '"]');
      if (!popup) return;
      if (effectiveAnimationLevel() === 'still') {
        popup.remove();
        return;
      }
      popup.classList.add('is-support-popup-leaving');
      window.setTimeout(() => popup.remove(), effectiveAnimationLevel() === 'lively' ? 420 : 240);
    }, visibleFor);
  };

  const enhanceSupportMomentPresentation = () => {
    if (!supportMomentBelongsToCurrentTask()) return;
    const moment = activeSupportMoment;
    const isNew = moment.id !== lastRenderedSupportEventId;
    const card = app.querySelector('.course-task-card');
    if (!card) return;
    const markup = supportMomentMarkup(isNew);
    const celebrationMarkup = successCelebrationMarkup(moment, isNew);
    if (celebrationMarkup) app.insertAdjacentHTML('beforeend', celebrationMarkup);
    const popupPresentation = moment.encouragementLevel !== 'subtle';
    if (markup && (!popupPresentation || isNew)) {
      // The central support moment replaces older one-off feedback strings for
      // the action that just occurred. Saved feedback still appears after a
      // reload, when no ephemeral support event exists.
      card.querySelectorAll('.typing-feedback, .check-feedback, .exam-feedback').forEach((node) => node.remove());
      if (popupPresentation) {
        app.insertAdjacentHTML('beforeend', markup);
        const popup = app.querySelector('[data-support-moment="' + moment.id + '"]');
        window.requestAnimationFrame(() => positionSupportPopupInTask(popup, card));
      }
      else insertInlineSupportMoment(card, markup);
    }
    if (isNew) {
      card.dataset.supportTransition = moment.kind;
      const movesTask = ['task-entry', 'section-complete', 'module-complete', 'course-complete', 'preference-preview'].includes(moment.kind);
      const movesFeedback = !['answer-incorrect', 'typing-incomplete', 'response-needed', 'system-error'].includes(moment.kind);
      if (movesTask) card.classList.add('is-support-task-entering');
      if (movesFeedback) app.querySelector('[data-support-moment]')?.classList.add('is-support-entering');
      if (movesTask && ['check', 'apply', 'exam'].includes(state.progress.phase)) card.classList.add('is-question-sequence-entering');
      if (movesTask) app.querySelector('.course-module-strip, .course-progress-panel')?.classList.add('is-support-progressing');
      scheduleSupportPopupDismissal(moment);
      lastRenderedSupportEventId = moment.id;
    }
  };

  const enhanceQuizPresentation = () => {
    if (state.view !== 'course' || !['check', 'apply'].includes(state.progress.phase)) return;
    const fieldset = app.querySelector('.course-check-options');
    const legend = fieldset?.querySelector('legend');
    if (!fieldset || !legend || legend.dataset.enhancedQuestion) return;
    const applying = state.progress.phase === 'apply';
    const question = applying
      ? 'Which response best uses the idea from this module?'
      : legend.textContent.trim();
    const helper = applying
      ? 'Choose one practical response. You can change your choice before finishing this step.'
      : 'Choose one answer. You can change your choice before checking it.';
    legend.textContent = '';
    legend.className = 'course-question-card';
    legend.tabIndex = -1;
    legend.dataset.enhancedQuestion = 'true';
    legend.dataset.questionKey = (applying ? 'apply-' : 'check-') + state.progress.lessonIndex;
    const label = document.createElement('span');
    label.className = 'course-question-label';
    label.textContent = 'Question';
    const text = document.createElement('strong');
    text.className = 'course-question-text';
    text.textContent = question;
    const description = document.createElement('span');
    description.className = 'course-question-helper';
    description.textContent = helper;
    legend.append(label, text, description);
    fieldset.closest('.course-task-card')?.classList.add('course-question-transition');
    fieldset.querySelectorAll('.course-check-option').forEach((option, index) => {
      option.style.setProperty('--option-index', String(index));
    });
  };

  const routeMotionActions = new Set([
    'dashboard', 'browse', 'saved', 'continue-course', 'course-preferences',
    'preview-complete', 'read-complete', 'next-reading-section',
    'check-typing', 'submit-check', 'continue-check', 'submit-apply',
    'continue-apply', 'next-step', 'start-final-exam', 'next-exam-question',
    'return-course', 'return-to-read', 'simple-read', 'return-from-module-review'
  ]);

  const routeMotionKind = (action) => {
    if (['preview-complete', 'read-complete', 'next-reading-section', 'simple-read', 'return-to-read'].includes(action)) return 'reading';
    if (['check-typing'].includes(action)) return 'typing';
    if (['submit-check', 'continue-check', 'submit-exam-answer', 'next-exam-question'].includes(action)) return 'question';
    if (['submit-apply', 'continue-apply'].includes(action)) return 'applied';
    if (['next-step', 'start-final-exam', 'return-course'].includes(action)) return 'milestone';
    return 'navigation';
  };

  const launchCourseControlMotion = (control, event) => {
    const animationLevel = effectiveAnimationLevel();
    if (!control || animationLevel === 'still' || control.matches(':disabled, [aria-disabled="true"]')) return;
    const rect = control.getBoundingClientRect();
    const hasPointerPosition = Number(event?.clientX) > 0 || Number(event?.clientY) > 0;
    const x = hasPointerPosition ? event.clientX : rect.left + rect.width / 2;
    const y = hasPointerPosition ? event.clientY : rect.top + rect.height / 2;
    const motionId = ++actionMotionSequence;
    const echo = document.createElement('span');
    echo.className = 'course-action-echo course-action-echo--' + animationLevel;
    echo.dataset.actionMotion = String(motionId);
    echo.setAttribute('aria-hidden', 'true');
    echo.style.setProperty('--action-x', x + 'px');
    echo.style.setProperty('--action-y', y + 'px');
    echo.innerHTML = animationLevel === 'lively'
      ? '<i></i><i></i><i></i><b>›</b><b>›</b><b>›</b>'
      : '<i></i>';
    document.body.append(echo);
    window.setTimeout(() => echo.remove(), animationLevel === 'lively' ? 780 : 420);

    const action = control.dataset?.action || '';
    if (animationLevel !== 'lively' || !routeMotionActions.has(action)) return;
    document.querySelectorAll('[data-course-route-motion]').forEach((node) => node.remove());
    const route = document.createElement('div');
    route.className = 'course-route-motion';
    route.dataset.courseRouteMotion = String(motionId);
    route.dataset.direction = supportLanguage() === 'urdu' ? 'rtl' : 'ltr';
    route.dataset.motionKind = routeMotionKind(action);
    route.setAttribute('aria-hidden', 'true');
    route.innerHTML = '<span></span><i></i><b></b>';
    document.body.append(route);
    window.setTimeout(() => route.remove(), 760);
  };

  const currentVisualRouteKey = () => [
    state.view,
    state.progress.phase,
    state.progress.lessonIndex,
    state.progress.finalExam?.questionIndex || 0,
    Number.isInteger(state.reviewModuleIndex) ? state.reviewModuleIndex : ''
  ].join(':');

  const enhancePageEntranceMotion = () => {
    const main = app.querySelector('#course-main');
    if (!main) return;
    const routeKey = currentVisualRouteKey();
    if (routeKey === lastVisualRouteKey) return;
    lastVisualRouteKey = routeKey;
    main.classList.add('is-course-page-entering');
    main.querySelectorAll('.course-module-list > li, .course-catalogue-card, .course-secondary-actions > *').forEach((item, index) => {
      item.style.setProperty('--course-motion-index', String(index));
    });
  };

  const enhanceRenderedCourse = () => {
    structureReadingContent();
    addSourceNotice();
    addCourseConclusion();
    updateCourseCopy();
    buildTypingTester();
    applyRenderedSupportBehavior();
    prepareNarrationForRenderedTask();
    enhanceQuizPresentation();
    enhanceSupportMomentPresentation();
    enhancePageEntranceMotion();
  };

  const renderTask = () => isReviewingModule()
    ? reviewModuleTask()
    : ({ preview: previewTask, read: state.preferences.readAloud ? readTaskWithTextToSpeech : readTask, type: typingTask, check: checkTaskWithFeedback, apply: applyTaskWithFeedback, complete: completionTask, 'exam-intro': finalExamIntroTask, exam: finalExamQuestionTask, 'exam-results': finalExamResultsTask }[state.progress.phase] || previewTask)();

  const courseProgressBar = () => '<section class="course-progress-panel" aria-label="Learning progress"><div><p>Course progress</p><strong>Step ' + (state.progress.lessonIndex + 1) + ' of ' + COURSE.steps.length + '</strong><span>One small step at a time</span></div><div class="course-progress-bars"><div><span>Current step · Task ' + phaseNumber() + ' of 5</span><progress value="' + phaseNumber() + '" max="5">' + phaseNumber() + ' of 5</progress></div><div><span>Course · ' + state.progress.completedSteps.length + ' lessons completed</span><progress value="' + state.progress.completedSteps.length + '" max="' + COURSE.steps.length + '">' + state.progress.completedSteps.length + ' of ' + COURSE.steps.length + '</progress></div></div></section>';

  const helpDetail = () => {
    const step = currentStep();
    const option = state.helpOption;
    if (!option) return '<p class="help-placeholder">Choose the kind of help that would make the next step clearer. You can change your mind at any time.</p>';
    const content = {
      simple: ['A simpler explanation', step.simple],
      example: ['An example', step.example],
      smaller: ['Smaller steps', '1. Read one paragraph. 2. Notice the bold idea. 3. Use the button to continue. You only need to do this one task right now.'],
      hint: ['A gentle hint', step.hint],
      retry: ['Try again', 'This restarts only the current small activity. Your completed course steps stay saved.'],
      break: ['Take a short break', 'Your work is saved. You can close this page or return to the learning overview whenever you are ready.']
    }[option];
    return '<div class="help-detail"><strong>' + escapeHtml(content[0]) + '</strong><p>' + escapeHtml(content[1]) + '</p>' + (option === 'break' ? '<button class="course-primary-button" type="button" data-action="save-exit">Save and exit</button>' : '') + '</div>';
  };

  const explainStepDetails = () => {
    const step = currentStep();
    const phase = state.progress.phase;
    const simple = step.simple || 'This course uses one clear idea at a time.';
    const hint = step.hint || 'Look for the key idea before choosing your next action.';
    if (isReviewingModule()) return {
      purpose: 'This is a review copy of a module you completed earlier. Your current learning position is unchanged.',
      steps: ['Read only the part you want to revisit.', 'Use the simple explanation or example if one would help.', 'Choose “Return to current task” when you are ready.'],
      support: simple
    };
    if (phase === 'preview') return {
      purpose: 'This is a map of the small learning sequence ahead. It is here to remove surprises, not to test you.',
      steps: ['Notice the order: read, type one lesson section, check understanding, then use the idea.', 'You do not need to remember everything from this screen.', 'Choose “Begin this small step” only when the path feels clear enough.'],
      support: 'There is no speed score or countdown. You can pause at any point.'
    };
    if (phase === 'read') return {
      purpose: 'This is the learning part. The goal is to understand one respectful idea about ' + step.title + '.',
      steps: ['Read one heading and its text at a time.', 'Look for the main point instead of trying to memorize every word.', 'Use text to speech, a simpler explanation, or smaller sections if that helps.'],
      support: simple
    };
    if (phase === 'type') {
      const section = usesLessonSectionTyping() ? activeLessonTypingSection() : null;
      return {
        purpose: section
          ? 'This typing activity makes the current lesson section visible. The section is “' + section.section.heading + '.”'
          : 'This typing activity helps make one key idea visible.',
        steps: ['Follow the text shown in the typing area, one character at a time.', 'The blue caret stays at the next character. Green text matches; red text means that character needs a correction.', 'Use Backspace to correct the latest character, then continue when the text is complete.'],
        support: section ? 'You are working on section ' + (section.index + 1) + ' of ' + section.total + '. You only need to work on this section now.' : hint
      };
    }
    if (phase === 'check') return {
      purpose: 'This quick check asks whether the key idea makes sense. It does not measure speed or worth.',
      steps: ['Read the question once.', 'Compare each option with the explanation you just read.', 'Choose the answer that fits best. If it is not right, use the explanation and try again.'],
      support: hint
    };
    if (phase === 'apply') return {
      purpose: 'This practice step asks how the idea could help in a real learning situation.',
      steps: ['Look for the response that is respectful and flexible.', 'Choose the option that makes participation easier without assumptions.', 'Use the lesson’s support ideas as your guide.'],
      support: step.example || hint
    };
    if (phase === 'complete') return {
      purpose: 'This small step is finished. Completion means you worked through it, not that you did it quickly.',
      steps: ['Take a moment if you need one.', 'Choose the next step only when you want to continue.', 'Your course position remains available when you return.'],
      support: simple
    };
    if (phase === 'exam-intro') return {
      purpose: 'This is a calm review of the course. Each question is handled separately.',
      steps: ['Read one question and its options.', 'Choose the answer that best fits the course material.', 'Pause whenever needed; there is no countdown.'],
      support: 'The review is about understanding, not typing speed or competition.'
    };
    if (phase === 'exam') return {
      purpose: 'This question checks one course idea at a time.',
      steps: ['Read the full question before choosing.', 'Use what you learned in the relevant module.', 'Submit when your selected answer feels right.'],
      support: 'You can change your choice before you submit it.'
    };
    return {
      purpose: 'This page shows the learning record for the course.',
      steps: ['Review the information you want to keep.', 'Notice what you would like to revisit.', 'Return to the learning overview when you are ready.'],
      support: 'This record is not a ranking of you.'
    };
  };

  const explainStepMarkup = () => {
    const details = explainStepDetails();
    return '<div class="course-explain-sections"><section><h3>What this step is for</h3><p>' + escapeHtml(details.purpose) + '</p></section><section><h3>A clear way to do it</h3><ol>' + details.steps.map((step) => '<li>' + escapeHtml(step) + '</li>').join('') + '</ol></section><section class="course-explain-support"><h3>If you need a little more support</h3><p>' + escapeHtml(details.support) + '</p></section><section class="course-ai-chat-locked" aria-labelledby="course-ai-chat-title"><div><p class="course-eyebrow">Planned support</p><h3 id="course-ai-chat-title">Course AI chat <span>Locked</span></h3></div><p>AI chat is not available in this prototype. This keeps the help on this page clear, predictable, and human-reviewed while the course is being built.</p><button type="button" disabled aria-disabled="true">Ask the course helper <span>Locked</span></button></section></div>';
  };

  const renderModal = () => {
    if (!state.modal) return '';
    if (state.modal === 'pause') return '<div class="course-modal-backdrop" role="presentation"><section class="course-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title"><button class="course-modal-close" type="button" data-action="close-modal" aria-label="Close pause dialog">×</button><p class="course-eyebrow">Pause and save</p><h2 id="pause-title" tabindex="-1">Your progress is saved.</h2><p>You can come back whenever you’re ready. You will return to ' + escapeHtml(courseReturnLocation()) + '.</p><div class="course-modal-actions"><button class="course-secondary-button" type="button" data-action="close-modal">Keep learning</button><button class="course-primary-button" type="button" data-action="save-exit">Save and exit</button></div></section></div>';
    if (state.modal === 'explain') return '<div class="course-modal-backdrop" role="presentation"><section class="course-modal course-explain-modal" role="dialog" aria-modal="true" aria-labelledby="explain-title"><button class="course-modal-close" type="button" data-action="close-modal" aria-label="Close explanation">×</button><p class="course-eyebrow">Step support</p><h2 id="explain-title" tabindex="-1">Explain this step</h2><p class="course-explain-intro">Here is a calm guide for the task in front of you. Your current work stays in place.</p>' + explainStepMarkup() + '<div class="course-modal-actions"><button class="course-primary-button" type="button" data-action="close-modal">Return to this step</button></div></section></div>';
    return '<div class="course-modal-backdrop" role="presentation"><section class="course-modal course-help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button class="course-modal-close" type="button" data-action="close-modal" aria-label="Close help dialog">×</button><p class="course-eyebrow">Support options</p><h2 id="help-title" tabindex="-1">I’m stuck</h2><p>Choose one way to recover without leaving your lesson.</p><div class="help-choice-grid"><button type="button" data-action="help" data-help-option="simple">Explain more simply</button><button type="button" data-action="help" data-help-option="example">Show an example</button><button type="button" data-action="listen">Read this aloud</button><button type="button" data-action="help" data-help-option="smaller">Break this into smaller steps</button><button type="button" data-action="help" data-help-option="hint">Give me a hint</button><button type="button" data-action="help" data-help-option="retry">Let me try again</button><button type="button" data-action="help" data-help-option="break">Take a short break</button></div>' + helpDetail() + '</section></div>';
  };

  const prepareModalAccessibility = () => {
    const backdrop = app.querySelector('.course-modal-backdrop');
    const dialog = backdrop?.querySelector('[role="dialog"][aria-modal="true"]');
    if (!backdrop || !dialog) return;
    window.requestAnimationFrame(() => {
      if (!state.modal || !dialog.isConnected) return;
      (dialog.querySelector('h2[tabindex="-1"]') || dialog).focus?.({ preventScroll: true });
    });
  };

  const loadCourseMascot = () => {
    if (!mascotCanAppear()) return Promise.resolve(null);
    if (courseMascot) return Promise.resolve(courseMascot);
    if (!mascotControllerLoad) {
      mascotControllerLoad = import('./mascot-3d.js?v=20260802-motion8')
        .then(({ createCourseMascot }) => {
          courseMascot = createCourseMascot();
          return courseMascot;
        })
        .catch(() => null);
    }
    return mascotControllerLoad;
  };

  const syncCourseMascot = () => {
    const stage = app.querySelector('[data-course-mascot-stage]');
    const reducedMotion = effectiveAnimationLevel() === 'still';
    if (!mascotCanAppear() || !stage) {
      courseMascot?.unmount();
      lastMascotScene = '';
      return;
    }
    const scene = mascotScene();
    const supportMoment = activeSupportMoment;
    loadCourseMascot().then((mascot) => {
      // A render may have replaced the target while the controller was being
      // fetched. Never attach a late 3D canvas to a detached page fragment.
      if (!mascot || !stage.isConnected || stage !== app.querySelector('[data-course-mascot-stage]') || !mascotCanAppear()) return;
      mascot.mount(stage, { ...mascotPresentation, reducedMotion, scene, location: state.view });
      if (supportMoment && activeSupportMoment?.id === supportMoment.id && supportMoment.id !== lastMascotSupportEventId) {
        mascot.react(supportMoment);
        lastMascotSupportEventId = supportMoment.id;
        lastMascotScene = scene;
      }
    });
  };

  const render = () => {
    cancelNarrationAutoScroll();
    if (state.view !== 'course' || state.progress.phase !== 'type' || isReviewingModule()) stopVoiceInput();
    applyPreferences();
    let content = '';
    if (state.view === 'dashboard') content = renderDashboard();
    else if (state.view === 'browse') content = renderBrowse();
    else if (state.view === 'saved') content = renderSavedWithFinalExam();
    else content = renderCourseWithFinalExam();
    app.innerHTML = renderShell(content);
    enhanceRenderedCourse();
    syncCourseMascot();
    prepareModalAccessibility();
  };

  mascotViewportQuery?.addEventListener?.('change', () => {
    if (authenticatedUser) render();
  });
  mascotMotionQuery?.addEventListener?.('change', () => {
    if (authenticatedUser) render();
  });
  // A learner may resize a desktop window or rotate a device after the course
  // has loaded. Re-rendering only at the mascot threshold left Lively motion
  // active on a newly small screen. This media query keeps the effective
  // animation level truthful without changing the saved preference.
  compactAnimationQuery?.addEventListener?.('change', () => {
    if (authenticatedUser) render();
  });

  const openCourseModal = (kind, trigger, fallbackSelector) => {
    const action = trigger?.dataset?.action;
    modalReturnFocusSelector = action ? '[data-action="' + action + '"]' : (fallbackSelector || '');
    state.modal = kind;
    render();
  };

  const closeCourseModal = (restoreFocus = true) => {
    const selector = restoreFocus ? modalReturnFocusSelector : '';
    modalReturnFocusSelector = '';
    state.modal = '';
    render();
    if (selector) window.requestAnimationFrame(() => app.querySelector(selector)?.focus?.({ preventScroll: true }));
  };

  const goTo = (view, message) => {
    state.modal = '';
    modalReturnFocusSelector = '';
    state.settingsMenu = false;
    if (view !== 'course') state.reviewModuleIndex = null;
    state.view = view;
    if (view === 'course') recordSupportMoment('task-entry', { result: 'course-return' });
    else clearSupportMoment();
    save(message);
    render();
    if (view === 'course') window.requestAnimationFrame(() => {
      window.scrollTo?.({ left: 0, top: 0, behavior: 'auto' });
      (document.getElementById('course-course-title') || document.getElementById('course-task-heading'))?.focus?.({ preventScroll: true });
    });
  };

  const normaliseText = (value) => value.trim().replace(/\s+/g, ' ').replace(/[“”]/g, '"').replace(/[’]/g, "'");
  const normaliseTypingMatch = (value) => normaliseText(value).toLowerCase().replace(/[.,!?;:]/g, '');

  const focusCurrentTask = (selector = '#course-task-heading') => {
    window.requestAnimationFrame(() => app.querySelector(selector)?.focus?.());
  };

  // A new task is a new page in the learner's flow. Re-rendering while the
  // previous task was scrolled near its action buttons can otherwise leave the
  // next task title cropped above the viewport. Start each new task from its
  // real beginning; focus does not force a second scroll afterwards.
  const showCurrentTaskFromStart = (selector = '#course-task-heading') => {
    window.requestAnimationFrame(() => {
      window.scrollTo?.({ left: 0, top: 0, behavior: 'auto' });
      app.querySelector(selector)?.focus?.({ preventScroll: true });
    });
  };

  const animateReadingSectionChange = () => {
    if (!contentTransitionsAreEnabled()) return;
    const reading = app.querySelector('.course-reading-copy[data-structured="true"]');