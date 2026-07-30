import { COURSE_CONTENT } from './course-content.js';
import { COURSE_AUDIO_MANIFEST, COURSE_AUDIO_MODULE_KEYS } from './course-audio-manifest.js';
import { NarrationService } from './narration.js';
import { createSettingsState, getAvailableInputMethods, hasCompletedLearnerSetup, loadLearnerSettings, markSetupComplete, resolveSettings, saveLearnerSettings, selectPrimaryPreset, setActiveInputMethod, setUserOverride } from '../learner-settings.js?v=20260728-multipreset';

(() => {
  'use strict';

  const STORAGE_NAMESPACE = 'type2learn-course-prototype-v1';
  const app = document.getElementById('course-app');
  const liveRegion = document.getElementById('course-live-region');
  let storageKeys = { preferences: '', course: '', learnerId: '' };
  const narration = { service: null, status: 'idle', activeIndex: -1, activeRange: null, chunks: [], voices: [], scrollFrame: null };
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

  const SUPPORT_OPTIONS = [
    ['smallerSections', 'Smaller content sections', 'Keep explanations short and finishable.'],
    ['readAloud', 'Text-to-speech support', 'Make optional text-to-speech controls easy to reach.'],
    ['fewerDistractions', 'Fewer distractions', 'Keep module navigation while hiding non-essential decoration.'],
    ['gentleReminders', 'Gentle reminders', 'Offer an optional, calm return prompt.'],
    ['extraExamples', 'Extra examples', 'Keep an example ready for each small step.'],
    ['visibleProgress', 'More visible progress', 'Show clear step and course progress.'],
    ['alternativeInput', 'Alternative input', 'Change how you provide an answer when the activity supports another input method.'],
    ['speechToText', 'Voice input and speech-to-text', 'Show a microphone option for eligible activities when browser or device speech recognition is supported.']
  ];

  const PERSONALISATION_OPTIONS = [
    ['readAloud', 'Text to speech', 'Keep optional text-to-speech controls easy to reach.'],
    ['gentleReminders', 'Gentle reminders', 'Offer an optional, calm return prompt.'],
    ['alternativeInput', 'Alternative input', 'Change how you provide an answer when the activity supports another input method.'],
    ['speechToText', 'Voice input and speech-to-text', 'Show a microphone option for eligible activities when browser or device speech recognition is supported.'],
    ['extraExamples', 'More examples', 'Keep an example ready for each small step.'],
    ['textSizeLarge', 'Larger text', 'Start with a more comfortable text size.'],
    ['spacingRelaxed', 'Extra spacing', 'Add more room between lines of text.']
  ];

  const ADVANCED_SUPPORT_OPTIONS = [
    SUPPORT_OPTIONS[0],
    SUPPORT_OPTIONS[2],
    SUPPORT_OPTIONS[5]
  ];

  const safeJson = (value, fallback) => {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  };

  const defaultPreferences = () => resolveSettings(createSettingsState(null));

  const blankAttempt = () => ({
    response: '',
    guidedIndex: 0,
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
    onboarded: false,
    setupStep: 1,
    view: 'setup',
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
    reminderSnoozed: false,
    modal: '',
    helpOption: '',
    manualExampleVisible: false,
    showSimple: false,
    readingSectionIndex: 0,
    reviewModuleIndex: null,
    courseFocusMode: false,
    storageAvailable: true
  });

  const normaliseState = (saved, sharedSettings) => {
    const fresh = defaultState();
    if (!saved || typeof saved !== 'object') return fresh;
    // Shared learner settings are the only live settings source. Historical
    // course preference snapshots are handled once, before normalisation, so a
    // full old resolved object cannot become a permanent set of user overrides.
    fresh.settings = createSettingsState(sharedSettings);
    fresh.onboarded = Boolean(saved.onboarded || fresh.settings.setupComplete);
    fresh.setupStep = saved.setupStep === 2 ? 2 : 1;
    // Setup now lives at /learn/ and shared settings live at /settings/. Older
    // course records may still point at the retired in-course versions; bring
    // those learners to the dashboard instead of exposing stale controls.
    const savedView = ['dashboard', 'course', 'browse', 'saved'].includes(saved.view) ? saved.view : 'dashboard';
    fresh.view = fresh.onboarded ? savedView : 'setup';
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
    fresh.reminderSnoozed = Boolean(saved.reminderSnoozed);
    // Older builds used `showExample` for both a learner's disclosure choice
    // and examples automatically opened by the global setting. Those sources
    // cannot be distinguished safely, so only the new explicit manual value is
    // restored. The resolved global setting is evaluated independently below.
    fresh.manualExampleVisible = Boolean(saved.manualExampleVisible);
    fresh.showSimple = Boolean(saved.showSimple);
    fresh.readingSectionIndex = Math.max(0, Number(saved.readingSectionIndex) || 0);
    fresh.courseFocusMode = Boolean(saved.courseFocusMode);
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
      settingsMigrationVersion: LEGACY_COURSE_SETTINGS_MIGRATION_VERSION,
      onboarded: Boolean(savedPreferences?.onboarded),
      setupStep: savedPreferences?.setupStep === 2 ? 2 : 1,
      reminderSnoozed: Boolean(savedPreferences?.reminderSnoozed)
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
      return normaliseState({
        ...savedCourse,
        onboarded: savedPreferences.onboarded,
        setupStep: savedPreferences.setupStep,
        reminderSnoozed: savedPreferences.reminderSnoozed
      }, sharedSettings);
    } catch (_) {
      const state = defaultState();
      state.storageAvailable = false;
      return state;
    }
  };

  let state = defaultState();

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

  const announce = (message) => {
    if (liveRegion) liveRegion.textContent = message;
  };

  const save = (message) => {
    try {
      if (!storageKeys.preferences || !storageKeys.course) throw new Error('Learner storage is not ready.');
      localStorage.setItem(storageKeys.preferences, JSON.stringify({
        version: 2,
        settingsMigrationVersion: LEGACY_COURSE_SETTINGS_MIGRATION_VERSION,
        onboarded: state.onboarded,
        setupStep: state.setupStep,
        reminderSnoozed: state.reminderSnoozed
      }));
      localStorage.setItem(storageKeys.course, JSON.stringify({
        version: 1,
        view: state.view,
        previousView: state.previousView,
        progress: state.progress,
        manualExampleVisible: state.manualExampleVisible,
        showSimple: state.showSimple,
        readingSectionIndex: state.readingSectionIndex,
        courseFocusMode: state.courseFocusMode
      }));
      state.settings = saveLearnerSettings(storageKeys.learnerId, state.settings);
      state.storageAvailable = true;
      const saveStatus = document.querySelector('[data-save-status]');
      if (saveStatus) saveStatus.textContent = message || 'Saved locally';
      if (message) announce(message);
    } catch (_) {
      state.storageAvailable = false;
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

  const savedTaskLabel = () => ({
    preview: 'Preview this small step',
    read: 'Read this short explanation',
    type: 'Make the key idea visible',
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
      : ({ preview: 'About 30 seconds', read: 'About 1 minute', type: 'About 1 minute', check: 'About 1 minute', apply: 'About 1 minute', complete: 'Ready when you are', 'exam-intro': 'About 10 minutes', exam: 'One question at a time', 'exam-results': 'Ready when you are' }[state.progress.phase] || 'Ready when you are');
    return estimate;
  };

  const applyPreferences = () => {
    // Focus Mode is intentionally a course-only display control. It is saved
    // with this course shell and is not read from the editable learner settings.
    document.body.classList.toggle('course-focus-mode', Boolean(state.courseFocusMode));
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
  const typingIsConceptResponse = () => currentStep()?.typing?.level === 'Recall typing';
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
  const typingIsAccuracyObjective = () => ['Key idea typing', 'Guided typing'].includes(currentStep()?.typing?.level);
  const numericProgressIsReduced = () => state.preferences.numericProgress === 'reduced';

  const courseBackControl = () => '<button class="course-back-control" type="button" data-action="back" aria-label="Go back"><svg class="course-back-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H5M11 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9"/></svg></button>';

  const brand = () => '<a class="course-brand" href="/" aria-label="Type2Learn public site"><img src="/assets/type2learn-logo-nav.webp" alt=""><span>TYPE2LEARN</span></a>';

  const activeCourseNavigation = () => state.view === 'course' ? 'course' : state.view === 'settings' ? 'settings' : 'learning';
  const courseNavigationLink = (href, label, key) => '<a class="course-quiet-button' + (activeCourseNavigation() === key ? ' is-active' : '') + '" href="' + href + '"' + (activeCourseNavigation() === key ? ' aria-current="page"' : '') + '>' + label + '</a>';
  const topbar = (active, showBack = state.setupStep === 2 || ['course', 'browse', 'saved', 'settings'].includes(state.view)) => '<header class="course-topbar"><div class="course-topbar-inner"><div class="course-topbar-brand-area">' + (showBack ? courseBackControl() : '') + brand() + '</div><div class="course-topbar-meta">' + (active ? '<nav class="course-topbar-nav" aria-label="Learner navigation">' + courseNavigationLink('/learn/', 'Learning', 'learning') + courseNavigationLink('/course/', 'Current lesson', 'course') + courseNavigationLink('/settings/', 'Settings', 'settings') + '<button class="course-quiet-button" type="button" data-action="signout">Sign out</button></nav><span class="course-prototype-label">Private learning prototype</span>' : '') + '</div></div></header>';

  const renderAuthChecking = () => topbar(false) + '<main class="course-setup" id="course-main"><div class="course-setup-card course-auth-check"><p class="course-eyebrow">Private course access</p><h1>Checking your sign-in&hellip;</h1><p class="course-lead">Preparing your saved course and learner-controlled settings.</p></div></main>';

  const textToSpeechTransport = () => {
    const canPlay = narration.status !== 'playing' && narration.status !== 'unsupported';
    const canPause = ['playing', 'paused'].includes(narration.status);
    const canStop = ['playing', 'paused'].includes(narration.status);
    const unsupported = narration.status === 'unsupported';
    const playLabel = narration.status === 'paused' ? 'Resume' : narration.status === 'finished' ? 'Listen again' : 'Listen';
    const playAriaLabel = narration.status === 'paused' ? 'Resume text to speech' : narration.status === 'finished' ? 'Listen to the text again' : 'Start text to speech';
    return '<div class="course-tts-transport" role="group" aria-label="Text to speech controls"><span class="course-tts-transport-status" data-tts-status role="status" aria-live="polite">' + escapeHtml(textToSpeechStatusCopy()) + '</span><div class="course-tts-transport-menu"><button class="course-control" type="button" data-action="tts-play" data-tts-play' + (canPlay ? '' : ' disabled') + ' aria-label="' + escapeHtml(playAriaLabel) + '">' + escapeHtml(playLabel) + '</button><button class="course-control" type="button" data-action="tts-pause" data-tts-pause' + (canPause ? '' : ' disabled') + ' aria-label="Pause text to speech">Pause</button><button class="course-control" type="button" data-action="tts-stop" data-tts-stop' + (canStop ? '' : ' disabled') + ' aria-label="Stop text to speech">Stop</button><button class="course-control" type="button" data-action="tts-restart" data-tts-restart' + (unsupported ? ' disabled' : '') + ' aria-label="Restart text to speech">Restart</button></div></div>';
  };

  const supportBar = () => '<section class="course-support-bar' + (state.preferences.readAloud ? ' course-tts-mode-active' : '') + '" aria-label="Learning controls"><div class="course-support-bar-inner"><button class="course-control course-focus-toggle" type="button" data-action="toggle-focus" aria-pressed="' + Boolean(state.courseFocusMode) + '">Focus Mode <span class="course-control-state" aria-hidden="true">' + (state.courseFocusMode ? 'On' : 'Off') + '</span></button><button class="course-control course-tts-toggle" type="button" data-action="toggle-tts" aria-pressed="' + Boolean(state.preferences.readAloud) + '">Text to speech mode <span class="course-control-state" aria-hidden="true">' + (state.preferences.readAloud ? 'On' : 'Off') + '</span></button>' + (state.preferences.readAloud ? textToSpeechTransport() : '') + '<button class="course-help-button" type="button" data-action="stuck">I’m stuck</button></div></section>';

  const preferenceIsSelected = (key) => {
    if (key === 'textSizeLarge') return state.preferences.textSize !== 'standard';
    if (key === 'spacingRelaxed') return state.preferences.spacing === 'relaxed';
    return Boolean(state.preferences[key]);
  };

  const supportOptions = (options = SUPPORT_OPTIONS) => '<div class="support-options">' + (Array.isArray(options) ? options : SUPPORT_OPTIONS).map(([key, label, copy]) => {
    const checked = preferenceIsSelected(key);
    return '<label class="support-option' + (checked ? ' is-selected' : '') + '"><input type="checkbox" data-preference="' + key + '"' + (checked ? ' checked' : '') + '><span class="support-checkbox" aria-hidden="true">✓</span><span><strong>' + label + '</strong><small>' + copy + '</small></span></label>';
  }).join('') + '</div>';

  const setupBuiltInProtections = () => '<p class="course-privacy-note"><strong>Built-in protections:</strong> automatic saving, no countdown timers, and one task at a time.</p>';

  const renderSetup = () => {
    if (state.setupStep === 2) {
      return topbar(false) + '<main class="course-setup" id="course-main"><div class="course-setup-card"><p class="course-setup-step">Step 2 of 2 &middot; Optional personalisation</p><h1>Add the few supports you want now.</h1><p class="course-lead">Keep the starting setup and choose only what feels useful today. You can change these choices anytime.</p>' + setupBuiltInProtections() + supportOptions(PERSONALISATION_OPTIONS) + '<details class="more-support-settings"><summary>More support settings</summary><p>Choose further presentation and pacing settings only if they would help this task feel clearer.</p>' + supportOptions(ADVANCED_SUPPORT_OPTIONS) + '</details><div class="course-setup-actions"><p class="course-privacy-note">Your choices and in-progress work stay in this browser for this signed-in learner. This prototype sends no lesson response or support setting to analytics.</p><button class="course-primary-button" type="button" data-action="finish-setup">Save my setup <span aria-hidden="true">&rarr;</span></button></div></div></main>';
    }
    return topbar(false) + '<main class="course-setup" id="course-main"><div class="course-setup-card"><p class="course-setup-step">Step 1 of 2 &middot; Choose a starting setup</p><h1>Choose a learning setup</h1><p class="course-lead">You can change these choices anytime.</p><article class="focus-flow-preset" aria-labelledby="focus-flow-title"><div class="focus-flow-header"><p>Focus &amp; Flow <span>Recommended</span></p><h2 id="focus-flow-title">One clear next step, with less pressure.</h2></div><p>This starting setup selects optional supports that can keep the course calm and task-focused.</p><ul class="focus-flow-list"><li>Smaller content sections</li><li>Clear step-by-step progress</li><li>Fewer distractions</li></ul>' + setupBuiltInProtections() + '<button class="course-primary-button" type="button" data-action="use-focus-flow">Use Focus &amp; Flow <span aria-hidden="true">&rarr;</span></button></article><div class="course-setup-choice"><div><strong>Customize my setup</strong><p>Choose a few optional supports before you begin.</p></div><button class="course-secondary-button" type="button" data-action="customize-setup">Customize my setup</button></div><p class="course-privacy-note">You do not need to prove, declare, or explain a diagnosis.</p><p class="course-local-note">This prototype saves your choices and in-progress work only in this browser for this signed-in learner.</p></div></main>';
  };

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

  const dashboardCard = () => '<section class="continue-card" aria-labelledby="continue-title"><div><p class="course-eyebrow">Continue learning</p><h2 id="continue-title">' + escapeHtml(COURSE.title) + '</h2><p class="continue-meta">' + currentStepSummary() + '</p><p class="continue-copy">' + escapeHtml(taskLabel()) + '. Your work is saved locally, and you can pause whenever you need.</p></div><button class="course-primary-button" type="button" data-action="continue-course">Continue <span aria-hidden="true">→</span></button></section>';

  const courseIsCompleted = () => Boolean(state.progress.finalExam.completed || state.progress.phase === 'exam-results');

  const dashboardCardWithCompletion = () => {
    if (!courseIsCompleted()) return dashboardCard();
    return '<section class="continue-card course-completed-dashboard" aria-labelledby="continue-title"><div><p class="course-eyebrow">Course completed</p><h2 id="continue-title">' + escapeHtml(COURSE.title) + '</h2><p class="continue-meta"><span>11 modules and final exam completed</span><i aria-hidden="true"></i><span>Saved locally</span></p><p class="continue-copy">Your course is complete. You can review your final exam results whenever you are ready.</p></div><button class="course-primary-button" type="button" data-action="continue-course">Review final exam <span aria-hidden="true">→</span></button></section>';
  };

  const reminder = () => {
    if (!state.preferences.gentleReminders || state.reminderSnoozed) return '';
    return '<aside class="gentle-reminder" aria-label="Optional reminder"><div><p class="course-eyebrow">Optional reminder</p><strong>Would you like to continue your lesson today?</strong><span>You can choose later. There is no streak or penalty.</span></div><div class="gentle-reminder-actions"><button class="course-text-button" type="button" data-action="snooze-reminder">Snooze</button><button class="course-text-button" type="button" data-action="remind-later">Remind me later</button><button class="course-text-button" type="button" data-action="turn-reminders-off">Turn reminders off</button></div></aside>';
  };

  const renderDashboard = () => topbar(true) + '<main class="course-dashboard" id="course-main">' + supportBar() + '<div class="course-dashboard-content"><header class="course-dashboard-header"><p class="course-eyebrow">Your learning space</p><h1>One small step at a time.</h1><p>You have one clear place to return to. There are no timers, streaks, rankings, or speed scores in this course.</p></header>' + dashboardCardWithCompletion() + reminder() + '<nav class="course-secondary-actions" aria-label="Course options"><button type="button" data-action="browse"><span aria-hidden="true">⌕</span><strong>Browse courses</strong><small>Keep choices simple</small></button><button type="button" data-action="saved"><span aria-hidden="true">▣</span><strong>Saved lessons</strong><small>Return to the exact step</small></button><button type="button" data-action="settings"><span aria-hidden="true">⚙</span><strong>Support settings</strong><small>Change what helps</small></button></nav><p class="course-local-note" data-save-status>' + (state.storageAvailable ? 'Your progress is saved locally in this browser.' : 'Saving is unavailable in this browser session.') + '</p></div></main>';

  const renderBrowse = () => topbar(true) + '<main class="course-dashboard" id="course-main">' + supportBar() + '<div class="course-dashboard-content course-panel-page"><button class="course-back-button" type="button" data-action="dashboard">← Back to learning overview</button><p class="course-eyebrow">Browse courses</p><h1>One course is ready for this prototype.</h1><p class="course-lead">Keeping the next choice small helps this experience stay task-focused. More courses can appear here once their content is reviewed.</p><article class="course-listing"><div><span class="course-status">Prototype course</span><h2>' + escapeHtml(COURSE.title) + '</h2><p>' + COURSE.steps.length + ' short, non-diagnostic modules about general experiences, respectful language, and accessible participation.</p></div><button class="course-primary-button" type="button" data-action="continue-course">Open course <span aria-hidden="true">→</span></button></article></div></main>';

  const renderSaved = () => topbar(true) + '<main class="course-dashboard" id="course-main">' + supportBar() + '<div class="course-dashboard-content course-panel-page"><button class="course-back-button" type="button" data-action="dashboard">← Back to learning overview</button><p class="course-eyebrow">Saved lessons</p><h1>Your learning is waiting in one clear place.</h1><p class="course-lead">The course returns to the current small task, along with your response and support choices in this browser.</p><article class="saved-card"><span class="course-status">Saved locally</span><h2>' + escapeHtml(COURSE.title) + '</h2><p>' + escapeHtml(currentStep().title) + ' · ' + escapeHtml(taskLabel()) + '</p><div><button class="course-primary-button" type="button" data-action="continue-course">Return to this step <span aria-hidden="true">→</span></button><button class="course-secondary-button" type="button" data-action="restart-activity">Restart this small activity</button></div></article></div></main>';

  const renderSettings = () => topbar(true) + '<main class="course-dashboard" id="course-main">' + supportBar() + '<div class="course-dashboard-content course-panel-page"><button class="course-back-button" type="button" data-action="settings-back">← Back</button><p class="course-eyebrow">Support settings</p><h1>Change what helps.</h1><p class="course-lead">These choices apply across this course. They are private, optional, and never ask you to prove or declare a diagnosis.</p>' + supportOptions('settings') + '<aside class="settings-note"><strong>About reminders</strong><p>When gentle reminders are on, this prototype can show one optional return prompt on its learning overview. It does not send notifications, use streaks, or mark a learner as behind.</p></aside><p class="course-local-note" data-save-status>' + (state.storageAvailable ? 'Changes save locally as you make them.' : 'Saving is unavailable in this browser session.') + '</p></div></main>';

  const moduleOutlineRow = (step, index, includeFinalExam = false) => {
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

  const courseOutline = () => '<aside class="course-sidebar" aria-label="' + (state.preferences.visibleProgress ? 'Course progress' : 'Course module navigation') + '"><div class="course-sidebar-intro"><p class="course-eyebrow">' + (state.preferences.visibleProgress ? 'Course progress' : 'Course modules') + '</p><h2>' + escapeHtml(COURSE.title) + '</h2><p>' + COURSE.steps.length + ' small modules. You can pause and return whenever you are ready.</p></div><ol class="course-outline">' + COURSE.steps.map((step, index) => moduleOutlineRow(step, index)).join('') + '</ol></aside>';

  const courseOutlineWithFinalExam = () => {
    const modules = COURSE.steps.map((step, index) => moduleOutlineRow(step, index, true)).join('');
    const examActive = isFinalExamPhase() && !isReviewingModule();
    const examComplete = Boolean(state.progress.finalExam.completed);
    const examStatus = examActive
      ? taskLabel()
      : examComplete
        ? 'Completed'
        : 'Available after module ' + COURSE.steps.length;
    const examItem = '<li class="course-outline-exam ' + (examComplete ? 'is-complete ' : '') + (examActive ? 'is-active' : '') + '"><span>' + (examComplete ? '✓' : COURSE.steps.length + 1) + '</span><div><strong>' + escapeHtml(finalExam().title || 'Final exam') + '</strong><small>' + escapeHtml(examStatus) + '</small></div></li>';
    return '<aside class="course-sidebar" aria-label="' + (state.preferences.visibleProgress ? 'Course progress' : 'Course module navigation') + '"><div class="course-sidebar-intro"><p class="course-eyebrow">' + (state.preferences.visibleProgress ? 'Course progress' : 'Course modules') + '</p><h2>' + escapeHtml(COURSE.title) + '</h2><p>' + COURSE.steps.length + ' small modules and one final exam. You can pause and return whenever you are ready.</p></div><ol class="course-outline">' + modules + examItem + '</ol></aside>';
  };

  const courseNextStepCopy = () => {
    if (isReviewingModule()) return 'Return to your saved current task';
    return ({
    preview: 'Read the short explanation',
    read: 'Make one key idea visible',
    type: 'Check understanding',
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

  const restartActivityLabel = () => {
    if (state.progress.phase === 'exam') return 'Restart this question';
    if (state.progress.phase === 'exam-intro' || state.progress.phase === 'exam-results') return 'Restart final exam';
    return 'Restart this small activity';
  };

  const courseLessonFooter = () => {
    if (isReviewingModule()) {
      return '<footer class="course-lesson-footer course-review-footer"><span>Your current task is still saved: <strong>' + escapeHtml(courseReturnLocation()) + '</strong></span><button class="course-secondary-button" type="button" data-action="return-from-module-review">Return to current task</button></footer>';
    }
    return '<footer class="course-lesson-footer"><button class="course-text-button course-restart-button" type="button" data-action="restart-activity">' + escapeHtml(restartActivityLabel()) + '</button><span>Where will I return? <strong>' + escapeHtml(courseReturnLocation()) + '</strong></span><button class="course-secondary-button" type="button" data-action="pause">Pause and save</button></footer>';
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

  const renderCourseWithFinalExam = () => topbar(true) + '<main class="course-learning" id="course-main">' + supportBar() + '<div class="course-learning-shell">' + courseOutlineWithFinalExam() + '<section class="course-workspace"><button class="course-back-button" type="button" data-action="dashboard">&larr; Back to learning overview</button><header class="course-heading"><div><p class="course-eyebrow">' + escapeHtml(isReviewingModule() ? COURSE.label : isFinalExamPhase() ? 'Course final exam' : COURSE.label) + '</p><h1>' + escapeHtml(COURSE.title) + '</h1><p class="course-step-meta">' + currentStepSummary() + '</p></div><span class="course-saved-status" data-save-status>' + (state.storageAvailable ? 'Saved locally' : 'Saving unavailable') + '</span></header><section class="course-now-panel"><div><span>What am I doing?</span><strong>' + escapeHtml(taskLabel()) + '</strong></div><div><span>What is next?</span><strong>' + escapeHtml(courseNextStepCopy()) + '</strong></div><div><span>Can I pause?</span><strong>Yes. Your progress is saved.</strong></div></section>' + renderTask() + courseProgressWithFinalExam() + courseLessonFooter() + '</section></div></main>' + renderModal();

  const renderSavedWithFinalExam = () => topbar(true) + '<main class="course-dashboard" id="course-main">' + supportBar() + '<div class="course-dashboard-content course-panel-page"><button class="course-back-button" type="button" data-action="dashboard">&larr; Back to learning overview</button><p class="course-eyebrow">Saved lessons</p><h1>Your learning is waiting in one clear place.</h1><p class="course-lead">The course returns to the current small task, along with your response and support choices in this browser.</p><article class="saved-card"><span class="course-status">Saved locally</span><h2>' + escapeHtml(COURSE.title) + '</h2><p>' + escapeHtml(courseReturnLocation()) + '</p><div><button class="course-primary-button" type="button" data-action="continue-course">Return to this step <span aria-hidden="true">→</span></button><button class="course-secondary-button course-restart-button" type="button" data-action="restart-activity">' + escapeHtml(restartActivityLabel()) + '</button></div></article></div></main>';

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

  const contentTransitionsAreEnabled = () => Boolean(
    state.preferences.contentTransitions
      && !state.preferences.reducedMotion
      && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  );

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

  const previewTask = () => '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">Preview</p><h2 id="course-task-heading" tabindex="-1">See the path before you begin</h2><p>This step contains reading, a short typing or microphone-supported response, a quick check, and one adapted practice activity.</p></div><span class="course-task-time">' + taskTime() + '</span></div><div class="course-reading-copy"><section class="course-reading-section"><h3>Objective</h3><p>Understand one respectful idea from “' + escapeHtml(currentStep().title) + '” and use it in a small situation.</p></section><section class="course-reading-section"><h3>What stays in your control</h3><p>You can pause, use support controls, use your usual compatible input tools, or ask for help. There are no countdown timers, speed scores, or autoplay audio.</p></section><section class="course-reading-section"><h3>Completion</h3><p>Read, make the key idea visible, check understanding, and choose a practical response.</p></section></div><div class="course-task-actions"><button class="course-primary-button" type="button" data-action="preview-complete">Begin this small step <span aria-hidden="true">→</span></button></div></article>';

  const readTask = () => '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">Learn</p><h2 id="course-task-heading" tabindex="-1">Read this short explanation</h2><p>' + (smallerSectionsAreActive() ? 'Read one small section at a time. You decide when to move to the next part.' : 'Read at your own pace. This section is designed to be finishable in a few minutes.') + '</p></div><span class="course-task-time">' + taskTime() + '</span></div>' + readingSectionProgress() + '<div class="course-reading-copy" data-structured="true">' + readingContentMarkup(false) + '</div><div class="course-task-actions">' + readingTaskActions() + '</div></article>';

  const readTaskWithTextToSpeech = () => '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">Learn</p><h2 id="course-task-heading" tabindex="-1">Read this short explanation</h2><p>Text to speech mode is on. Click or tap inside the text where you want it to begin, or focus a text part and press Enter or Space. The current word is highlighted as it is read.</p></div><span class="course-task-time">' + taskTime() + '</span></div>' + readingSectionProgress() + '<div class="course-reading-copy course-tts-reading" data-narration-content data-structured="true">' + readingContentMarkup(true) + '</div><div class="course-task-actions">' + readingTaskActions() + '</div></article>';

  const reviewModuleTask = () => {
    const interactive = Boolean(state.preferences.readAloud);
    return '<article class="course-task-card course-review-card"><div class="course-task-top"><div><p class="course-task-label">Completed module review</p><h2 id="course-task-heading" tabindex="-1">' + escapeHtml(currentStep().title) + '</h2><p>You are reviewing a completed module. Your current task is still saved and will be ready when you return.</p></div><span class="course-task-time">' + escapeHtml(taskTime()) + '</span></div><div class="course-reading-copy' + (interactive ? ' course-tts-reading' : '') + '"' + (interactive ? ' data-narration-content' : '') + ' data-structured="true">' + readingContentMarkup(interactive) + '</div><div class="course-task-actions"><button class="course-primary-button" type="button" data-action="return-from-module-review">Return to current task <span aria-hidden="true">→</span></button></div></article>';
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
    if (typing.level !== 'Guided typing') return inputMethodSelector() + '<p class="typing-target">' + escapeHtml(typing.target || '') + '</p>';
    const phraseIndex = Math.min(state.progress.attempt.guidedIndex, typing.phrases.length - 1);
    return inputMethodSelector() + '<div class="guided-typing"><span>Phrase ' + (phraseIndex + 1) + ' of ' + typing.phrases.length + '</span><p class="typing-target">' + escapeHtml(typing.phrases[phraseIndex]) + '</p></div>';
  };

  const typingTask = () => {
    const typing = currentStep().typing;
    const attempt = state.progress.attempt;
    const voiceInputAvailable = typingAllowsVoiceInput();
    const responseLabel = voiceInputAvailable ? 'Type or speak your response' : 'Type your response';
    const inputHelp = voiceInputAvailable
      ? 'Use the microphone beside the response field to speak, or type your response. Speech input starts only when you choose the microphone.'
      : typing.level === 'Recall typing'
        ? 'Use your own words. Your response is not ranked or scored for speed.'
        : 'Paste is blocked in keyboard practice. Press Enter to check this response. Use Shift+Enter for a new line.';
    const feedback = attempt.feedback ? '<p class="typing-feedback" role="alert">' + escapeHtml(attempt.feedback) + '</p>' : '';
    const integrity = attempt.integrityNotice ? '<p class="integrity-note">A large amount of text appeared at once. That is okay—this course will use a short understanding check rather than a speed score.</p>' : '';
    return '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">' + escapeHtml(typing.level) + '</p><h2 id="course-task-heading" tabindex="-1">Make one idea visible</h2><p>' + escapeHtml(typing.prompt) + '</p></div><span class="course-task-time">' + taskTime() + '</span></div><div class="typing-practice"><p class="typing-note">Use this space to show your thinking. It is not ranked or scored for speed.</p>' + typingTarget() + '<label class="course-input-label" for="course-typing-input">' + responseLabel + '</label><textarea id="course-typing-input" data-typing-input rows="4" autocomplete="off" autocorrect="off" spellcheck="true" placeholder="' + escapeHtml(typing.placeholder || 'Type the key idea here…') + '" aria-describedby="typing-help">' + escapeHtml(attempt.response) + '</textarea><p id="typing-help" class="course-input-help">' + inputHelp + '</p>' + integrity + feedback + '</div><div class="course-task-actions"><button class="course-secondary-button" type="button" data-action="restart-activity">Try this activity again</button><button class="course-primary-button" type="button" data-action="check-typing">' + (typing.level === 'Guided typing' && attempt.guidedIndex < typing.phrases.length - 1 ? 'Check this phrase' : typing.level === 'Recall typing' ? 'Review my explanation' : 'Check my sentence') + ' <span aria-hidden="true">→</span></button></div></article>';
  };

  const checkTask = () => {
    const check = currentStep().check;
    const selected = state.progress.attempt.selectedAnswer;
    const feedback = state.progress.attempt.feedback;
    return '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">Quick check</p><h2 id="course-task-heading" tabindex="-1">Check understanding</h2><p>Choose the answer that best matches the short explanation.</p></div><span class="course-task-time">' + taskTime() + '</span></div>' + (state.progress.attempt.integrityNotice ? '<p class="integrity-note">This quick check keeps the focus on understanding, not on how text entered the box.</p>' : '') + '<fieldset class="course-check-options"><legend>' + escapeHtml(check.question) + '</legend>' + check.options.map(([label, correct], index) => '<label class="course-check-option' + (selected === String(index) ? ' is-selected' : '') + '"><input type="radio" name="course-check" value="' + index + '" data-check-answer' + (selected === String(index) ? ' checked' : '') + '><span>' + escapeHtml(label) + '</span></label>').join('') + '</fieldset>' + (feedback ? '<p class="check-feedback" role="alert">' + escapeHtml(feedback) + '</p>' : '') + '<div class="course-task-actions">' + (feedback && selected && !check.options[Number(selected)][1] ? '<button class="course-secondary-button" type="button" data-action="return-to-read">Read this step again</button><button class="course-secondary-button" type="button" data-action="simple-read">Explain more simply</button>' : '') + '<button class="course-primary-button" type="button" data-action="submit-check"' + (selected === '' ? ' disabled' : '') + '>Check understanding <span aria-hidden="true">→</span></button></div></article>';
  };

  const practiceSupport = () => currentStep().content?.supports?.[0] || currentStep().example || 'Ask the learner what would help with the task.';
  const applyTask = () => {
    const selected = state.progress.attempt.selectedAnswer;
    const choices = [[practiceSupport(), true], ['Assume one support will work for everyone.', false], ['Make the learner explain or prove a diagnosis before offering support.', false], ['Withhold support until the learner finishes the task alone.', false]];
    const feedback = state.progress.attempt.feedback;
    return '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">Adapted practice</p><h2 id="course-task-heading" tabindex="-1">Use the idea in a small situation</h2><p>A learner is working on a similar task. Which response best uses the idea from this module?</p></div><span class="course-task-time">' + taskTime() + '</span></div><fieldset class="course-check-options"><legend>Choose one practical response.</legend>' + choices.map(([label], index) => '<label class="course-check-option' + (selected === String(index) ? ' is-selected' : '') + '"><input type="radio" name="course-apply" value="' + index + '" data-apply-answer' + (selected === String(index) ? ' checked' : '') + '><span>' + escapeHtml(label) + '</span></label>').join('') + '</fieldset>' + (feedback ? '<p class="check-feedback" role="alert">' + escapeHtml(feedback) + '</p>' : '') + '<div class="course-task-actions"><button class="course-primary-button" type="button" data-action="submit-apply"' + (selected === '' ? ' disabled' : '') + '>Finish this step <span aria-hidden="true">→</span></button></div></article>';
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
    const feedback = submitted
      ? '<p id="course-quiz-feedback" class="check-feedback ' + (correct ? 'is-correct' : 'is-incorrect') + '" role="status" aria-live="polite" tabindex="-1"><strong>' + (correct ? 'Correct.' : 'Not quite.') + '</strong> ' + (correct ? 'Your answer is saved. Continue when you are ready.' : 'The correct answer is marked. Try the question again to reconstruct the idea.') + '</p>'
      : '';
    const actions = !submitted
      ? '<button class="course-primary-button" type="button" data-action="submit-check"' + (selected === null ? ' disabled' : '') + '>Submit answer <span aria-hidden="true">→</span></button>'
      : correct
        ? '<button class="course-primary-button" type="button" data-action="continue-check">Continue <span aria-hidden="true">→</span></button>'
        : '<button class="course-secondary-button" type="button" data-action="restart-activity">Try this question again</button><button class="course-secondary-button" type="button" data-action="return-to-read">Read this step again</button><button class="course-secondary-button" type="button" data-action="simple-read">Explain more simply</button>';
    return '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">Quick check</p><h2 id="course-task-heading" tabindex="-1">Check understanding</h2><p>Choose the answer that best matches the short explanation.</p></div><span class="course-task-time">' + taskTime() + '</span></div>' + (state.progress.attempt.integrityNotice ? '<p class="integrity-note">This quick check keeps the focus on understanding, not on how text entered the box.</p>' : '') + '<fieldset class="course-check-options' + (submitted ? ' is-submitted' : '') + '"><legend>' + escapeHtml(check.question) + '</legend>' + renderedTaskOptions(check.options, 'course-check', 'data-check-answer') + '</fieldset>' + feedback + '<div class="course-task-actions">' + actions + '</div></article>';
  };

  const applyTaskWithFeedback = () => {
    const choices = [[practiceSupport(), true], ['Assume one support will work for everyone.', false], ['Make the learner explain or prove a diagnosis before offering support.', false], ['Withhold support until the learner finishes the task alone.', false]];
    const selected = state.progress.attempt.selectedAnswer === '' ? null : Number(state.progress.attempt.selectedAnswer);
    const correctIndex = choices.findIndex(([, correct]) => correct);
    const submitted = Boolean(state.progress.attempt.submitted);
    const correct = submitted && selected === correctIndex;
    const feedback = submitted
      ? '<p id="course-quiz-feedback" class="check-feedback ' + (correct ? 'is-correct' : 'is-incorrect') + '" role="status" aria-live="polite" tabindex="-1"><strong>' + (correct ? 'Correct.' : 'Not quite.') + '</strong> ' + (correct ? 'This response uses a support named in this module. Continue when you are ready.' : 'The helpful response is marked. Try the small situation again when you are ready.') + '</p>'
      : '';
    const actions = !submitted
      ? '<button class="course-primary-button" type="button" data-action="submit-apply"' + (selected === null ? ' disabled' : '') + '>Submit answer <span aria-hidden="true">→</span></button>'
      : correct
        ? '<button class="course-primary-button" type="button" data-action="continue-apply">Complete this step <span aria-hidden="true">→</span></button>'
        : '<button class="course-secondary-button" type="button" data-action="restart-activity">Try this question again</button>';
    return '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">Adapted practice</p><h2 id="course-task-heading" tabindex="-1">Use the idea in a small situation</h2><p>A learner is working on a similar task. Which response best uses the idea from this module?</p></div><span class="course-task-time">' + taskTime() + '</span></div><fieldset class="course-check-options' + (submitted ? ' is-submitted' : '') + '"><legend>Which response best uses the idea from this module?</legend>' + renderedTaskOptions(choices, 'course-apply', 'data-apply-answer') + '</fieldset>' + feedback + '<div class="course-task-actions">' + actions + '</div></article>';
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

  const finalExamIntroTask = () => '<article class="course-task-card course-final-exam exam-intro-card"><div class="course-task-top"><div><p class="course-task-label">Final exam</p><h2 id="course-task-heading" tabindex="-1">Finish with one question at a time.</h2><p>' + escapeHtml(finalExam().description || 'Use what you learned across the course.') + '</p></div><span class="course-task-time">About 10 minutes</span></div><p>This is a calm review of the course. There are ' + finalExamQuestionCount() + ' multiple-choice questions, each with four choices. There is no timer, speed score, or ranking.</p><p>Your progress is saved after each choice. You can pause and return to the same question whenever you need.</p><div class="course-task-actions"><button class="course-secondary-button" type="button" data-action="save-exit">Save and exit</button><button class="course-primary-button" type="button" data-action="start-final-exam">Start final exam <span aria-hidden="true">→</span></button></div></article>';

  const finalExamQuestionTask = () => {
    const exam = state.progress.finalExam;
    const question = currentFinalExamQuestion();
    if (!question) return '<article class="course-task-card course-final-exam"><p class="course-task-label">Final exam</p><h2 id="course-task-heading" tabindex="-1">The final exam is not available.</h2><p>Please return to the course overview and try again.</p><div class="course-task-actions"><button class="course-primary-button" type="button" data-action="dashboard">Return to learning overview</button></div></article>';
    const selected = exam.answers[exam.questionIndex];
    const correctIndex = question.options.findIndex(([, correct]) => correct);
    const submitted = Boolean(exam.submitted);
    const feedback = submitted
      ? selected === correctIndex
        ? '<p id="exam-feedback" class="exam-feedback is-correct" role="status" aria-live="polite" tabindex="-1"><strong>Correct.</strong> Your answer is saved. Choose Next question when you are ready.</p>'
        : '<p id="exam-feedback" class="exam-feedback is-incorrect" role="status" aria-live="polite" tabindex="-1"><strong>Not quite.</strong> The correct answer is marked so you can review it before moving on.</p>'
      : '';
    const action = submitted
      ? '<button class="course-primary-button" type="button" data-action="next-exam-question">' + (exam.questionIndex === finalExamQuestionCount() - 1 ? 'See final results' : 'Next question') + ' <span aria-hidden="true">→</span></button>'
      : '<button class="course-primary-button" type="button" data-action="submit-exam-answer"' + (selected === null || typeof selected === 'undefined' ? ' disabled' : '') + '>Submit answer <span aria-hidden="true">→</span></button>';
    return '<article class="course-task-card course-final-exam"><div class="course-task-top"><div><p class="course-task-label">Final exam</p><h2 id="course-task-heading" tabindex="-1">Answer one question at a time.</h2><p>Choose the answer that best fits what you learned. You can change your choice before you submit it.</p></div><span class="course-task-time">One question at a time</span></div><fieldset class="course-check-options" aria-describedby="exam-question-help' + (submitted ? ' exam-feedback' : '') + '"><legend class="exam-question-card" id="exam-question-card" tabindex="-1"><span class="exam-question-count">Question ' + (exam.questionIndex + 1) + ' of ' + finalExamQuestionCount() + '</span><strong>' + escapeHtml(question.question) + '</strong><span id="exam-question-help">Choose one answer, then submit when you are ready.</span></legend>' + question.options.map(([label], index) => '<label class="course-check-option exam-option' + examOptionState(index, selected, correctIndex, submitted) + '"><input type="radio" name="final-exam-answer" value="' + index + '" data-exam-answer' + (index === selected ? ' checked' : '') + (submitted ? ' disabled' : '') + '><span class="exam-option-copy">' + escapeHtml(label) + '</span>' + examOptionFeedback(index, selected, correctIndex, submitted) + '</label>').join('') + '</fieldset>' + feedback + '<div class="course-task-actions"><button class="course-secondary-button course-restart-button" type="button" data-action="restart-activity">Restart this question</button>' + action + '</div></article>';
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
    return '<article class="course-task-card course-final-exam exam-results-card"><div class="course-task-top"><div><p class="course-task-label">Final exam results</p><h2 id="course-task-heading" tabindex="-1">Your course review is complete.</h2><p>Your score is based only on the answers you selected. It does not use time, typing speed, or your support settings.</p></div><span class="course-task-time">Saved locally</span></div><section class="exam-score" aria-label="Final exam score"><strong class="exam-score-value">' + score + '/' + total + '</strong><div><p>' + percentage + '% correct</p><span>' + score + ' correct · ' + incorrect + ' incorrect</span></div></section><section aria-labelledby="exam-review-heading"><h3 id="exam-review-heading">Question-by-question review</h3><p>Review what you selected and the correct answer for each question.</p><ol class="exam-review-list">' + review + '</ol></section><div class="course-task-actions"><button class="course-secondary-button course-restart-button" type="button" data-action="restart-final-exam">Try final exam again</button><button class="course-primary-button" type="button" data-action="return-course">Return to learning overview <span aria-hidden="true">→</span></button></div></article>';
  };

  const activeTypingReference = () => {
    const typing = currentStep().typing;
    if (typing.level === 'Guided typing') {
      return typing.phrases[Math.min(state.progress.attempt.guidedIndex, typing.phrases.length - 1)] || '';
    }
    return typing.target || typing.reference || '';
  };

  const renderTypingCharacters = (reference, response) => {
    const referenceCharacters = Array.from(reference);
    const responseCharacters = Array.from(response);
    const referenceMarkup = referenceCharacters.map((character, index) => {
      if (index >= responseCharacters.length) return '<span class="typing-character is-pending">' + escapeHtml(character) + '</span>';
      const stateClass = responseCharacters[index] === character ? 'is-correct' : 'is-incorrect';
      return '<span class="typing-character ' + stateClass + '">' + escapeHtml(responseCharacters[index]) + '</span>';
    }).join('');
    const extraMarkup = responseCharacters.slice(referenceCharacters.length)
      .map((character) => '<span class="typing-character is-extra">' + escapeHtml(character) + '</span>')
      .join('');
    return referenceMarkup + extraMarkup;
  };

  const syncTypingTester = (input) => {
    const field = input.closest('.typing-tester');
    const overlay = field?.querySelector('[data-typing-overlay]');
    if (!overlay) return;
    overlay.innerHTML = renderTypingCharacters(activeTypingReference(), input.value);
    overlay.scrollTop = input.scrollTop;
    overlay.scrollLeft = input.scrollLeft;
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
    const voiceInputAvailable = typingAllowsVoiceInput();
    const freeResponse = typing.level === 'Recall typing';
    const voiceTaskKey = [state.progress.lessonIndex, typing.level, state.progress.attempt.guidedIndex].join(':');
    if (voiceInput.taskKey !== voiceTaskKey) {
      if (voiceInput.statusTimer) window.clearTimeout(voiceInput.statusTimer);
      voiceInput.statusTimer = null;
      voiceInput.taskKey = voiceTaskKey;
      voiceInput.status = 'ready';
    }
    const reference = activeTypingReference();
    const field = document.createElement('div');
    field.className = 'typing-tester' + (freeResponse ? ' is-free-response' : '');

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

    const phraseLabel = typing.level === 'Guided typing'
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
    syncTypingTester(textarea);
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
    if (workspace && state.preferences.advanceNotice && !workspace.querySelector('[data-transition-notice]')) {
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

  const addSetupControl = () => {};

  const addSettingsPreset = () => {
    if (state.view !== 'settings') return;
    const options = app.querySelector('.support-options');
    if (!options || app.querySelector('[data-preset-settings]')) return;
    const preset = document.createElement('section');
    preset.className = 'course-preset-settings';
    preset.dataset.presetSettings = '';
    preset.innerHTML = '<p class="course-eyebrow">Focus &amp; Flow</p><h2>Start from the recommended setup.</h2><p>Apply smaller sections, one task at a time, no countdown timers, pause and autosave, visible progress, and fewer distractions. You can still change every setting below.</p><button class="course-primary-button" type="button" data-action="apply-focus-flow">Apply Focus &amp; Flow</button>';
    options.insertAdjacentElement('beforebegin', preset);
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
      const outlineCopy = app.querySelector('.course-sidebar-intro p:last-child');
      if (outlineCopy) outlineCopy.textContent = COURSE.steps.length + ' small modules and one final exam. You can pause and return whenever you are ready.';
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

  const narrationScrollTopClearance = () => {
    const stickyBottom = ['.course-topbar', '.course-support-bar']
      .map((selector) => app.querySelector(selector)?.getBoundingClientRect?.().bottom || 0)
      .reduce((largest, bottom) => Math.max(largest, bottom), 0);
    return Math.max(24, stickyBottom + 18);
  };

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

    app.querySelectorAll('[data-tts-status]').forEach((item) => {
      item.textContent = textToSpeechStatusCopy();
    });
    app.querySelectorAll('[data-tts-play]').forEach((button) => {
      button.disabled = narration.status === 'playing' || narration.status === 'unsupported';
      button.textContent = narration.status === 'paused' ? 'Resume' : narration.status === 'finished' ? 'Listen again' : 'Listen';
      button.setAttribute('aria-label', narration.status === 'paused' ? 'Resume text to speech' : narration.status === 'finished' ? 'Listen to the text again' : 'Start text to speech');
    });
    app.querySelectorAll('[data-tts-pause]').forEach((button) => {
      button.disabled = narration.status !== 'playing';
      button.textContent = 'Pause';
      button.setAttribute('aria-label', 'Pause text to speech');
    });
    app.querySelectorAll('[data-tts-stop]').forEach((button) => {
      button.disabled = !['playing', 'paused'].includes(narration.status);
    });
    app.querySelectorAll('[data-tts-restart]').forEach((button) => {
      button.disabled = narration.status === 'unsupported';
    });

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
    if (state.progress.phase === 'type') return [{ id: 'task-prompt', label: 'Current typing task', text: [typing.prompt, typing.target || typing.reference].filter(Boolean).join('. ') }];
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

  const enhanceRenderedCourse = () => {
    addSetupControl();
    addSettingsPreset();
    structureReadingContent();
    addSourceNotice();
    addCourseConclusion();
    updateCourseCopy();
    buildTypingTester();
    applyRenderedSupportBehavior();
    prepareNarrationForRenderedTask();
    enhanceQuizPresentation();
  };

  const renderTask = () => isReviewingModule()
    ? reviewModuleTask()
    : ({ preview: previewTask, read: state.preferences.readAloud ? readTaskWithTextToSpeech : readTask, type: typingTask, check: checkTaskWithFeedback, apply: applyTaskWithFeedback, complete: completionTask, 'exam-intro': finalExamIntroTask, exam: finalExamQuestionTask, 'exam-results': finalExamResultsTask }[state.progress.phase] || previewTask)();

  const courseProgressBar = () => '<section class="course-progress-panel" aria-label="Learning progress"><div><p>Course progress</p><strong>Step ' + (state.progress.lessonIndex + 1) + ' of ' + COURSE.steps.length + '</strong><span>One small step at a time</span></div><div class="course-progress-bars"><div><span>Current step · Task ' + phaseNumber() + ' of 5</span><progress value="' + phaseNumber() + '" max="5">' + phaseNumber() + ' of 5</progress></div><div><span>Course · ' + state.progress.completedSteps.length + ' lessons completed</span><progress value="' + state.progress.completedSteps.length + '" max="' + COURSE.steps.length + '">' + state.progress.completedSteps.length + ' of ' + COURSE.steps.length + '</progress></div></div></section>';

  const renderCourse = () => topbar(true) + '<main class="course-learning" id="course-main">' + supportBar() + '<div class="course-learning-shell">' + courseOutline() + '<section class="course-workspace"><button class="course-back-button" type="button" data-action="dashboard">← Back to learning overview</button><header class="course-heading"><div><p class="course-eyebrow">' + escapeHtml(COURSE.label) + '</p><h1>' + escapeHtml(COURSE.title) + '</h1><p class="course-step-meta">' + currentStepSummary() + '</p></div><span class="course-saved-status" data-save-status>' + (state.storageAvailable ? 'Saved locally' : 'Saving unavailable') + '</span></header><section class="course-now-panel"><div><span>What am I doing?</span><strong>' + escapeHtml(taskLabel()) + '</strong></div><div><span>What is next?</span><strong>' + (state.progress.phase === 'preview' ? 'Read the short explanation' : state.progress.phase === 'read' ? 'Make one key idea visible' : state.progress.phase === 'type' ? 'Check understanding' : state.progress.phase === 'check' ? 'Use the idea in a small situation' : state.progress.phase === 'apply' ? 'Mark this step complete' : isLastStep() ? 'Return to your overview' : 'Preview the next short step') + '</strong></div><div><span>Can I pause?</span><strong>Yes. Your progress is saved.</strong></div></section>' + renderTask() + courseProgressBar() + '<footer class="course-lesson-footer"><button class="course-text-button" type="button" data-action="restart-activity">Restart this small activity</button><span>Where will I return? <strong>' + escapeHtml(currentStep().title) + ' · ' + escapeHtml(taskLabel()) + '</strong></span><button class="course-secondary-button" type="button" data-action="pause">Pause and save</button></footer></section></div></main>' + renderModal();

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
    return '<div class="help-detail"><strong>' + escapeHtml(content[0]) + '</strong><p>' + escapeHtml(content[1]) + '</p>' + (option === 'retry' ? '<button class="course-secondary-button" type="button" data-action="restart-activity">Restart this activity</button>' : '') + (option === 'break' ? '<button class="course-primary-button" type="button" data-action="save-exit">Save and exit</button>' : '') + '</div>';
  };

  const renderModal = () => {
    if (!state.modal) return '';
    if (state.modal === 'pause') return '<div class="course-modal-backdrop" role="presentation"><section class="course-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title"><button class="course-modal-close" type="button" data-action="close-modal" aria-label="Close pause dialog">×</button><p class="course-eyebrow">Pause and save</p><h2 id="pause-title" tabindex="-1">Your progress is saved.</h2><p>You can come back whenever you’re ready. You will return to ' + escapeHtml(courseReturnLocation()) + '.</p><div class="course-modal-actions"><button class="course-secondary-button" type="button" data-action="close-modal">Keep learning</button><button class="course-primary-button" type="button" data-action="save-exit">Save and exit</button></div></section></div>';
    return '<div class="course-modal-backdrop" role="presentation"><section class="course-modal course-help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button class="course-modal-close" type="button" data-action="close-modal" aria-label="Close help dialog">×</button><p class="course-eyebrow">Support options</p><h2 id="help-title" tabindex="-1">I’m stuck</h2><p>Choose one way to recover without leaving your lesson.</p><div class="help-choice-grid"><button type="button" data-action="help" data-help-option="simple">Explain more simply</button><button type="button" data-action="help" data-help-option="example">Show an example</button><button type="button" data-action="listen">Read this aloud</button><button type="button" data-action="help" data-help-option="smaller">Break this into smaller steps</button><button type="button" data-action="help" data-help-option="hint">Give me a hint</button><button type="button" data-action="help" data-help-option="retry">Let me try again</button><button type="button" data-action="help" data-help-option="break">Take a short break</button></div>' + helpDetail() + '</section></div>';
  };

  const prepareModalAccessibility = () => {
    const backdrop = app.querySelector('.course-modal-backdrop');
    const dialog = backdrop?.querySelector('[role="dialog"][aria-modal="true"]');
    if (!backdrop || !dialog) return;
    Array.from(app.children).forEach((child) => {
      if (child === backdrop) return;
      child.inert = true;
      child.setAttribute('aria-hidden', 'true');
    });
    window.requestAnimationFrame(() => {
      if (!state.modal || !dialog.isConnected) return;
      (dialog.querySelector('h2[tabindex="-1"]') || dialog).focus?.({ preventScroll: true });
    });
  };

  const render = () => {
    cancelNarrationAutoScroll();
    if (state.view !== 'course' || state.progress.phase !== 'type' || isReviewingModule()) stopVoiceInput();
    applyPreferences();
    if (state.view === 'setup') app.innerHTML = renderSetup();
    else if (state.view === 'dashboard') app.innerHTML = renderDashboard();
    else if (state.view === 'browse') app.innerHTML = renderBrowse();
    else if (state.view === 'saved') app.innerHTML = renderSavedWithFinalExam();
    else if (state.view === 'settings') app.innerHTML = renderSettings();
    else app.innerHTML = renderCourseWithFinalExam();
    enhanceRenderedCourse();
    prepareModalAccessibility();
  };

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
    if (view !== 'course') state.reviewModuleIndex = null;
    state.view = view;
    save(message);
    render();
    if (view === 'course') window.requestAnimationFrame(() => document.getElementById('course-task-heading')?.focus?.());
  };

  const normaliseText = (value) => value.trim().replace(/\s+/g, ' ').replace(/[“”]/g, '"').replace(/[’]/g, "'");
  const normaliseTypingMatch = (value) => normaliseText(value).toLowerCase().replace(/[.,!?;:]/g, '');

  const focusCurrentTask = (selector = '#course-task-heading') => {
    window.requestAnimationFrame(() => app.querySelector(selector)?.focus?.());
  };

  const animateReadingSectionChange = () => {
    if (!contentTransitionsAreEnabled()) return;
    const reading = app.querySelector('.course-reading-copy[data-structured="true"]');
    if (!reading) return;
    // The new element has just been rendered. Adding the state on the next
    // frame lets the animation describe only the replacement text, not a page
    // scroll or the surrounding lesson controls.
    window.requestAnimationFrame(() => reading.classList.add('is-reading-section-entering'));
  };

  const retainReadingSectionPosition = (focusSelector) => {
    const card = app.querySelector('.course-task-card');
    const reading = card?.querySelector('.course-reading-copy[data-structured="true"]');
    const actions = card?.querySelector('.course-task-actions');
    const previousScrollY = Number(window.scrollY ?? window.pageYOffset) || 0;
    if (!card || !reading || !actions) {
      // This fallback only protects an unexpected markup mismatch. Normal
      // smaller-section navigation updates the existing reading panel below.
      render();
      window.requestAnimationFrame(() => window.scrollTo?.({ left: 0, top: previousScrollY, behavior: 'auto' }));
      return;
    }

    // Update only the bounded reading region. Replacing the whole course shell
    // caused focus and browser layout to return learners to the page heading.
    // Keeping this panel in place lets the text change without moving the page.
    if (state.preferences.readAloud) ensureNarrationService().stop({ silent: true });
    reading.innerHTML = readingContentMarkup(Boolean(state.preferences.readAloud));
    const progress = card.querySelector('.course-reading-section-progress');
    const progressMarkup = readingSectionProgress();
    if (progress && progressMarkup) progress.outerHTML = progressMarkup;
    else if (!progress && progressMarkup) reading.insertAdjacentHTML('beforebegin', progressMarkup);
    actions.innerHTML = readingTaskActions();
    addSourceNotice();
    prepareNarrationForRenderedTask();
    const restoreScroll = () => window.scrollTo?.({ left: 0, top: previousScrollY, behavior: 'auto' });
    restoreScroll();
    window.requestAnimationFrame(() => {
      // CSS scroll anchoring can otherwise react to a shorter final section
      // after the markup change. Restore the same reading position before and
      // after the frame without using smooth scrolling.
      restoreScroll();
      const control = card.querySelector(focusSelector);
      try {
        control?.focus?.({ preventScroll: true });
      } catch (_) {
        // Do not fall back to a scrolling focus call. Pointer users do not
        // need focus moved, and keyboard users keep the visible action.
      }
      animateReadingSectionChange();
      window.requestAnimationFrame(restoreScroll);
    });
  };

  const startFinalExam = () => {
    if (!finalExamQuestionCount()) {
      announce('The final exam is not available yet.');
      return;
    }
    state.view = 'course';
    if (state.progress.finalExam.completed) state.progress.finalExam = blankFinalExamAttempt();
    state.progress.phase = 'exam';
    state.progress.finalExam.submitted = false;
    state.modal = '';
    save('Final exam started. Question ' + (state.progress.finalExam.questionIndex + 1) + ' of ' + finalExamQuestionCount() + ' is ready.');
    render();
    focusCurrentTask('#exam-question-card');
  };

  const submitFinalExamAnswer = () => {
    if (state.progress.phase !== 'exam') return;
    const exam = state.progress.finalExam;
    const question = currentFinalExamQuestion();
    const selected = exam.answers[exam.questionIndex];
    if (!question || exam.submitted || !Number.isInteger(selected) || !question.options[selected]) return;
    const correctIndex = question.options.findIndex(([, correct]) => correct);
    exam.submitted = true;
    const message = selected === correctIndex
      ? 'Correct. Your answer is saved. Choose Next question when you are ready.'
      : 'Not quite. The correct answer is marked so you can review it before moving on.';
    save(message);
    render();
    focusCurrentTask('#exam-feedback');
  };

  const nextFinalExamQuestion = () => {
    if (state.progress.phase !== 'exam' || !state.progress.finalExam.submitted) return;
    const exam = state.progress.finalExam;
    if (exam.questionIndex >= finalExamQuestionCount() - 1) {
      exam.completed = true;
      state.progress.phase = 'exam-results';
      save('Final exam complete. Your results and review are ready.');
      render();
      focusCurrentTask('#course-task-heading');
      return;
    }
    exam.questionIndex += 1;
    exam.submitted = false;
    save('Question ' + (exam.questionIndex + 1) + ' of ' + finalExamQuestionCount() + ' is ready.');
    render();
    focusCurrentTask('#exam-question-card');
  };

  const restartFinalExam = () => {
    state.view = 'course';
    state.progress.finalExam = blankFinalExamAttempt();
    state.progress.phase = 'exam-intro';
    state.modal = '';
    save('The final exam has been restarted. You can begin again whenever you are ready.');
    render();
    focusCurrentTask('#course-task-heading');
  };

  const resetActivity = (phase) => {
    if (isReviewingModule()) {
      state.reviewModuleIndex = null;
      save('You are back at your saved current task.');
      render();
      focusCurrentTask();
      return;
    }
    state.view = 'course';
    state.modal = '';
    if (state.progress.phase === 'exam') {
      const exam = state.progress.finalExam;
      exam.answers[exam.questionIndex] = null;
      exam.submitted = false;
      save('This question has been restarted. Choose one answer when you are ready.');
      render();
      focusCurrentTask('#exam-question-card');
      return;
    }
    if (state.progress.phase === 'exam-intro' || state.progress.phase === 'exam-results') {
      restartFinalExam();
      return;
    }
    state.progress.attempt = blankAttempt();
    state.progress.phase = phase || (state.progress.phase === 'complete' ? 'preview' : state.progress.phase);
    state.manualExampleVisible = false;
    state.showSimple = false;
    state.readingSectionIndex = 0;
    save('This small activity has been restarted.');
    render();
    focusCurrentTask();
  };

  const startNextStep = () => {
    if (isLastStep()) {
      state.view = 'course';
      state.progress.phase = 'exam-intro';
      state.progress.finalExam = state.progress.finalExam.completed ? blankFinalExamAttempt() : state.progress.finalExam;
      state.modal = '';
      save('All course modules are complete. The final exam is ready when you are.');
      render();
      focusCurrentTask();
      return;
    }
    state.progress.lessonIndex += 1;
    state.progress.phase = 'preview';
    state.progress.attempt = blankAttempt();
    state.manualExampleVisible = false;
    state.showSimple = false;
    state.readingSectionIndex = 0;
    save('The next small step is ready.');
    render();
    window.requestAnimationFrame(() => document.getElementById('course-task-heading')?.focus?.());
  };

  const finishCheck = () => {
    const check = currentStep().check;
    const selectedIndex = Number(state.progress.attempt.selectedAnswer);
    if (state.progress.attempt.submitted || state.progress.attempt.selectedAnswer === '' || !Number.isInteger(selectedIndex) || !check.options[selectedIndex]) return;
    state.progress.attempt.submitted = true;
    state.progress.attempt.feedback = check.options[selectedIndex][1]
      ? 'Correct. Your answer is saved. Continue when you are ready.'
      : 'Not quite. The correct answer is marked. Try the question again to reconstruct the idea.';
    save(state.progress.attempt.feedback);
    render();
    window.requestAnimationFrame(() => app.querySelector('#course-quiz-feedback')?.focus?.());
    announce(state.progress.attempt.feedback);
  };

  const continueCheck = () => {
    const check = currentStep().check;
    const selectedIndex = Number(state.progress.attempt.selectedAnswer);
    if (!state.progress.attempt.submitted || !Number.isInteger(selectedIndex) || !check.options[selectedIndex]?.[1]) return;
    state.progress.phase = 'apply';
    state.progress.attempt = blankAttempt();
    save(check.explanation + ' Next, use the idea in one small situation.');
    render();
    window.requestAnimationFrame(() => app.querySelector('.course-question-card')?.focus?.());
    announce(check.explanation);
  };

  const finishApply = () => {
    const selectedIndex = Number(state.progress.attempt.selectedAnswer);
    if (state.progress.attempt.submitted || state.progress.attempt.selectedAnswer === '' || !Number.isInteger(selectedIndex)) return;
    state.progress.attempt.submitted = true;
    state.progress.attempt.feedback = selectedIndex === 0
      ? 'Correct. This response uses a support named in this module. Continue when you are ready.'
      : 'Not quite. The helpful response is marked. Try the small situation again when you are ready.';
    save(state.progress.attempt.feedback);
    render();
    announce(state.progress.attempt.feedback);
    window.requestAnimationFrame(() => app.querySelector('#course-quiz-feedback')?.focus?.());
  };

  const continueApply = () => {
    const selectedIndex = Number(state.progress.attempt.selectedAnswer);
    if (!state.progress.attempt.submitted || selectedIndex !== 0) return;
    if (!state.progress.completedSteps.includes(state.progress.lessonIndex)) state.progress.completedSteps.push(state.progress.lessonIndex);
    state.progress.phase = 'complete';
    state.progress.attempt = blankAttempt();
    save('Adapted practice complete. Your progress is saved.');
    render();
    announce('One small step complete.');
  };

  const checkTyping = () => {
    const typing = currentStep().typing;
    const response = normaliseText(state.progress.attempt.response);
    if (!response) {
      state.progress.attempt.feedback = 'Add a response when you are ready, or use the microphone when it is available.';
      save();
      render();
      return;
    }
    if (typing.level === 'Recall typing') {
      if (response.length < 24) {
        state.progress.attempt.feedback = 'Try adding one more detail about how the support could help with the task.';
        save();
        render();
        return;
      }
      state.progress.phase = 'check';
      state.progress.attempt.feedback = '';
      save('Your explanation is saved. Next, complete a quick understanding check.');
      render();
      return;
    }
    const target = typing.level === 'Guided typing'
      ? typing.phrases[Math.min(state.progress.attempt.guidedIndex, typing.phrases.length - 1)]
      : typing.target;
    if (normaliseTypingMatch(target) !== normaliseTypingMatch(response)) {
      state.progress.attempt.feedback = 'Not quite. Use the visible key idea and try the same short response again.';
      save();
      render();
      return;
    }
    if (typing.level === 'Guided typing' && state.progress.attempt.guidedIndex < typing.phrases.length - 1) {
      state.progress.attempt.guidedIndex += 1;
      state.progress.attempt.response = '';
      state.progress.attempt.feedback = 'That phrase is ready. Here is the next small phrase.';
      save('One guided phrase is complete.');
      render();
      window.requestAnimationFrame(() => document.getElementById('course-typing-input')?.focus());
      return;
    }
    state.progress.phase = 'check';
    state.progress.attempt.feedback = '';
    save('The key idea is saved. Next, complete a quick understanding check.');
    render();
  };

  const speakCurrentTask = () => {
    const speechText = [currentStep().title, ...currentStep().read, state.showSimple ? currentStep().simple : ''].filter(Boolean).join(' ');
    if (!('speechSynthesis' in window)) {
      announce('Read-aloud is not available in this browser. You can use your device’s usual assistive reading tool.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
    announce('Read-aloud has started.');
  };

  const narrateCurrentTask = () => startNarration();

  const toggleTextToSpeechMode = () => {
    const enabled = !state.preferences.readAloud;
    setCourseSetting('readAloud', enabled);
    if (!enabled) {
      const service = ensureNarrationService();
      service.stop();
      service.setAudioPlaylist?.([]);
      narration.chunks = [];
      narration.activeIndex = -1;
      narration.activeRange = null;
    }
    save(enabled ? 'Text to speech mode is on. Click or tap lesson text when you want it read aloud.' : 'Text to speech mode is off.');
    render();
  };

  const toggleTextToSpeechPause = () => {
    const service = ensureNarrationService();
    if (narration.status === 'paused') service.start();
    else service.pause();
  };

  const stopTextToSpeech = () => {
    ensureNarrationService().stop();
    save('Text to speech stopped.');
  };

  const restartTextToSpeech = () => startNarration(0);

  const signOut = async (button) => {
    if (button) button.disabled = true;
    try {
      const { signOutType2LearnUser } = await import('/firebase-auth.js?v=20260721-2');
      await signOutType2LearnUser();
      window.location.assign('/');
    } catch (_) {
      if (button) button.disabled = false;
      announce('Unable to sign out right now. Please try again.');
    }
  };

  const goBack = () => {
    if (!state.onboarded || state.view === 'setup') {
      if (state.setupStep === 2) {
        state.setupStep = 1;
        save();
        render();
        return;
      }
      window.location.assign('/');
      return;
    }
    if (state.view === 'course') {
      goTo('dashboard', 'Your progress is saved. You can return whenever you are ready.');
      return;
    }
    if (state.view === 'settings') {
      goTo(state.previousView || 'dashboard');
      return;
    }
    if (state.view === 'browse' || state.view === 'saved') {
      goTo('dashboard');
      return;
    }
    window.location.assign('/learn/');
  };

  const handleAction = (action, element) => {
    switch (action) {
      case 'use-focus-flow':
        state.settings = selectPrimaryPreset(state.settings, 'focus-flow');
        refreshResolvedPreferences();
        state.setupStep = 2;
        save('Focus & Flow is ready. Add optional supports or continue when you are ready.');
        render();
        break;
      case 'apply-focus-flow':
        state.settings = selectPrimaryPreset(state.settings, 'focus-flow');
        refreshResolvedPreferences();
        save('Focus & Flow is applied. You can change any support below.');
        render();
        break;
      case 'customize-setup':
        state.setupStep = 2;
        save();
        render();
        break;
      case 'finish-setup':
        state.onboarded = true;
        state.settings = markSetupComplete(state.settings);
        refreshResolvedPreferences();
        state.setupStep = 1;
        goTo('dashboard', 'Your learning preferences are saved locally.');
        break;
      case 'back': goBack(); break;
      case 'dashboard': goTo('dashboard'); break;
      case 'browse': goTo('browse'); break;
      case 'saved': goTo('saved'); break;
      case 'settings':
        window.location.assign('/settings/');
        break;
      case 'settings-back': goTo(state.previousView || 'dashboard'); break;
      case 'continue-course': goTo('course', 'You are back at your saved small step.'); break;
      case 'review-module': {
        const moduleIndex = Number(element.dataset.moduleIndex);
        if (!Number.isInteger(moduleIndex) || !state.progress.completedSteps.includes(moduleIndex) || moduleIndex === state.progress.lessonIndex) break;
        state.reviewModuleIndex = moduleIndex;
        save('Reviewing a completed module. Your current task is still saved.');
        render();
        focusCurrentTask();
        break;
      }
      case 'return-from-module-review':
        state.reviewModuleIndex = null;
        save('You are back at your saved current task.');
        render();
        focusCurrentTask();
        break;
      case 'toggle-focus':
        state.courseFocusMode = !state.courseFocusMode;
        save(state.courseFocusMode ? 'Focus Mode is on. The current task stays visible.' : 'Focus Mode is off.');
        render();
        break;
      case 'toggle-tts': toggleTextToSpeechMode(); break;
      case 'tts-play': startNarration(narration.status === 'finished' ? 0 : undefined); break;
      case 'tts-pause': toggleTextToSpeechPause(); break;
      case 'tts-stop': stopTextToSpeech(); break;
      case 'tts-restart': restartTextToSpeech(); break;
      case 'signout': signOut(element); break;
      case 'listen': narrateCurrentTask(); break;
      case 'narration-listen': startNarration(); break;
      case 'narration-pause': ensureNarrationService().pause(); break;
      case 'narration-stop': ensureNarrationService().stop(); break;
      case 'narration-restart': ensureNarrationService().restart(); break;
      case 'narration-jump': startNarration(Number(element.dataset.narrationIndex)); break;
      case 'pause': openCourseModal('pause', element, '[data-action="pause"]'); break;
      case 'stuck': state.helpOption = ''; openCourseModal('help', element, '[data-action="stuck"]'); break;
      case 'close-modal': closeCourseModal(); break;
      case 'save-exit':
        state.modal = '';
        modalReturnFocusSelector = '';
        state.reviewModuleIndex = null;
        state.view = 'dashboard';
        save('Your progress is saved. You can come back whenever you’re ready.');
        render();
        break;
      case 'show-example':
        state.manualExampleVisible = !state.manualExampleVisible;
        save(state.manualExampleVisible ? 'The authored course example is visible.' : 'The manually opened example is hidden for this lesson.');
        render();
        break;
      case 'previous-reading-section':
        if (!smallerSectionsAreActive()) break;
        state.readingSectionIndex = Math.max(0, currentReadingSectionIndex() - 1);
        save('The previous small reading section is ready.');
        retainReadingSectionPosition('[data-action="previous-reading-section"], [data-action="next-reading-section"], [data-action="read-complete"]');
        break;
      case 'next-reading-section':
        if (!smallerSectionsAreActive()) break;
        state.readingSectionIndex = Math.min(readingSections().length - 1, currentReadingSectionIndex() + 1);
        save('The next small reading section is ready.');
        retainReadingSectionPosition('[data-action="next-reading-section"], [data-action="read-complete"]');
        break;
      case 'read-complete':
        state.progress.phase = 'type';
        state.progress.attempt = blankAttempt();
        state.showSimple = false;
        state.readingSectionIndex = 0;
        save('Reading step complete. The next small task is ready.');
        render();
        window.requestAnimationFrame(() => document.getElementById('course-typing-input')?.focus());
        break;
      case 'preview-complete':
        state.progress.phase = 'read';
        state.progress.attempt = blankAttempt();
        state.readingSectionIndex = 0;
        save('Preview complete. The short explanation is ready.');
        render();
        window.requestAnimationFrame(() => document.getElementById('course-task-heading')?.focus?.());
        break;
      case 'start-voice-input': startVoiceInput(); break;
      case 'stop-voice-input': stopVoiceInput('Microphone input stopped. Your response is still here.'); break;
      case 'check-typing': checkTyping(); break;
      case 'submit-check': finishCheck(); break;
      case 'continue-check': continueCheck(); break;
      case 'submit-apply': finishApply(); break;
      case 'continue-apply': continueApply(); break;
      case 'start-final-exam': startFinalExam(); break;
      case 'submit-exam-answer': submitFinalExamAnswer(); break;
      case 'next-exam-question': nextFinalExamQuestion(); break;
      case 'restart-final-exam': restartFinalExam(); break;
      case 'return-course': goTo('dashboard', 'Your final exam results are saved locally.'); break;
      case 'return-to-read':
        state.progress.phase = 'read';
        state.progress.attempt = blankAttempt();
        state.readingSectionIndex = 0;
        save('You are back at the short explanation.');
        render();
        break;
      case 'simple-read':
        state.progress.phase = 'read';
        state.progress.attempt = blankAttempt();
        state.showSimple = true;
        state.readingSectionIndex = 0;
        save('A simpler explanation is ready.');
        render();
        break;
      case 'restart-activity': resetActivity(); break;
      case 'next-step': startNextStep(); break;
      case 'snooze-reminder':
        state.reminderSnoozed = true;
        save('Reminder snoozed. You can return whenever you are ready.');
        render();
        break;
      case 'remind-later':
        state.reminderSnoozed = true;
        save('No problem. You can return whenever you are ready.');
        render();
        break;
      case 'turn-reminders-off':
        setCourseSetting('gentleReminders', false);
        state.reminderSnoozed = true;
        save('Gentle reminders are off.');
        render();
        break;
      case 'help':
        state.helpOption = element.dataset.helpOption || '';
        render();
        break;
      default: break;
    }
  };

  app.addEventListener('click', (event) => {
    const control = event.target.closest('[data-action]');
    const narrationText = event.target.closest('[data-narration-text][data-narration-index]');
    const selectedText = window.getSelection?.().toString().trim();
    if (!control && narrationText) {
      if (!state.preferences.readAloud || selectedText || event.target.closest('a, input, textarea, select, label')) return;
      event.preventDefault();
      startNarrationFromTextPoint(event);
      return;
    }
    if (!control) return;
    event.preventDefault();
    handleAction(control.dataset.action, control);
  });

  app.addEventListener('keydown', (event) => {
    const narrationText = event.target.closest?.('[data-narration-text][data-narration-index]');
    if (narrationText && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')) {
      event.preventDefault();
      startNarrationFromChunkPoint(Number(narrationText.dataset.narrationIndex), 0);
      return;
    }
    if (!event.target.matches?.('[data-typing-input]')) return;
    if (state.progress.phase !== 'type' || event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    event.preventDefault();
    checkTyping();
  });

  app.addEventListener('change', (event) => {
    if (event.target.matches('[data-active-input-method]')) {
      setCourseActiveInputMethod(event.target.value);
      save('Active input method saved.');
      render();
      return;
    }
    if (event.target.matches('[data-narration-speed]')) {
      setCourseSetting('narrationSpeed', event.target.value);
      ensureNarrationService().changePlayback({
        rate: event.target.value,
        voiceURI: effectiveNarrationVoice(),
        volume: Number(state.preferences.narrationVolume)
      });
      save('Narration speed saved.');
      syncNarrationUi();
      return;
    }
    if (event.target.matches('[data-narration-voice]')) {
      setCourseSetting('narrationVoice', event.target.value);
      ensureNarrationService().changePlayback({
        rate: state.preferences.narrationSpeed,
        voiceURI: effectiveNarrationVoice(),
        volume: Number(state.preferences.narrationVolume)
      });
      save('Narration voice saved.');
      syncNarrationUi();
      return;
    }
    if (event.target.matches('[data-narration-volume]')) {
      setCourseSetting('narrationVolume', event.target.value);
      ensureNarrationService().changePlayback({
        rate: state.preferences.narrationSpeed,
        voiceURI: effectiveNarrationVoice(),
        volume: Number(event.target.value)
      });
      save('Narration volume saved.');
      syncNarrationUi();
      return;
    }
    if (event.target.matches('[data-narration-autoscroll]')) {
      if (event.target.checked && (state.preferences.reducedMotion || state.preferences.quietDisplay)) {
        event.target.checked = false;
        announce(state.preferences.reducedMotion
          ? 'Auto-scroll stays off while Reduce motion is on. Use manual scrolling or change that preference in Settings.'
          : 'Auto-scroll stays off while Low Stimulation is active. Use manual scrolling or choose a different preference in Settings.');
        return;
      }
      setCourseSetting('narrationAutoScroll', event.target.checked);
      if (!event.target.checked) cancelNarrationAutoScroll();
      save(event.target.checked ? 'Auto-scroll while listening is on.' : 'Auto-scroll while listening is off.');
      syncNarrationUi();
      return;
    }
    const preference = event.target.dataset.preference;
    if (preference) {
      if (['automaticSaving', 'noTimers', 'oneTask'].includes(preference)) return;
      if (preference === 'textSizeLarge') setCourseSetting('textSize', event.target.checked ? 'large' : 'standard');
      else if (preference === 'spacingRelaxed') setCourseSetting('spacing', event.target.checked ? 'relaxed' : 'standard');
      else setCourseSetting(preference, event.target.checked);
      if (preference === 'alternativeInput' && !event.target.checked && !state.preferences.alternativeResponses) {
        state.progress.attempt.inputMethod = 'keyboard';
        state.progress.attempt.alternativeInput = false;
      }
      save('Support setting updated.');
      render();
      return;
    }
    if (event.target.matches('[data-exam-answer]')) {
      if (state.progress.phase !== 'exam' || state.progress.finalExam.submitted) return;
      const answer = Number(event.target.value);
      if (!Number.isInteger(answer) || answer < 0 || answer > 3) return;
      state.progress.finalExam.answers[state.progress.finalExam.questionIndex] = answer;
      save('Answer selected. Submit when you are ready.');
      render();
      window.requestAnimationFrame(() => app.querySelector('[data-exam-answer][value="' + answer + '"]')?.focus?.());
      return;
    }
    if (event.target.matches('[data-check-answer], [data-apply-answer]')) {
      if (state.progress.attempt.submitted) return;
      state.progress.attempt.selectedAnswer = event.target.value;
      state.progress.attempt.submitted = false;
      state.progress.attempt.feedback = '';
      save();
      render();
      const answerSelector = event.target.matches('[data-check-answer]') ? '[data-check-answer]' : '[data-apply-answer]';
      window.requestAnimationFrame(() => app.querySelector(answerSelector + '[value="' + state.progress.attempt.selectedAnswer + '"]')?.focus?.());
    }
  });

  app.addEventListener('input', (event) => {
    if (!event.target.matches('[data-typing-input]')) return;
    const input = event.target;
    const previousLength = state.progress.attempt.response.length;
    const nextValue = input.value;
    const insertedLength = Math.max(0, nextValue.length - previousLength);
    const usesAlternativeInput = usingAlternativeInput();
    const isComposition = Boolean(event.isComposing) || /composition/i.test(event.inputType || '');
    const isUnexpectedInsertion = event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop';
    if (!usesAlternativeInput && !isComposition && (insertedLength > 24 || isUnexpectedInsertion)) state.progress.attempt.integrityNotice = true;
    state.progress.attempt.response = nextValue;
    state.progress.attempt.feedback = '';
    syncTypingTester(input);
    save();
  });

  app.addEventListener('scroll', (event) => {
    if (!(event.target instanceof HTMLTextAreaElement) || !event.target.matches('[data-typing-input]')) return;
    syncTypingTester(event.target);
  }, true);

  app.addEventListener('paste', (event) => {
    const input = event.target.closest('[data-typing-input]');
    if (!input) return;
    const alternative = usingAlternativeInput();
    if (alternative) return;
    event.preventDefault();
    state.progress.attempt.integrityNotice = true;
    state.progress.attempt.feedback = 'Paste is blocked for this keyboard activity. Type the short idea, or use the microphone when it is available for an eligible concept response.';
    save();
    const feedback = document.querySelector('.typing-feedback');
    if (feedback) feedback.textContent = state.progress.attempt.feedback;
    announce(state.progress.attempt.feedback);
  });

  app.addEventListener('drop', (event) => {
    const input = event.target.closest('[data-typing-input]');
    if (!input) return;
    const alternative = usingAlternativeInput();
    if (alternative) return;
    event.preventDefault();
    state.progress.attempt.integrityNotice = true;
    state.progress.attempt.feedback = 'Dropping text is blocked for this keyboard activity. Type the short idea, or use the microphone when it is available for an eligible concept response.';
    save();
    announce(state.progress.attempt.feedback);
  });

  document.addEventListener('keydown', (event) => {
    if (state.modal) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCourseModal();
        return;
      }
      if (event.key === 'Tab') {
        const dialog = app.querySelector('[role="dialog"][aria-modal="true"]');
        const focusable = dialog ? Array.from(dialog.querySelectorAll('a[href], button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), summary, [tabindex]:not([tabindex="-1"])')) : [];
        if (!dialog || !focusable.length) {
          event.preventDefault();
          dialog?.focus?.();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!dialog.contains(document.activeElement) || !focusable.includes(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      return;
    }
    if (state.preferences.keyboardShortcuts && event.altKey && !event.ctrlKey && !event.metaKey) {
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        openCourseModal('pause', app.querySelector('[data-action="pause"]'), '[data-action="pause"]');
        return;
      }
      if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        state.helpOption = '';
        openCourseModal('help', app.querySelector('[data-action="stuck"]'), '[data-action="stuck"]');
        return;
      }
    }
  });

  const beginAuthenticatedCourse = async () => {
    app.innerHTML = renderAuthChecking();
    const user = await import('/firebase-auth.js?v=20260721-1')
      .then(({ waitForType2LearnUser }) => waitForType2LearnUser())
      .catch(() => null);
    if (!user) {
      window.location.replace('/login/?next=%2Fcourse%2F');
      return;
    }
    const rawLearnerId = user.uid || user.email || 'learner';
    if (!hasCompletedLearnerSetup(rawLearnerId)) {
      window.location.replace('/learn/?next=%2Fcourse%2F');
      return;
    }
    const learnerId = encodeURIComponent(rawLearnerId);
    storageKeys = {
      preferences: 'type2learn-learner-preferences-v1:' + learnerId,
      course: STORAGE_NAMESPACE + ':' + learnerId + ':' + COURSE.id,
      learnerId: rawLearnerId
    };
    state = loadState();
    if (upgradeLegacyNarrationVoice()) save();
    render();
  };

  window.addEventListener('pagehide', () => {
    cancelNarrationAutoScroll();
    narration.service?.destroy();
    stopVoiceInput();
  });
  beginAuthenticatedCourse();
})();
