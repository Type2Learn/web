import { COURSE_CONTENT as DEFAULT_COURSE_CONTENT } from './course-content.js';
import { COURSE_URDU as DEFAULT_COURSE_URDU } from './course-urdu.js';
import { COURSE_AUDIO_MANIFEST, COURSE_AUDIO_MODULE_KEYS } from './course-audio-manifest.js';
import { NarrationService } from './narration.js';
import { acknowledgeUnderstandingReview, answerUnderstandingCheck, askCourseAi, checkReviewedCourseAnswer, decideAdaptiveProposal, deleteAdaptiveLearningData, exportAdaptiveLearningData, getAdaptiveLearningConsent, getCourseAiStatus, loadCourseProgress, loadPublishedCourseCatalogue, loadReviewedCourseManifest, loadReviewedCourseNarration, loadUnderstandingCheck, requestAdaptiveProposal, requestAdaptiveRecall, requestBehaviourDirective, saveCourseProgress, saveLearningSummary, setAdaptiveLearningConsent, startUnderstandingCheck, synthesiseCourseAiReply, transcribeCourseAudio } from './ai-client.js?v=20260825-mascot-dock-and-speech2';
import { adaptReviewedManifestForRichCourse, isReviewedLearnerManifest } from './reviewed-manifest.js?v=20260813-rich-manifest1';
import { LearningTelemetry } from './learning-telemetry.js?v=20260809-adaptive-learning1';
import { BehaviourContext, normalisePartnerControls } from './behaviour-context.js?v=20260811-behaviour-partner1';
import { companionBubbleMarkup, companionDockMarkup, localCompanionDirective } from './learning-partner.js?v=20260814-course-bound-partner1';
import { adaptiveProposalMarkup, taskInitiationMarkup } from './adaptive-support.js?v=20260809-adaptive-learning1';
import { visualExplanationMarkup } from './visual-explanations.js?v=20260809-adaptive-learning1';
import { canonicaliseSpokenTyping, canonicaliseSpokenTypingPrefix, normaliseText, normaliseTypingMatch } from './voice-text.js?v=20260807-stt2';
import { createSettingsState, getAvailableInputMethods, loadLearnerSettings, resolveSettings, saveLearnerSettings, setActiveInputMethod, setUserOverride } from './learner-settings.js?v=20260730-course1';
import { clearType2LearnGuest, getType2LearnGuest } from '/guest-session.js?v=20260731-guest1';
import { downloadLearningForOffline, getOfflineStatus, registerOffline, requestOfflinePersistence } from '/offline-client.js?v=20260821-offline2';

(() => {
  'use strict';

  const STORAGE_NAMESPACE = 'type2learn-course-prototype-v1';
  const COURSE_PREFERENCE_NAMESPACE = 'type2learn-course-preferences-v1:';
  const LEGACY_LEARNING_PREFERENCE_NAMESPACE = 'type2learn-learning-preferences-v1:';
  const app = document.getElementById('course-app');
  const liveRegion = document.getElementById('course-live-region');
  let storageKeys = { preferences: '', course: '', learnerId: '' };
  let authenticatedUser = null;
  // Compatibility route: query-selected reviewed courses retain this mature
  // UI, but their content comes only from a learner-safe published manifest.
  let reviewedCourseContext = null;
  // Approved additional courses are fetched for the normal selection screen;
  // the query-route loader below still fetches the selected learner manifest.
  const reviewedCourseCatalogue = { status: 'idle', courses: [], error: '', request: null };
  // Reviewed course narration is fetched only for the visible module. It uses
  // a short-lived URL and falls back to device TTS if no human clip exists.
  const reviewedNarration = { readyKey: '', missingKey: '', loadingKey: '', url: '', expiresAt: 0, request: null };
  const narration = { service: null, status: 'idle', activeIndex: -1, activeRange: null, chunks: [], voices: [], scrollFrame: null };
  const taskNarration = {
    preludeActive: false,
    preludePaused: false,
    session: 0,
    preludeTimer: null,
    preludeContinue: null
  };
  const PERIODIC_SAVE_INTERVAL_MS = 7000;
  const TYPING_AUTO_ACCEPT_ACCURACY = 85;
  let periodicSaveTimer = null;
  let typingAutoSubmitTimer = null;
  const cloudProgress = {
    ready: false,
    saving: false,
    queued: false,
    timer: null,
    status: 'local',
    error: ''
  };
  // ADAPTIVE LEARNING: this state is entirely opt-in for signed-in learners.
  // It holds only UI/aggregate state; raw typing, recordings and chat never
  // enter it or leave the browser through the telemetry path.
  const adaptiveLearning = {
    available: false,
    assessmentsAvailable: false,
    retentionDays: 90,
    consentKnown: false,
    consented: false,
    updatingConsent: false,
    telemetry: null,
    proposal: null,
    taskInitiation: false,
    taskInitiationTimer: null,
    visualOpen: false,
    lastTypingAt: 0
  };
  // BEHAVIOURAL LEARNING PARTNER: local session state is available without
  // consent, but it produces authored local support only. The compact summary
  // is sent to the server solely for signed-in, explicitly consented learners.
  const behaviourPartner = {
    enabled: false,
    aiEnabled: false,
    context: new BehaviourContext(),
    directive: null,
    requesting: false,
    dataMessage: '',
    draft: '',
    recognition: null,
    listening: false,
    focusedOpen: false,
    lastOfferKey: '',
    // A role choice is a learner-controlled interaction, not a behavioural
    // inference. Keep a short visible preview so changing roles immediately
    // changes what the companion says and how it is presented.
    rolePreview: ''
  };
  // ADAPTIVE LEARNING: assessment answers are held only while the learner is
  // actively answering. The regular course save gets an opaque run id, never
  // the answer, its evaluation, an answer key, or a learner-visible score.
  const understandingCheck = {
    run: null,
    loading: false,
    error: '',
    feedback: '',
    response: '',
    selectedOption: '',
    recognition: null,
    listening: false,
    // A separate aggregate rhythm clock prevents a gap from an earlier
    // guided-typing activity being misclassified as assessment hesitation.
    // The clock itself is never persisted.
    lastInputAt: 0
  };
  // Typing narration is deliberately a separate state machine. A normal
  // playlist cannot wait for, react to, or correct individual keystrokes.
  const typingGuidance = {
    active: false,
    paused: false,
    phase: 'idle',
    audio: null,
    audioToken: 0,
    repeatTimer: null,
    fastTimer: null,
    lastInputAt: 0,
    fastMode: false,
    expectedIndex: 0,
    lastValue: '',
    currentRole: ''
  };
  const BACKGROUND_NOISE_SOURCES = {
    pink: '/assets/audio/background-noise/pink-noise-loop.mp3',
    white: '/assets/audio/background-noise/white-noise-loop.mp3',
    brown: '/assets/audio/background-noise/brown-noise-loop.mp3'
  };
  // Background noise always begins muted. Learners can deliberately raise it
  // to a useful level, while the cap remains below the browser's full volume.
  const BACKGROUND_NOISE_MAX_VOLUME = 0.6;
  const backgroundNoise = {
    audio: null,
    enabled: false,
    type: 'pink',
    volume: 0,
    isPlaying: false,
    fadeFrame: null,
    settleTimer: null,
    // Every explicit start or sound-type change gets a token. A slow play()
    // promise from the previous loop must never mark the newly-selected loop
    // as playing (the cause of intermittent silent Brown noise).
    requestId: 0
  };
  // OFFLINE LEARNING: only public shell/course assets can be downloaded. AI,
  // private courses, account data, and assessment answers always stay online.
  const offlineLearning = {
    supported: false,
    checking: false,
    downloading: false,
    downloaded: false,
    status: ''
  };
  // The optional 3D companion is deliberately lazy-loaded. On smaller
  // screens—or when it is switched off—the model, texture, Three.js, and
  // animation loader are never requested.
  let courseMascot = null;
  let mascotControllerLoad = null;
  let mascotPresentation = { enabled: false, encouragement: 'balanced', language: 'english', voice: 'text', behaviour: 'calm' };
  // Dialogue playback stays independent from the Course AI message player so
  // a learner can stop/retry the mascot without changing their chat history.
  const mascotSpeech = { controller: null, element: null, url: '', loading: false, text: '' };
  // A tiny silent WAV is played only to retain the explicit click's media
  // permission while the authenticated TTS request is in flight. It contains
  // silence, is never audible, and lets the real spoken clip start reliably
  // after a network response in browsers that otherwise drop user activation.
  const SILENT_AUDIO_UNLOCK_WAV = 'data:audio/wav;base64,UklGRkQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
  let lastMascotScene = '';
  let lastMascotSupportEventId = 0;
  const mascotViewportQuery = window.matchMedia?.('(min-width: 1181px)');
  const mascotMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const compactAnimationQuery = window.matchMedia?.('(max-width: 767px)');
  // The supplied transparent WebP is the single mascot animation source. It
  // is used directly inside the AI surface as well as by the desktop mascot
  // controller, so it remains a continuous blinking loop in either view.
  const AI_MASCOT_IMAGE_URL = '/assets/2D%20Mascot/blinking.webp?v=20260804-loop1';
  // Voice input is deliberately separate from text-to-speech narration. It is
  // created only after a learner presses the microphone control, so a profile never
  // causes a microphone permission prompt by itself.
  const voiceInput = {
    recognition: null,
    recorder: null,
    stream: null,
    chunks: [],
    startedAt: 0,
    recordingTimer: null,
    recorderStopping: false,
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
    paused: false,
    sessionId: 0,
    lastError: '',
    fallbackMessage: ''
  };
  // AI chat is intentionally session-only. It never enters the course progress
  // record or local storage, so a learner's questions disappear on close,
  // navigation, and refresh. The service itself also receives only a bounded
  // course/page identifier, not a copy of the page HTML or saved learner work.
  const aiChat = {
    open: false,
    contextKey: '',
    messages: [],
    draft: '',
    status: 'idle',
    error: '',
    connection: { checked: false, checking: false, ai: false, localGuestPreview: false, speech: false, aiAudio: false },
    requestController: null,
    dictation: {
      recorder: null,
      recognition: null,
      stream: null,
      chunks: [],
      startedAt: 0,
      timer: null,
      session: 0,
      stopping: false,
      mode: '',
      fallback: false,
      initialDraft: '',
      finalTranscript: '',
      finalResultIndexes: new Set()
    },
    audio: { controller: null, element: null, url: '', messageIndex: -1, loadingIndex: -1, error: '' }
  };
  // Adaptive recall is purpose-built evidence support, not a chat transcript.
  // It is session-only: attempts are sent for this response only and no model
  // output or learner prose is added to long-term course progress.
  const adaptiveRecall = {
    loading: false,
    result: null,
    error: '',
    barrier: '',
    firstAttempt: '',
    revisionReviewed: false,
    controller: null
  };
  // A modal render replaces the triggering control, so remember its stable
  // action selector rather than a stale DOM reference. This lets keyboard and
  // assistive-technology users return to the control that opened the dialog.
  let modalReturnFocusSelector = '';

  let COURSE = DEFAULT_COURSE_CONTENT;
  let COURSE_URDU = DEFAULT_COURSE_URDU;
  const LOCAL_AVA_VOICE_URI = 'type2learn-local-edge-ava';

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

  const initialiseCourseReadSections = () => {
    COURSE.steps.forEach((step) => {
      step.read = sourceReadSections(step);
    });
  };
  initialiseCourseReadSections();

  const reviewedManifestRequest = () => {
    const query = new URLSearchParams(window.location.search);
    const courseId = String(query.get('courseId') || '').trim();
    const version = String(query.get('version') || '').trim();
    return { requested: Boolean(courseId || version), courseId, version };
  };
  const usesReviewedManifest = () => Boolean(reviewedCourseContext?.manifestBacked && COURSE.manifestBacked);
  const progressCourseKey = () => usesReviewedManifest() ? `${COURSE.id}@${COURSE.version}` : COURSE.id;
  const activeCourseVersion = () => usesReviewedManifest() ? COURSE.version : '';

  const reviewedNarrationKey = () => {
    if (!usesReviewedManifest() || !authenticatedUser || authenticatedUser.isGuest) return '';
    const moduleId = String(currentStep?.()?.manifestModuleId || '').trim();
    if (!moduleId) return '';
    return `${COURSE.id}@${COURSE.version}:${courseUsesUrdu?.() ? 'ur' : 'en'}:${moduleId}`;
  };

  const resetReviewedNarration = () => {
    reviewedNarration.readyKey = '';
    reviewedNarration.missingKey = '';
    reviewedNarration.loadingKey = '';
    reviewedNarration.url = '';
    reviewedNarration.expiresAt = 0;
    reviewedNarration.request = null;
  };

  const ensureReviewedNarrationForCurrentTask = async () => {
    const key = reviewedNarrationKey();
    if (!key) return false;
    if (reviewedNarration.readyKey === key && reviewedNarration.url && reviewedNarration.expiresAt > Date.now() + 5000) return true;
    if (reviewedNarration.missingKey === key) return false;
    if (reviewedNarration.loadingKey === key && reviewedNarration.request) return reviewedNarration.request;
    const moduleId = String(currentStep()?.manifestModuleId || '').trim();
    const language = courseUsesUrdu() ? 'ur' : 'en';
    reviewedNarration.loadingKey = key;
    reviewedNarration.request = loadReviewedCourseNarration({
      user: authenticatedUser,
      courseId: COURSE.id,
      version: COURSE.version,
      moduleId,
      language,
      signal: requestTimeoutSignal(10000)
    }).then((result) => {
      reviewedNarration.readyKey = key;
      reviewedNarration.missingKey = '';
      reviewedNarration.url = String(result?.url || '');
      reviewedNarration.expiresAt = Date.parse(result?.expiresAt || '') || (Date.now() + (4 * 60 * 1000));
      return Boolean(reviewedNarration.url);
    }).catch((error) => {
      // No clip is a valid admin choice; the device reader remains usable.
      if (error?.code === 'NARRATION_NOT_FOUND') reviewedNarration.missingKey = key;
      return false;
    }).finally(() => {
      if (reviewedNarration.loadingKey === key) {
        reviewedNarration.loadingKey = '';
        reviewedNarration.request = null;
      }
    });
    return reviewedNarration.request;
  };

  const renderReviewedManifestFailure = (message) => {
    app.innerHTML = '<main class="course-setup" id="course-main"><div class="course-setup-card course-auth-check"><p class="course-eyebrow">Reviewed course</p><h1>This course is not ready here.</h1><p class="course-lead">' + escapeHtml(message) + '</p><p class="course-input-help">Sign in with an approved learner account to open a reviewed course. The regular course preview remains available from the course home.</p><a class="course-primary-button" href="/course/">Return to course home</a></div></main>';
  };

  const hydrateReviewedCourseForRoute = async (user) => {
    const request = reviewedManifestRequest();
    if (!request.requested) return;
    if (!request.courseId || !request.version) throw new Error('Choose a reviewed course from your approved course catalogue.');
    if (!user || user.isGuest || typeof user.getIdToken !== 'function') throw new Error('Please sign in to open a reviewed course assigned to your account.');
    const result = await loadReviewedCourseManifest({
      user,
      courseId: request.courseId,
      version: request.version,
      signal: requestTimeoutSignal(10000)
    });
    if (!isReviewedLearnerManifest(result?.manifest)) throw new Error('The approved course manifest could not be verified.');
    const adapted = adaptReviewedManifestForRichCourse(result.manifest);
    COURSE = adapted.course;
    COURSE_URDU = adapted.urdu;
    reviewedCourseContext = adapted.context;
    resetReviewedNarration();
    initialiseCourseReadSections();
  };

  const safeJson = (value, fallback) => {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  };

  const clampBackgroundNoiseVolume = (value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0;
    return Math.min(BACKGROUND_NOISE_MAX_VOLUME, Math.max(0, numericValue / 100));
  };

  const learningPreferenceKey = () => COURSE_PREFERENCE_NAMESPACE
    + encodeURIComponent(storageKeys.learnerId || 'learner')
    // A reviewed release may deliberately need different accessibility and
    // presentation choices. Keep those choices with the reviewed version, so
    // accepting an optional suggestion in one release never alters another.
    + ':' + encodeURIComponent(usesReviewedManifest() ? `${COURSE.id}@${COURSE.version}` : COURSE.id);

  const priorReviewedLearningPreferenceKey = () => COURSE_PREFERENCE_NAMESPACE
    + encodeURIComponent(storageKeys.learnerId || 'learner')
    + ':' + encodeURIComponent(COURSE.id);

  const legacyLearningPreferenceKey = () => LEGACY_LEARNING_PREFERENCE_NAMESPACE
    + encodeURIComponent(storageKeys.learnerId || 'learner');

  const readLearningChoices = () => {
    try {
      const stored = safeJson(localStorage.getItem(learningPreferenceKey()), {}) || {};
      if (stored.choices && typeof stored.choices === 'object') return stored.choices;
      // A release created before version-scoped course choices can still use
      // the learner's existing choices once. Newly saved choices are always
      // isolated to the active reviewed release above.
      if (usesReviewedManifest()) {
        const prior = safeJson(localStorage.getItem(priorReviewedLearningPreferenceKey()), {}) || {};
        if (prior.choices && typeof prior.choices === 'object') return prior.choices;
      }
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
    // `learning-language` is retained only as a migration source for older
    // saved preferences. Urdu mode is now the learner-facing language control.
    'website-scheme': 'calm',
    colours: 'balanced',
    layout: 'balanced',
    encouragement: 'subtle',
    animations: 'gentle',
    // Reading presentation remains an explicit, course-scoped learner choice.
    // It is deliberately separate from the website colour style: this low-glare
    // surface affects lesson text only and is never inferred or changed by AI.
    'reading-surface': 'paper',
    'reading-text-size': 'standard',
    'reading-spacing': 'standard',
    'reading-width': 'comfortable',
    'reading-contrast': 'off',
    'background-noise': 'off',
    'background-noise-type': 'pink',
    'background-noise-volume': '0',
    'text-to-speech': 'off',
    mascot: 'off',
    'learning-partner': 'off',
    'mascot-role': 'calm-guide',
    'mascot-presence': 'available',
    'mascot-proactive': 'on',
    'mascot-voice': 'text',
    'adaptive-learning': 'off',
    'urdu-mode': 'off'
  });

  const websiteSchemes = ['calm', 'playful'];
  const normaliseWebsiteScheme = (value) => value === 'balanced'
    ? 'calm'
    : websiteSchemes.includes(value) ? value : '';
  const learningChoices = () => {
    const saved = readLearningChoices();
    // Retire the historical independent mascot-language choices. The bunny
    // now always follows the course language so it is one partner, not a
    // second localization system. Ignoring them also cleans old local data on
    // the next normal preference save.
    const {
      'mascot-language': _legacyMascotLanguage,
      'mascot-language-explicit': _legacyMascotLanguageExplicit,
      'mascot-voice-language': _legacyMascotVoiceLanguage,
      ...supportedSaved
    } = saved;
    const savedWebsiteScheme = normaliseWebsiteScheme(supportedSaved['website-scheme']);
    const isLegacyLanguagePreference = !savedWebsiteScheme;
    const urduMode = isLegacyLanguagePreference && supportedSaved['learning-language'] === 'urdu'
      ? 'on'
      : supportedSaved['urdu-mode'] === 'on'
        ? 'on'
        : supportedSaved['urdu-mode'] === 'off'
        ? 'off'
        : 'off';
    return {
      ...defaultLearningChoices(),
      ...supportedSaved,
      'website-scheme': savedWebsiteScheme || 'calm',
      'urdu-mode': urduMode
    };
  };

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
      // The bunny and learning partner follow the course language. There is
      // intentionally no separate partner-language preference.
      language: supportLanguage(),
      voice: ['text', 'speech', 'both'].includes(choices['mascot-voice'])
        ? choices['mascot-voice']
        : 'text',
      // The retained 3D rollback renderer still accepts this presentation
      // value, although the current 2D companion does not expose it as a UI
      // preference.
      behaviour: choices['mascot-role'] || 'calm-guide',
      presence: choices['mascot-presence'] || 'available',
      proactive: choices['mascot-proactive'] !== 'off'
    };
  };

  const mascotRolePreviewCopy = () => {
    const role = learningChoices()['mascot-role'] || 'calm-guide';
    const urdu = mascotPresentation.language === 'urdu';
    const copy = urdu ? {
      'calm-guide': 'میں آپ کے لیے صرف اگلا واضح قدم نمایاں رکھوں گا۔',
      'learning-partner': 'میں آپ کے ساتھ سیکھ رہا ہوں۔ آپ مجھے ایک خیال اپنے الفاظ میں سمجھا سکتے ہیں۔',
      'self-challenge': 'جب آپ چاہیں، میں ایک مختصر اختیاری مشن پیش کروں گا۔',
      'visual-co-explorer': 'میں ایک وقت میں ایک تعلق دکھانے کے لیے سادہ بصری نقشہ پیش کر سکتا ہوں۔'
    } : {
      'calm-guide': 'I will keep just one clear next step in view.',
      'learning-partner': 'I am learning alongside you. You can teach me one idea in your own words.',
      'self-challenge': 'When you want one, I will offer a small optional mission.',
      'visual-co-explorer': 'I can offer a simple visual map that shows one connection at a time.'
    };
    return copy[role] || copy['calm-guide'];
  };

  const refreshMascotRolePreview = () => {
    const choices = learningChoices();
    behaviourPartner.rolePreview = (choices.mascot === 'on' || choices['learning-partner'] === 'on')
      ? mascotRolePreviewCopy()
      : '';
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
    backgroundNoise.requestId += 1;
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
    const requestId = ++backgroundNoise.requestId;
    cancelBackgroundNoiseFade();
    // Keep the course player consistent with first-run preferences: background
    // noise always starts muted. The learner explicitly chooses any audible
    // level with the capped volume control; the short fade only prevents a
    // sudden jump once a non-zero level has been selected.
    audio.volume = 0;
    try {
      await audio.play();
      if (requestId !== backgroundNoise.requestId || audio !== backgroundNoise.audio) {
        audio.pause();
        return;
      }
      backgroundNoise.isPlaying = true;
      const startedAt = window.performance.now();
      const fadeIn = (timestamp) => {
        if (!backgroundNoise.isPlaying || requestId !== backgroundNoise.requestId || audio !== backgroundNoise.audio) return;
        const progress = Math.min(1, (timestamp - startedAt) / 420);
        audio.volume = backgroundNoise.volume * progress;
        if (progress < 1) backgroundNoise.fadeFrame = window.requestAnimationFrame(fadeIn);
        else backgroundNoise.fadeFrame = null;
      };
      backgroundNoise.fadeFrame = window.requestAnimationFrame(fadeIn);
      backgroundNoise.settleTimer = window.setTimeout(() => {
        if (!backgroundNoise.isPlaying || requestId !== backgroundNoise.requestId || audio !== backgroundNoise.audio) return;
        audio.volume = backgroundNoise.volume;
        backgroundNoise.settleTimer = null;
      }, 520);
      if (announceChange) announce('Background noise started at the selected low volume.');
    } catch (_) {
      if (requestId === backgroundNoise.requestId && audio === backgroundNoise.audio) backgroundNoise.isPlaying = false;
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
    checkResult: '',
    checking: false,
    feedback: '',
    integrityNotice: false,
    alternativeInput: false,
    inputMethod: 'keyboard'
  });

  const MODULE_SNAPSHOT_PHASES = new Set(['preview', 'read', 'type', 'check', 'apply', 'complete']);
  const normaliseModuleSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object' || !MODULE_SNAPSHOT_PHASES.has(snapshot.phase)) return null;
    return {
      phase: snapshot.phase,
      attempt: { ...blankAttempt(), ...(snapshot.attempt && typeof snapshot.attempt === 'object' ? snapshot.attempt : {}) },
      manualExampleVisible: Boolean(snapshot.manualExampleVisible),
      showSimple: Boolean(snapshot.showSimple),
      readingSectionIndex: Math.max(0, Number(snapshot.readingSectionIndex) || 0)
    };
  };

  const blankFinalExamAttempt = () => ({
    questionIndex: 0,
    answers: Array.from({ length: finalExamQuestionCount() }, () => null),
    submitted: false,
    completed: false,
    // Manifest-backed final checks are evaluated only by the protected
    // publishing service. These values store UI state and a bounded outcome,
    // never an answer key, score, rubric, or learner-visible grade.
    checking: false,
    lastResult: ''
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
      moduleSnapshots: {},
      finalExam: blankFinalExamAttempt(),
      // Opaque run reference only; the assessment service keeps its own
      // bounded evaluation state and never exposes keys or scores here.
      assessmentRunId: '',
      assessmentScope: 'module'
    },
    modal: '',
    helpOption: '',
    manualExampleVisible: false,
    showSimple: false,
    readingSectionIndex: 0,
    reviewModuleIndex: null,
    settingsMenu: false,
    settingsTab: 'general',
    storageAvailable: true
    ,
    coursePaused: false,
    updatedAtMs: 0
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
    // Legacy local multiple-choice exam snapshots are deliberately retired in
    // favour of the server-side, one-question understanding check. A selected
    // reviewed manifest is the exception: its final questions are still shown
    // in this established UI, but each answer is checked only by the protected
    // publishing endpoint.
    const legacyExamPhase = ['exam-intro', 'exam', 'exam-results'].includes(savedProgress.phase);
    fresh.progress.phase = legacyExamPhase && !usesReviewedManifest()
      ? 'complete'
      : ['preview', 'read', 'type', 'check', 'apply', 'complete', 'assessment', 'exam', 'exam-results'].includes(savedProgress.phase) ? savedProgress.phase : 'preview';
    if (legacyExamPhase && !usesReviewedManifest()) fresh.progress.lessonIndex = COURSE.steps.length - 1;
    fresh.progress.completedSteps = Array.isArray(savedProgress.completedSteps)
      ? savedProgress.completedSteps.filter((index) => Number.isInteger(index) && index >= 0 && index < COURSE.steps.length)
      : [];
    const savedAttempt = savedProgress.attempt || {};
    fresh.progress.attempt = { ...blankAttempt(), ...savedAttempt };
    fresh.progress.assessmentRunId = /^[A-Za-z0-9_-]{1,100}$/.test(String(savedProgress.assessmentRunId || ''))
      ? String(savedProgress.assessmentRunId)
      : '';
    fresh.progress.assessmentScope = savedProgress.assessmentScope === 'final' ? 'final' : 'module';
    const savedModuleSnapshots = savedProgress.moduleSnapshots && typeof savedProgress.moduleSnapshots === 'object'
      ? savedProgress.moduleSnapshots
      : {};
    fresh.progress.moduleSnapshots = Object.fromEntries(
      Object.entries(savedModuleSnapshots)
        .map(([index, snapshot]) => [Number(index), normaliseModuleSnapshot(snapshot)])
        .filter(([index, snapshot]) => Number.isInteger(index) && index >= 0 && index < COURSE.steps.length && snapshot)
    );
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
      completed: Boolean(savedExam.completed),
      checking: false,
      lastResult: savedExam.lastResult === 'complete' || savedExam.lastResult === 'try-again' ? savedExam.lastResult : ''
    };
    // The final exam may resume only for a reviewed-manifest route. Historical
    // bare-course snapshots remain retired and cannot restore a score pathway.
    if (fresh.progress.finalExam.submitted && fresh.progress.finalExam.answers[fresh.progress.finalExam.questionIndex] === null) fresh.progress.finalExam.submitted = false;
    // Older builds used `showExample` for both a learner's disclosure choice
    // and examples automatically opened by the global setting. Those sources
    // cannot be distinguished safely, so only the new explicit manual value is
    // restored. The resolved global setting is evaluated independently below.
    fresh.manualExampleVisible = Boolean(saved.manualExampleVisible);
    fresh.showSimple = Boolean(saved.showSimple);
    fresh.readingSectionIndex = Math.max(0, Number(saved.readingSectionIndex) || 0);
    fresh.coursePaused = Boolean(saved.coursePaused);
    fresh.updatedAtMs = Math.max(0, Number(saved.updatedAtMs) || 0);
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
      // The course setup screen stores this per-course choice separately from
      // the wider learner-support settings. Restore its explicit value when a
      // learner returns, otherwise the visible Listen control could disappear
      // even though they selected Text to speech: On during setup.
      const savedChoices = readLearningChoices();
      if (hasOwn(savedChoices, 'text-to-speech') && ['on', 'off'].includes(savedChoices['text-to-speech'])) {
        sharedSettings = saveLearnerSettings(
          storageKeys.learnerId,
          setUserOverride(sharedSettings, 'readAloud', savedChoices['text-to-speech'] === 'on')
        );
      }
      // The setup page and in-course profile menu share these exact values.
      // Apply an explicitly saved reading choice immediately, rather than
      // waiting for the learner to reopen settings after entering the course.
      const savedReadingChoices = [
        ['reading-text-size', 'textSize', ['standard', 'large', 'extra-large']],
        ['reading-spacing', 'spacing', ['standard', 'relaxed']],
        ['reading-width', 'readingWidth', ['narrow', 'comfortable', 'wide']]
      ];
      savedReadingChoices.forEach(([choiceKey, settingKey, allowed]) => {
        if (!hasOwn(savedChoices, choiceKey) || !allowed.includes(savedChoices[choiceKey])) return;
        sharedSettings = saveLearnerSettings(
          storageKeys.learnerId,
          setUserOverride(sharedSettings, settingKey, savedChoices[choiceKey])
        );
      });
      if (hasOwn(savedChoices, 'reading-contrast') && ['on', 'off'].includes(savedChoices['reading-contrast'])) {
        sharedSettings = saveLearnerSettings(
          storageKeys.learnerId,
          setUserOverride(sharedSettings, 'highContrast', savedChoices['reading-contrast'] === 'on')
        );
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

  const supportLanguage = () => learningChoices()['urdu-mode'] === 'on' ? 'urdu' : 'english';
  const courseUsesUrdu = () => supportLanguage() === 'urdu';
  const urduScriptTerms = (value = '') => String(value)
    .replace(/\bADHD\b/g, 'اے ڈی ایچ ڈی')
    .replace(/\bDCD\b/g, 'ڈی سی ڈی')
    .replace(/\bDyslexia\b/g, 'ڈسلیکسیہ')
    .replace(/\bDysgraphia\b/g, 'ڈسگرافیا')
    .replace(/\bDyspraxia\b/g, 'ڈس پراکسیا')
    .replace(/\bDyscalculia\b/g, 'ڈس کیلکولیا')
    .replace(/\bAutism Spectrum Disorder\b/g, 'آٹزم اسپیکٹرم کی کیفیت')
    .replace(/\bAuditory Processing Disorder\b/g, 'سمعی عمل کاری کی کیفیت')
    .replace(/\bDevelopmental Coordination Disorder\b/g, 'نشوونمائی ہم آہنگی کی کیفیت');
  const courseUi = (english, urdu) => courseUsesUrdu() ? urduScriptTerms(urdu) : english;
  const urduStep = (step = currentStep()) => {
    const index = COURSE.steps.indexOf(step);
    return index >= 0 ? COURSE_URDU.steps[index] : null;
  };
  const urduFinalQuestion = (index) => COURSE_URDU.finalExam.questions[index] || null;

  // Urdu mode presents the course in Urdu only. The one deliberate exception
  // is the authored keyboard-practice target, which remains English so the
  // learner can practise the required English text.
  const bilingualCopy = (english, urdu, className = '') => {
    if (!courseUsesUrdu()) return escapeHtml(english);
    if (!urdu) return '';
    return '<span class="course-urdu-only ' + className + '" lang="ur" dir="rtl">' + escapeHtml(urduScriptTerms(urdu)) + '</span>';
  };
  const bilingualReadingTextMarkup = (tagName, english, urdu, narrationState) => {
    if (!courseUsesUrdu()) return readingTextMarkup(tagName, english, narrationState);
    if (!urdu) return '';
    const index = narrationState ? narrationState.index++ : -1;
    const urduMarkup = narrationState
      ? '<button class="course-narration-text" type="button" data-narration-text data-narration-index="' + index + '" aria-label="یہاں سے آواز میں پڑھنا شروع کریں: ' + escapeHtml(urduScriptTerms(urdu)) + '">' + escapeHtml(urduScriptTerms(urdu)) + '</button>'
      : escapeHtml(urduScriptTerms(urdu));
    return '<' + tagName + ' class="course-urdu-reading" lang="ur" dir="rtl">' + urduMarkup + '</' + tagName + '>';
  };
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
    const urdu = moment.language === 'urdu';
    const moduleName = urdu
      ? urduScriptTerms(urduStep()?.title || moment.module || '')
      : (moment.module || currentStep?.()?.title || 'this module');
    const typingSections = typeof lessonTypingSections === 'function' ? lessonTypingSections() : [];
    const completedTypingIndex = Math.max(0, (Number(state.progress.attempt?.guidedIndex) || 0) - 1);
    const completedHeading = urdu
      ? (readingSections?.()[completedTypingIndex]?.urduHeading || '')
      : (typingSections[completedTypingIndex]?.heading || 'this lesson section');

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
    // A completed course action is the only moment Self-Challenge Coach may
    // offer an optional next mission. This stays local unless the learner has
    // separately enabled adaptive summaries, and it never changes the task.
    if (['section-complete', 'answer-correct', 'module-complete'].includes(kind)) {
      behaviourPartner.context.action('complete');
      syncBehaviourContext({ completed: true, requestAi: true });
    }
    return supportMomentAnnouncement(moment);
  };

  // The bundled Ava recordings are the normal course narrator. Older builds
  // saved a browser-specific voice URI, which made an existing learner keep
  // hearing their device voice after the recordings were added. The course
  // now keeps the fluent included recording as its only narrator.
  const effectiveNarrationVoice = () => {
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

  const offlineLearningMarkup = () => '<section class="course-learning-partner-settings course-offline-learning"><p class="course-eyebrow">OFFLINE LEARNING</p><p>Download the current public course package for this browser. Local progress, lesson text, English and Urdu narration, background noise, and learner controls will stay available without a connection. The full download includes about 18 MB of optional narration. Course AI, sign-in, private teacher courses, and cloud sync still need the internet.</p>'
    + (offlineLearning.supported
      ? '<button class="course-text-button" type="button" data-offline-download' + (offlineLearning.downloading ? ' disabled' : '') + '>' + escapeHtml(offlineLearning.downloading ? 'Downloading learning package…' : offlineLearning.downloaded ? 'Downloaded for offline use' : 'Download learning for offline use') + '</button>'
      : '<p class="course-settings-menu-gate">Offline download is not supported in this browser. You can still keep learning while this page remains open.</p>')
    + (offlineLearning.status ? '<p class="course-partner-data-status" role="status">' + escapeHtml(offlineLearning.status) + '</p>' : '') + '</section>';

  const courseSettingsMenu = () => {
    if (!state.settingsMenu) return '';
    const choices = learningChoices();
    const tab = ['general', 'reading', 'partner', 'privacy'].includes(state.settingsTab) ? state.settingsTab : 'general';
    const preferencesSaved = coursePreferencesAreSaved();
    const noiseType = ['pink', 'white', 'brown'].includes(choices['background-noise-type']) ? choices['background-noise-type'] : 'pink';
    const requestedNoiseVolume = Number(choices['background-noise-volume']);
    const noiseVolume = Math.min(BACKGROUND_NOISE_MAX_VOLUME * 100, Math.max(0, Number.isFinite(requestedNoiseVolume) ? requestedNoiseVolume : 0));
    const partnerOn = choices['learning-partner'] === 'on';
    const mascotOn = choices.mascot === 'on';
    const tabButton = (id, label, icon) => '<button type="button" data-settings-tab="' + id + '" aria-current="' + String(tab === id) + '"><span aria-hidden="true">' + icon + '</span>' + label + '</button>';
    const panel = (title, intro, body) => '<section class="course-settings-panel" data-settings-panel="' + tab + '"><h2>' + escapeHtml(title) + '</h2><p class="course-settings-panel-intro">' + escapeHtml(intro) + '</p><div class="course-settings-menu-controls">' + body + '</div></section>';
    let content = '';
    if (!preferencesSaved) {
      content = panel('Course settings', 'Choose a course first. Its personal controls will appear here after setup.', '<p class="course-settings-menu-gate">Your choices are course-specific, so they stay connected to the course you select.</p>');
    } else if (tab === 'general') {
      content = panel('General', 'Choose the overall presentation of this learning space.',
        settingsChoiceGroup('website-scheme', 'Website scheme', 'Calm keeps the current look; Playful is bright and colourful.', [['calm', 'Calm'], ['playful', 'Playful']], choices['website-scheme'])
        + settingsChoiceGroup('colours', 'Color style', 'Choose how much color appears around the task.', [['flat', 'Flat'], ['balanced', 'Balanced'], ['vivid', 'Vivid']], choices.colours)
        + settingsChoiceGroup('layout', 'Page layout', 'Choose how much space sits around one task.', [['focused', 'Focused'], ['balanced', 'Balanced'], ['open', 'Open']], choices.layout)
        + settingsChoiceGroup('encouragement', 'Encouragement', 'Choose how visible supportive moments feel.', [['subtle', 'Subtle'], ['balanced', 'Balanced'], ['expressive', 'Expressive']], choices.encouragement)
        + settingsChoiceGroup('animations', 'Animations', 'Choose how much supportive movement you would like to see.', [['still', 'Still'], ['gentle', 'Gentle'], ['lively', 'Lively']], choices.animations)
        + settingsSwitch('urdu-mode', 'Urdu mode', 'Show the course and Course AI in Urdu. Typing targets stay in English.', choices['urdu-mode'] === 'on')
      );
    } else if (tab === 'reading') {
      content = panel('Reading & input', 'Adjust the reading surface and optional audio tools without changing the lesson.',
        settingsChoiceGroup('reading-text-size', 'Reading text size', 'Change text size immediately for this course.', [['standard', 'Standard'], ['large', 'Larger'], ['extra-large', 'Extra large']], state.preferences.textSize)
        + settingsChoiceGroup('reading-spacing', 'Reading rhythm', 'Choose standard or roomier line and paragraph spacing.', [['standard', 'Standard'], ['relaxed', 'More room']], state.preferences.spacing)
        + settingsChoiceGroup('reading-width', 'Reading width', 'Choose shorter or wider reading lines.', [['narrow', 'Short lines'], ['comfortable', 'Comfortable'], ['wide', 'Wide lines']], state.preferences.readingWidth)
        + settingsChoiceGroup('reading-contrast', 'Reading contrast', 'Use a stronger reading surface when it feels clearer.', [['off', 'Standard'], ['on', 'Higher contrast']], state.preferences.highContrast ? 'on' : 'off')
        + settingsChoiceGroup('reading-surface', 'Reading surface', 'Choose a low-glare surface for lesson text. It does not change lesson wording.', [['paper', 'Paper'], ['soft-blue', 'Soft blue'], ['warm-cream', 'Warm cream']], ['paper', 'soft-blue', 'warm-cream'].includes(choices['reading-surface']) ? choices['reading-surface'] : 'paper')
        + settingsSwitch('text-to-speech', 'Text to speech', 'Keep optional read-aloud available. It will not play by itself.', choices['text-to-speech'] === 'on')
        + settingsSwitch('background-noise', 'Background noise', 'Optional looping sound. It starts muted; you choose the volume.', choices['background-noise'] === 'on')
        + (choices['background-noise'] === 'on' ? '<div class="course-settings-noise"><label>Noise type<select data-settings-noise-type><option value="pink"' + (noiseType === 'pink' ? ' selected' : '') + '>Pink</option><option value="white"' + (noiseType === 'white' ? ' selected' : '') + '>White</option><option value="brown"' + (noiseType === 'brown' ? ' selected' : '') + '>Brown</option></select></label><label>Volume <output data-settings-noise-volume-output>' + noiseVolume + '%</output><input type="range" min="0" max="' + (BACKGROUND_NOISE_MAX_VOLUME * 100) + '" step="1" value="' + noiseVolume + '" data-settings-noise-volume></label></div>' : '')
      );
    } else if (tab === 'partner') {
      const unavailable = !mascotViewportQuery?.matches;
      content = panel('Learning partner', 'A fictional, task-bound companion. You stay in control of its role and presence.',
        settingsSwitch('mascot', 'Mascot', unavailable ? 'Available on larger screens. This screen is too small.' : 'Show your learning companion during this course.', mascotOn, unavailable)
        + settingsSwitch('learning-partner', 'Learning partner', 'Use optional task-bound partner support. With the mascot hidden, it opens in Course AI instead.', partnerOn)
        + (partnerOn ? settingsChoiceGroup('mascot-role', 'Partner role', 'Choose the kind of support you want.', [['calm-guide', 'Calm Guide'], ['learning-partner', 'Learning Partner'], ['self-challenge', 'Self-Challenge Coach'], ['visual-co-explorer', 'Visual Co-Explorer']], choices['mascot-role'])
          + settingsChoiceGroup('mascot-presence', 'Partner presence', 'Choose how visibly your partner appears.', [['quiet', 'Quiet'], ['available', 'Available'], ['involved', 'Involved']], choices['mascot-presence'])
          + settingsSwitch('mascot-proactive', 'Proactive offers', 'Offer one optional support after matched task signals. You can dismiss it for this task.', choices['mascot-proactive'] !== 'off')
          + '<details class="course-adaptive-settings-explainer"><summary>Why did this appear?</summary><p>Type2Learn waits for at least two neutral task signals, such as returning after a pause and rereading. It does not diagnose you or change settings automatically.</p></details>' : '')
        + ((mascotOn || partnerOn) ? settingsChoiceGroup('mascot-voice', partnerOn ? 'Partner response' : 'Mascot response', 'Choose text, voice input, or both. Voice words are always shown before sending. The bunny follows your course language.', [['text', 'Text'], ['speech', 'Speech'], ['both', 'Both']], choices['mascot-voice']) : '')
      );
    } else {
      const dataStatus = signedInLearner() && adaptiveLearning.available
        ? '<p>With adaptive learning enabled, a compact module summary is saved to your account for up to ' + escapeHtml(String(adaptiveLearning.retentionDays || 90)) + ' days. It excludes typed words, recordings, chats, answer text, scores, IP addresses, and personal profiles.</p><div class="course-partner-data-actions"><button class="course-text-button" type="button" data-action="export-behaviour-data">Download my adaptive data</button><button class="course-text-button" type="button" data-action="delete-behaviour-data">Delete adaptive data</button></div>'
        : '<p>Adaptive support is kept in this browser session unless you explicitly turn on compact course summaries. Guest learners never send course AI or adaptive data.</p>';
      content = panel('Data & privacy', 'See what learning support notices, change consent, or prepare this course for offline learning.',
        settingsSwitch('adaptive-learning', 'Adaptive learning support', 'Use compact course summaries to offer one optional setting suggestion. Raw typing, recordings, and chats are never saved.', choices['adaptive-learning'] === 'on', !signedInLearner())
        + '<details class="course-adaptive-settings-explainer"><summary>What Type2Learn notices</summary><p>Task and support categories only: active or idle time, returns and rereads, optional read-aloud or visual use, aggregate typing pace and corrections, and accepted or dismissed partner offers. It never stores your individual keys or words.</p></details>'
        + dataStatus
        + offlineLearningMarkup()
      );
    }
    return '<div class="course-settings-backdrop" data-action="close-settings-menu"><section class="course-settings-menu" id="course-settings-menu" role="dialog" aria-modal="true" aria-label="Learning settings"><header><span class="course-settings-profile">' + profileAvatar() + '<strong>' + escapeHtml(profileName()) + '</strong></span><button class="course-settings-close" type="button" data-action="close-settings-menu" aria-label="Close settings">×</button></header><div class="course-settings-layout"><nav class="course-settings-tabs" aria-label="Settings categories">' + tabButton('general', 'General', '⚙') + tabButton('reading', 'Reading & input', 'Aa') + tabButton('partner', 'Learning partner', '♥') + tabButton('privacy', 'Data & privacy', '⌁') + '</nav>' + content + '</div><footer><button class="course-settings-signout" type="button" data-action="signout">Sign out</button></footer></section></div>';
  };

  const mascotCanAppear = () => Boolean(
    mascotPresentation.enabled
    && state.view !== 'dashboard'
    && mascotViewportQuery?.matches
  );

  const canUseMascotAiPanel = () => Boolean(
    mascotCanAppear()
    && state.view === 'course'
    && !mascotMotionQuery?.matches
  );

  const aiLanguage = () => courseUsesUrdu() ? 'ur' : 'en';
  const aiDirection = () => aiLanguage() === 'ur' ? 'rtl' : 'ltr';
  const aiCopy = (english, urdu) => aiLanguage() === 'ur' ? urdu : english;
  const aiContextKey = () => [state.view, displayedModuleIndex(), state.progress.phase, Number.isInteger(state.reviewModuleIndex) ? state.reviewModuleIndex : '', aiLanguage()].join(':');
  const aiInitialMessage = () => aiCopy(
    'I can help you understand this current page. I will not complete typing or choose answers for you.',
    'میں اس موجودہ صفحے کو سمجھنے میں مدد کر سکتا ہوں۔ میں آپ کی ٹائپنگ مکمل نہیں کروں گا اور نہ ہی آپ کے لیے جواب منتخب کروں گا۔'
  );

  const clearAiChatTimer = () => {
    if (aiChat.dictation.timer !== null) window.clearTimeout(aiChat.dictation.timer);
    aiChat.dictation.timer = null;
  };

  const abortAiRequest = () => {
    aiChat.requestController?.abort?.();
    aiChat.requestController = null;
  };

  const stopAiReplyAudio = () => {
    const audio = aiChat.audio;
    audio.controller?.abort?.();
    audio.controller = null;
    if (audio.element) {
      audio.element.pause();
      audio.element.src = '';
    }
    audio.element = null;
    if (audio.url) URL.revokeObjectURL(audio.url);
    audio.url = '';
    audio.messageIndex = -1;
    audio.loadingIndex = -1;
  };

  const discardAiDictation = () => {
    const dictation = aiChat.dictation;
    dictation.session += 1;
    clearAiChatTimer();
    if (dictation.recorder && dictation.recorder.state !== 'inactive') {
      try { dictation.recorder.stop(); } catch (_) { /* Stopping a recorder is best-effort. */ }
    }
    if (dictation.recognition) {
      try { dictation.recognition.abort(); } catch (_) { /* Stopping recognition is best-effort. */ }
    }
    dictation.stream?.getTracks?.().forEach((track) => track.stop());
    dictation.recorder = null;
    dictation.recognition = null;
    dictation.stream = null;
    dictation.chunks = [];
    dictation.startedAt = 0;
    dictation.stopping = false;
    dictation.mode = '';
    dictation.fallback = false;
    dictation.initialDraft = '';
    dictation.finalTranscript = '';
    dictation.finalResultIndexes = new Set();
  };

  const resetAiChat = ({ close = true } = {}) => {
    // ADAPTIVE LEARNING: close the aggregate AI-use interval before clearing
    // the session.  The telemetry never receives the learner's messages.
    recordUnifiedBehaviourAction('ai-close');
    abortAiRequest();
    stopAiReplyAudio();
    discardAiDictation();
    aiChat.messages = [];
    aiChat.draft = '';
    aiChat.status = 'idle';
    aiChat.error = '';
    if (close) aiChat.open = false;
  };

  const syncAiChatContext = () => {
    const nextKey = aiContextKey();
    if (aiChat.contextKey && aiChat.contextKey !== nextKey) {
      resetAiChat();
      if (state.modal === 'ai-chat') state.modal = '';
    }
    aiChat.contextKey = nextKey;
  };

  const aiChatIsVisible = () => aiChat.open || state.modal === 'ai-chat';

  const aiReplyCanSpeak = () => Boolean(
    signedInLearner()
    && aiLanguage() === 'en'
    && state.preferences.readAloud
    && aiChat.connection.aiAudio
  );

  const browserSpeechRecognitionAvailable = () => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const aiMessagesMarkup = () => {
    const messages = aiChat.messages.length ? aiChat.messages : [{ role: 'assistant', content: aiInitialMessage(), initial: true }];
    return messages.map((message, index) => {
      const speakable = message.role === 'assistant' && !message.initial && aiReplyCanSpeak();
      const speaking = aiChat.audio.messageIndex === index;
      const loading = aiChat.audio.loadingIndex === index;
      const audioControl = speakable
        ? '<button class="course-ai-message-speak" type="button" data-action="ai-speak-message" data-ai-message-index="' + index + '"' + (loading ? ' disabled' : '') + '>' + escapeHtml(loading ? 'Loading audio…' : speaking ? 'Stop audio' : 'Listen') + '</button>'
        : '';
      return '<article class="course-ai-message course-ai-message--' + (message.role === 'user' ? 'user' : 'assistant') + (message.initial ? ' is-initial' : '') + '"><span>' + escapeHtml(message.role === 'user' ? aiCopy('You', 'آپ') : aiCopy('Course helper', 'کورس مددگار')) + '</span><p>' + escapeHtml(message.content) + '</p>' + audioControl + '</article>';
    }).join('');
  };

  // Guest learning deliberately keeps authored help available, but never
  // sends a guest's text to Course AI. This is enforced in the UI as well as
  // on the API boundary so a local-preview flag cannot accidentally expose it.
  const courseAiAccessAllowed = () => signedInLearner();

  const syncAiComposerState = () => {
    const busy = ['checking', 'sending', 'recording', 'transcribing'].includes(aiChat.status);
    const canSend = courseAiAccessAllowed() && aiChat.connection.checked && aiChat.connection.ai && !busy && Boolean(aiChat.draft.trim());
    app.querySelectorAll('[data-action="ai-send"]').forEach((button) => { button.disabled = !canSend; });
  };

  const aiChatStatusMarkup = () => {
    if (aiChat.status === 'checking') return '<p class="course-ai-chat-status" role="status">' + escapeHtml(aiCopy('Checking the assistant connection…', 'مددگار کے کنکشن کی جانچ ہو رہی ہے…')) + '</p>';
    if (aiChat.status === 'sending') return '<p class="course-ai-chat-status" role="status">' + escapeHtml(aiCopy('The course helper is thinking…', 'کورس مددگار غور کر رہا ہے…')) + '</p>';
    if (aiChat.status === 'recording') {
      const browserFallback = aiChat.dictation.mode === 'browser';
      return '<p class="course-ai-chat-status is-recording" role="status">' + escapeHtml(browserFallback
        ? (aiChat.dictation.fallback
            ? aiCopy('Speechmatics could not transcribe that recording. Browser speech recognition is listening now; please repeat your question.', 'آواز کو متن میں بدلنے کی سروس ریکارڈنگ مکمل نہ کر سکی۔ براؤزر کا صوتی اِن پٹ اب سن رہا ہے؛ براہ کرم اپنا سوال دوبارہ کہیں۔')
            : aiCopy('Browser speech recognition is listening. Choose Stop speaking when you are finished.', 'براؤزر وائس ان پٹ سن رہا ہے۔ مکمل ہونے پر بولنا بند کریں۔'))
        : aiCopy('Listening. Choose Stop speaking when you are finished.', 'سن رہا ہے۔ مکمل ہونے پر بولنا بند کریں منتخب کریں۔')) + '</p>';
    }
    if (aiChat.status === 'transcribing') return '<p class="course-ai-chat-status" role="status">' + escapeHtml(aiCopy('Turning your recording into editable text…', 'آپ کی ریکارڈنگ کو قابلِ ترمیم متن میں بدلا جا رہا ہے…')) + '</p>';
    if (aiChat.error) return '<p class="course-ai-chat-status is-error" role="status">' + escapeHtml(aiChat.error) + '</p>';
    if (aiChat.connection.checked && !aiChat.connection.ai) return '<p class="course-ai-chat-status" role="status">' + escapeHtml(aiCopy('AI chat is being set up. The course support on this page is still available.', 'مصنوعی ذہانت کی گفتگو ترتیب دی جا رہی ہے۔ اس صفحے کی کورس مدد اب بھی دستیاب ہے۔')) + '</p>';
    return '<p class="course-ai-chat-status">' + escapeHtml(aiCopy('Ask about this page only. Do not include private information.', 'صرف اس صفحے کے بارے میں پوچھیں۔ ذاتی معلومات شامل نہ کریں۔')) + '</p>';
  };

  const courseAiChatMarkup = (surface) => {
    const busy = ['checking', 'sending', 'recording', 'transcribing'].includes(aiChat.status);
    const canSend = courseAiAccessAllowed() && aiChat.connection.checked && aiChat.connection.ai && !busy && Boolean(aiChat.draft.trim());
    const canSpeak = signedInLearner() && aiChat.connection.checked && (aiChat.connection.speech || browserSpeechRecognitionAvailable()) && !busy;
    const closeLabel = aiCopy('Close AI chat', 'مصنوعی ذہانت کی گفتگو بند کریں');
    const backLabel = aiCopy('Back to course', 'کورس پر واپس جائیں');
    const heading = aiCopy('Course AI', 'کورس کی مصنوعی ذہانت');
    const inputLabel = aiCopy('Ask about the current page', 'موجودہ صفحے کے بارے میں پوچھیں');
    const speechLabel = aiChat.status === 'recording'
      ? aiCopy('Stop speaking', 'بولنا بند کریں')
      : aiCopy('Speak', 'بولیں');
    const hasMascot = mascotPresentation.enabled;
    const mascot = hasMascot
      ? '<div class="course-ai-chat-mascot" data-ai-chat-mascot aria-hidden="true"><img class="course-ai-chat-mascot-image" src="' + AI_MASCOT_IMAGE_URL + '" alt="" decoding="async" fetchpriority="high"></div>'
      : '';
    const closeControl = surface === 'page'
      ? '<button class="course-ai-chat-close course-ai-chat-back" type="button" data-action="close-ai-chat" aria-label="' + escapeHtml(backLabel) + '"><span aria-hidden="true">' + escapeHtml(aiDirection() === 'rtl' ? '→' : '←') + '</span><span>' + escapeHtml(backLabel) + '</span></button>'
      : '<button class="course-ai-chat-close" type="button" data-action="close-ai-chat" aria-label="' + escapeHtml(closeLabel) + '">×</button>';
    return '<section class="course-ai-chat course-ai-chat--' + surface + (hasMascot ? ' has-ai-mascot' : '') + '" data-course-ai-chat data-course-ai-surface="' + surface + '" lang="' + aiLanguage() + '" dir="' + aiDirection() + '" aria-label="' + escapeHtml(heading) + '"><header class="course-ai-chat-header"><div class="course-ai-chat-header-copy"><p class="course-eyebrow">' + escapeHtml(aiCopy('PAGE SUPPORT', 'صفحے کی مدد')) + '</p><h2' + (surface === 'page' ? ' id="course-ai-chat-title" tabindex="-1"' : '') + '>' + escapeHtml(heading) + '</h2><p>' + escapeHtml(aiCopy('A focused helper for this task. It cannot complete your work or choose answers.', 'اس کام کے لیے محدود مددگار۔ یہ آپ کا کام مکمل نہیں کر سکتا اور نہ ہی جواب منتخب کر سکتا ہے۔')) + '</p></div>' + mascot + closeControl + '</header><div class="course-ai-message-list" data-ai-message-list role="log" aria-live="polite" aria-relevant="additions text">' + aiMessagesMarkup() + '</div><div class="course-ai-composer"><label><span class="course-visually-hidden">' + escapeHtml(inputLabel) + '</span><textarea data-ai-chat-input maxlength="900" rows="3" placeholder="' + escapeHtml(inputLabel) + '"' + (busy ? ' disabled' : '') + '>' + escapeHtml(aiChat.draft) + '</textarea></label><div class="course-ai-composer-actions"><button class="course-secondary-button course-ai-dictation" type="button" data-action="ai-dictation-toggle"' + (canSpeak || aiChat.status === 'recording' ? '' : ' disabled') + '>' + escapeHtml(speechLabel) + '</button><button class="course-primary-button" type="button" data-action="ai-send"' + (canSend ? '' : ' disabled') + '>' + escapeHtml(aiCopy('Send', 'بھیجیں')) + ' <span aria-hidden="true">' + escapeHtml(aiDirection() === 'rtl' ? '←' : '→') + '</span></button></div>' + aiChatStatusMarkup() + '</div></section>';
  };

  const focusAiInput = () => window.requestAnimationFrame(() => app.querySelector('[data-ai-chat-input]')?.focus?.({ preventScroll: true }));

  const refreshAiConnection = async () => {
    if (aiChat.connection.checking) return;
    aiChat.connection = { ...aiChat.connection, checking: true };
    aiChat.status = aiChat.status === 'idle' ? 'checking' : aiChat.status;
    const contextKey = aiChat.contextKey;
    try {
      const status = await getCourseAiStatus();
      if (contextKey !== aiChat.contextKey) return;
      const localGuestPreview = Boolean(status?.ai?.localGuestPreview);
      aiChat.connection = {
        checked: true,
        checking: false,
        ai: Boolean(status?.ai?.available) || Boolean(authenticatedUser?.isGuest && localGuestPreview),
        localGuestPreview,
        speech: Boolean(status?.speechToText?.available),
        aiAudio: Boolean(status?.speechToText?.textToSpeech?.available)
      };
      if (aiChat.status === 'checking') aiChat.status = 'idle';
      if (aiChatIsVisible()) {
        render();
        focusAiInput();
      }
    } catch (_) {
      if (contextKey !== aiChat.contextKey) return;
      aiChat.connection = { checked: true, checking: false, ai: false, localGuestPreview: false, speech: false, aiAudio: false };
      if (aiChat.status === 'checking') aiChat.status = 'idle';
      if (aiChatIsVisible()) {
        render();
        focusAiInput();
      }
    }
  };

  const openCourseAi = (trigger) => {
    if (authenticatedUser?.isGuest) {
      openCourseModal('guest-ai', trigger, '[data-action="call-ai"]');
      return;
    }
    if (!signedInLearner() && !authenticatedUser?.isGuest) {
      announce('Log in required to use Course AI.');
      return;
    }
    syncAiChatContext();
    if (!aiChat.open) {
      aiChat.open = true;
      aiChat.messages = [{ role: 'assistant', content: aiInitialMessage(), initial: true }];
      aiChat.draft = '';
      aiChat.error = '';
      // ADAPTIVE LEARNING: this is only an aggregate visible-panel duration,
      // used to offer an optional one-step return suggestion after a module.
      recordUnifiedBehaviourAction('ai-open');
    }
    if (canUseMascotAiPanel()) {
      state.modal = '';
      render();
      focusAiInput();
    } else {
      openCourseModal('ai-chat', trigger, '[data-action="call-ai"]');
    }
    void refreshAiConnection();
  };

  const closeCourseAi = () => {
    const selector = state.modal === 'ai-chat' ? modalReturnFocusSelector : '[data-action="call-ai"]';
    modalReturnFocusSelector = '';
    state.modal = '';
    resetAiChat();
    render();
    if (selector) window.requestAnimationFrame(() => app.querySelector(selector)?.focus?.({ preventScroll: true }));
  };

  // A learner can rotate a device or resize a browser with the assistant
  // open. Keep exactly one visible surface: the desktop rail or the compact
  // full-page assistant, never neither and never both.
  const syncAiChatViewportSurface = () => {
    if (!aiChat.open) return;
    state.modal = canUseMascotAiPanel() ? '' : 'ai-chat';
  };

  const aiPageRequestContext = () => ({
    courseId: COURSE.id,
    ...(usesReviewedManifest() ? { courseVersion: COURSE.version } : {}),
    page: { moduleIndex: displayedModuleIndex(), phase: state.progress.phase },
    language: aiLanguage()
  });

  const sendAiMessage = async () => {
    const message = aiChat.draft.trim();
    if (!courseAiAccessAllowed() || !message || !aiChat.connection.ai || aiChat.status !== 'idle') return;
    const history = aiChat.messages.filter((entry) => !entry.initial).slice(-6).map((entry) => ({ role: entry.role, content: entry.content }));
    aiChat.messages.push({ role: 'user', content: message });
    aiChat.draft = '';
    aiChat.error = '';
    aiChat.status = 'sending';
    const contextKey = aiChat.contextKey;
    const controller = new AbortController();
    aiChat.requestController = controller;
    recordUnifiedBehaviourAction('ai-request');
    render();
    try {
      const reply = await askCourseAi({ user: authenticatedUser, message, history, ...aiPageRequestContext(), signal: controller.signal });
      if (contextKey !== aiChat.contextKey || controller.signal.aborted) return;
      aiChat.messages.push({ role: 'assistant', content: String(reply?.reply || '').trim() || aiCopy('I could not make a clear response. Please try a shorter question.', 'میں واضح جواب تیار نہیں کر سکا۔ براہ کرم مختصر سوال کریں۔') });
    } catch (error) {
      if (controller.signal.aborted || contextKey !== aiChat.contextKey) return;
      aiChat.error = aiLanguage() === 'ur'
        ? 'مصنوعی ذہانت والا مددگار ابھی جواب نہیں دے سکا۔ براہ کرم بعد میں دوبارہ کوشش کریں۔'
        : (error?.message || 'The AI helper could not continue. Please try again later.');
    } finally {
      if (aiChat.requestController === controller) aiChat.requestController = null;
      if (contextKey === aiChat.contextKey) {
        aiChat.status = 'idle';
        if (aiChatIsVisible()) {
          render();
          focusAiInput();
        }
      }
    }
  };

  const speakAiMessage = async (index) => {
    const message = aiChat.messages[index];
    if (!aiReplyCanSpeak() || !message || message.role !== 'assistant' || message.initial) return;
    if (aiChat.audio.messageIndex === index) {
      stopAiReplyAudio();
      if (aiChatIsVisible()) render();
      return;
    }
    stopAiReplyAudio();
    const controller = new AbortController();
    aiChat.audio.controller = controller;
    aiChat.audio.loadingIndex = index;
    aiChat.audio.error = '';
    render();
    try {
      const blob = await synthesiseCourseAiReply({ user: authenticatedUser, text: message.content, language: 'en', signal: controller.signal });
      if (controller.signal.aborted || !aiChatIsVisible()) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      aiChat.audio = { controller: null, element: audio, url, messageIndex: index, loadingIndex: -1, error: '' };
      audio.addEventListener('ended', () => {
        if (aiChat.audio.element !== audio) return;
        stopAiReplyAudio();
        if (aiChatIsVisible()) render();
      }, { once: true });
      await audio.play();
      if (aiChatIsVisible()) render();
    } catch (error) {
      if (controller.signal.aborted) return;
      stopAiReplyAudio();
      aiChat.error = error?.message || 'Audio for this AI reply could not be played.';
      if (aiChatIsVisible()) render();
    }
  };

  const supportedRecorderMimeType = () => {
    if (!window.MediaRecorder?.isTypeSupported) return '';
    return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((type) => window.MediaRecorder.isTypeSupported(type)) || '';
  };

  const browserRecognitionLanguage = () => aiLanguage() === 'ur' ? 'ur-PK' : 'en-US';

  const appendAiDictationTranscript = (transcript, initialDraft = aiChat.dictation.initialDraft) => {
    const cleanTranscript = normaliseText(transcript);
    aiChat.draft = [initialDraft, cleanTranscript].filter(Boolean).join(initialDraft && cleanTranscript ? ' ' : '');
  };

  // Browser recognition is a one-shot fallback for browsers that cannot use
  // the authenticated recorder. It never reconnects itself: browser speech
  // services can loop indefinitely after a quota or network failure.
  const startBrowserAiDictation = ({ fallback = false } = {}) => {
    if (!aiChatIsVisible()) return false;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return false;
    let recognition;
    try {
      recognition = new Recognition();
    } catch (_) {
      return false;
    }
    const dictation = aiChat.dictation;
    const session = ++dictation.session;
    clearAiChatTimer();
    dictation.recorder = null;
    dictation.recognition = recognition;
    dictation.stream?.getTracks?.().forEach((track) => track.stop());
    dictation.stream = null;
    dictation.chunks = [];
    dictation.startedAt = window.performance.now();
    dictation.stopping = false;
    dictation.mode = 'browser';
    dictation.fallback = fallback;
    dictation.initialDraft = aiChat.draft.trim();
    dictation.finalTranscript = '';
    dictation.finalResultIndexes = new Set();
    recognition.lang = browserRecognitionLanguage();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      if (session !== dictation.session || dictation.recognition !== recognition) return;
      let finalTranscript = dictation.finalTranscript;
      let interimTranscript = '';
      const resultStart = Math.max(0, Number(event.resultIndex) || 0);
      Array.from(event.results || []).slice(resultStart).forEach((result, offset) => {
        const resultIndex = resultStart + offset;
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) {
          if (!dictation.finalResultIndexes.has(resultIndex)) {
            dictation.finalResultIndexes.add(resultIndex);
            finalTranscript = [finalTranscript, transcript].filter(Boolean).join(' ').trim();
          }
        } else interimTranscript += transcript + ' ';
      });
      dictation.finalTranscript = finalTranscript;
      appendAiDictationTranscript([finalTranscript, interimTranscript.trim()].filter(Boolean).join(' '));
      aiChat.error = '';
      if (aiChatIsVisible()) render();
    };
    recognition.onerror = (event) => {
      if (session !== dictation.session || dictation.recognition !== recognition) return;
      const code = String(event?.error || 'unknown');
      dictation.recognition = null;
      clearAiChatTimer();
      aiChat.status = 'idle';
      aiChat.error = code === 'not-allowed' || code === 'service-not-allowed'
        ? aiCopy('Allow microphone access to speak, or type your question instead.', 'بولنے کے لیے مائیکروفون کی اجازت دیں، یا سوال ٹائپ کریں۔')
        : code === 'language-not-supported'
          ? aiCopy('Browser speech recognition does not support this language on this device. You can type your question instead.', 'اس آلے پر براؤزر وائس ان پٹ اس زبان کو سپورٹ نہیں کرتا۔ آپ سوال ٹائپ کر سکتے ہیں۔')
          : aiCopy('Browser speech recognition could not continue. You can type your question instead.', 'براؤزر وائس ان پٹ جاری نہیں رہ سکا۔ آپ سوال ٹائپ کر سکتے ہیں۔');
      if (aiChatIsVisible()) {
        render();
        focusAiInput();
      }
    };
    recognition.onend = () => {
      if (session !== dictation.session || dictation.recognition !== recognition) return;
      dictation.recognition = null;
      clearAiChatTimer();
      if (aiChat.status === 'recording') aiChat.status = 'idle';
      if (aiChatIsVisible()) {
        render();
        focusAiInput();
      }
    };
    aiChat.status = 'recording';
    aiChat.error = '';
    clearAiChatTimer();
    aiChat.dictation.timer = window.setTimeout(() => stopAiDictation(), 45000);
    try {
      recognition.start();
      if (aiChatIsVisible()) render();
      return true;
    } catch (_) {
      if (dictation.recognition === recognition) dictation.recognition = null;
      clearAiChatTimer();
      aiChat.status = 'idle';
      return false;
    }
  };

  const finishAiDictation = async (session) => {
    const dictation = aiChat.dictation;
    if (session !== dictation.session || !aiChatIsVisible()) return;
    const elapsed = Math.max(300, Math.round(window.performance.now() - dictation.startedAt));
    const type = dictation.recorder?.mimeType || 'audio/webm';
    const recording = new Blob(dictation.chunks, { type });
    dictation.stream?.getTracks?.().forEach((track) => track.stop());
    dictation.recorder = null;
    dictation.stream = null;
    dictation.chunks = [];
    dictation.startedAt = 0;
    dictation.stopping = false;
    clearAiChatTimer();
    if (!recording.size) {
      aiChat.status = 'idle';
      aiChat.error = aiCopy('No speech was recorded. Try again or type your question.', 'کوئی آواز ریکارڈ نہیں ہوئی۔ دوبارہ کوشش کریں یا سوال ٹائپ کریں۔');
      render();
      focusAiInput();
      return;
    }
    aiChat.status = 'transcribing';
    aiChat.error = '';
    render();
    try {
      const result = await transcribeCourseAudio({ user: authenticatedUser, audio: recording, durationMs: elapsed, language: aiLanguage(), purpose: 'chat' });
      if (session !== dictation.session || !aiChatIsVisible()) return;
      const transcript = String(result?.transcript || '').trim();
      appendAiDictationTranscript(transcript);
    } catch (error) {
      if (session !== dictation.session) return;
      aiChat.error = aiLanguage() === 'ur'
        ? 'آواز کے ذریعے اِن پٹ جاری نہیں رہ سکا۔ آپ سوال ٹائپ کر سکتے ہیں۔'
        : (error?.message || 'Voice input could not continue. You can type your question instead.');
    } finally {
      if (session === dictation.session && aiChatIsVisible()) {
        aiChat.status = 'idle';
        render();
        focusAiInput();
      }
    }
  };

  const startAiDictation = async () => {
    if (aiChat.status !== 'idle') return;
    if (!aiChat.connection.speech) {
      if (startBrowserAiDictation()) return;
      aiChat.error = aiCopy('Voice input is unavailable right now. You can type your question instead.', 'وائس ان پٹ اس وقت دستیاب نہیں ہے۔ آپ سوال ٹائپ کر سکتے ہیں۔');
      render();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      if (startBrowserAiDictation({ fallback: true })) return;
      aiChat.error = aiCopy('This browser cannot record a short voice message. You can type your question instead.', 'یہ براؤزر مختصر صوتی پیغام ریکارڈ نہیں کر سکتا۔ آپ سوال ٹائپ کر سکتے ہیں۔');
      render();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!aiChatIsVisible()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const session = ++aiChat.dictation.session;
      const mimeType = supportedRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      aiChat.dictation = { ...aiChat.dictation, recorder, recognition: null, stream, chunks: [], startedAt: window.performance.now(), stopping: false, mode: 'speechmatics', fallback: false, initialDraft: aiChat.draft.trim(), finalTranscript: '', finalResultIndexes: new Set(), session };
      recorder.addEventListener('dataavailable', (event) => {
        if (session === aiChat.dictation.session && event.data?.size) aiChat.dictation.chunks.push(event.data);
      });
      recorder.addEventListener('stop', () => { void finishAiDictation(session); }, { once: true });
      aiChat.status = 'recording';
      aiChat.error = '';
      recorder.start(250);
      clearAiChatTimer();
      aiChat.dictation.timer = window.setTimeout(() => stopAiDictation(), 45000);
      render();
    } catch (error) {
      aiChat.status = 'idle';
      if (error?.name !== 'NotAllowedError' && startBrowserAiDictation({ fallback: true })) return;
      aiChat.error = error?.name === 'NotAllowedError'
        ? aiCopy('Allow microphone access to speak, or type your question instead.', 'بولنے کے لیے مائیکروفون کی اجازت دیں، یا سوال ٹائپ کریں۔')
        : aiCopy('Voice input could not start. You can type your question instead.', 'آواز کے ذریعے ان پٹ شروع نہیں ہو سکا۔ آپ سوال ٹائپ کر سکتے ہیں۔');
      render();
    }
  };

  const stopAiDictation = () => {
    const recorder = aiChat.dictation.recorder;
    const recognition = aiChat.dictation.recognition;
    if (aiChat.dictation.stopping) return;
    aiChat.dictation.stopping = true;
    clearAiChatTimer();
    if (recognition) {
      try { recognition.stop(); } catch (_) { discardAiDictation(); }
      return;
    }
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch (_) { discardAiDictation(); }
    }
  };

  const mascotScene = () => {
    if (state.view === 'dashboard') return 'dashboard';
    if (state.view === 'browse') return 'browse';
    if (state.view === 'saved') return 'saved';
    return 'course-' + (state.progress.phase || 'preview');
  };

  const mascotDialogue = () => {
    const companion = behaviourPartner.directive;
    if (companion?.message && mascotPresentation.enabled && !aiChat.open) return companion.message;
    if (behaviourPartner.rolePreview && mascotPresentation.enabled && !aiChat.open) return behaviourPartner.rolePreview;
    const moment = activeSupportMoment;
    const urdu = mascotPresentation.language === 'urdu';
    if ((state.modal === 'help' || state.modal === 'explain') && mascotPresentation.enabled) {
      return urdu
        ? 'یہیں رہیں۔ ہم ایک وقت میں صرف اگلا واضح قدم دیکھتے ہیں۔'
        : 'Stay here with me. We only need the next clear step.';
    }
    if (!moment) {
      return urdu
        ? 'میں آپ کے ساتھ ہوں۔ ایک وقت میں ایک واضح قدم۔'
        : 'I am here with you. One clear step at a time.';
    }
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

  const mascotVoiceEnabled = () => Boolean(
    mascotPresentation.enabled
    && (mascotPresentation.voice === 'speech' || mascotPresentation.voice === 'both' || learningChoices()['text-to-speech'] === 'on')
  );

  const browserMascotSpeechAvailable = () => Boolean(
    typeof window.SpeechSynthesisUtterance === 'function' && window.speechSynthesis
  );

  const mascotSpeechCanPlay = () => mascotVoiceEnabled() && Boolean(
    signedInLearner() || browserMascotSpeechAvailable()
  );

  const stopMascotSpeech = () => {
    mascotSpeech.controller?.abort?.();
    mascotSpeech.controller = null;
    if (mascotSpeech.element) {
      mascotSpeech.element.pause();
      mascotSpeech.element.src = '';
    }
    mascotSpeech.element = null;
    if (mascotSpeech.url) URL.revokeObjectURL(mascotSpeech.url);
    mascotSpeech.url = '';
    mascotSpeech.loading = false;
    mascotSpeech.text = '';
    try { window.speechSynthesis?.cancel?.(); } catch (_) { /* Browser speech is best effort. */ }
  };

  const unlockMascotAudioFromClick = () => {
    try {
      const audio = new Audio(SILENT_AUDIO_UNLOCK_WAV);
      audio.muted = true;
      // This happens synchronously inside the learner's Listen click. The
      // later network response reuses this exact element for the real voice.
      void audio.play().catch(() => {});
      return audio;
    } catch (_) {
      return null;
    }
  };

  const refreshMascotSpeechControl = () => {
    if (app.querySelector('[data-course-mascot]')) render();
  };

  const speakMascotWithBrowser = (dialogue) => {
    if (!browserMascotSpeechAvailable()) {
      announce(courseUi('Mascot speech is not available right now. You can still read its message.', 'ماسکٹ کی آواز ابھی دستیاب نہیں۔ آپ اس کا پیغام پھر بھی پڑھ سکتے ہیں۔'));
      refreshMascotSpeechControl();
      return;
    }
    try {
      const utterance = new SpeechSynthesisUtterance(dialogue);
      utterance.lang = mascotPresentation.language === 'urdu' ? 'ur-PK' : 'en-US';
      utterance.rate = 0.92;
      utterance.volume = Math.min(1, Math.max(0.1, Number(state.preferences.narrationVolume) || 0.72));
      mascotSpeech.text = dialogue;
      utterance.onstart = () => announce(courseUi('Mascot speech has started.', 'ماسکٹ کی آواز شروع ہو گئی ہے۔'));
      utterance.onend = () => {
        mascotSpeech.text = '';
        refreshMascotSpeechControl();
      };
      utterance.onerror = () => {
        mascotSpeech.text = '';
        announce(courseUi('Mascot speech could not start. You can still read its message.', 'ماسکٹ کی آواز شروع نہیں ہو سکی۔ آپ اس کا پیغام پھر بھی پڑھ سکتے ہیں۔'));
        refreshMascotSpeechControl();
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume?.();
      window.speechSynthesis.speak(utterance);
      // Chromium may preserve a paused queue after a tab return. A second
      // resume is safe and keeps this explicit user action reliable.
      window.setTimeout(() => window.speechSynthesis?.resume?.(), 80);
      refreshMascotSpeechControl();
    } catch (_) {
      mascotSpeech.text = '';
      announce(courseUi('Mascot speech could not start. You can still read its message.', 'ماسکٹ کی آواز شروع نہیں ہو سکی۔ آپ اس کا پیغام پھر بھی پڑھ سکتے ہیں۔'));
      refreshMascotSpeechControl();
    }
  };

  // Mascot speech is learner initiated. It prefers the authenticated TTS
  // route so it works even when the browser has no usable system voices, then
  // falls back to the device reader if the network voice is unavailable.
  const speakMascotDialogue = async () => {
    const dialogue = mascotDialogue();
    if (!dialogue || !mascotSpeechCanPlay()) {
      announce(courseUi('Mascot speech is not available in this browser yet.', 'اس براؤزر میں ماسکٹ کی آواز ابھی دستیاب نہیں۔'));
      return;
    }
    if (mascotSpeech.loading || mascotSpeech.text === dialogue) {
      stopMascotSpeech();
      refreshMascotSpeechControl();
      return;
    }
    stopMascotSpeech();
    // The server narration endpoint currently offers English audio. For an
    // Urdu course, use the device voice immediately from the learner's click
    // instead of waiting for a request that the server must reject.
    if (!signedInLearner() || !aiChat.connection.aiAudio || mascotPresentation.language === 'urdu') {
      speakMascotWithBrowser(dialogue);
      return;
    }
    const controller = new AbortController();
    mascotSpeech.controller = controller;
    mascotSpeech.element = unlockMascotAudioFromClick();
    mascotSpeech.loading = true;
    mascotSpeech.text = dialogue;
    refreshMascotSpeechControl();
    try {
      const blob = await synthesiseCourseAiReply({
        user: authenticatedUser,
        text: dialogue,
        language: mascotPresentation.language === 'urdu' ? 'ur' : 'en',
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const audio = mascotSpeech.element || new Audio();
      audio.pause();
      audio.src = url;
      audio.muted = false;
      mascotSpeech.controller = null;
      mascotSpeech.element = audio;
      mascotSpeech.url = url;
      mascotSpeech.loading = false;
      audio.addEventListener('ended', () => {
        if (mascotSpeech.element !== audio) return;
        stopMascotSpeech();
        refreshMascotSpeechControl();
      }, { once: true });
      await audio.play();
      announce(courseUi('Mascot speech has started.', 'ماسکٹ کی آواز شروع ہو گئی ہے۔'));
      refreshMascotSpeechControl();
    } catch (_) {
      if (controller.signal.aborted) return;
      stopMascotSpeech();
      speakMascotWithBrowser(dialogue);
    }
  };

  const mascotSpeechButtonMarkup = (dialogue) => mascotSpeechCanPlay()
    ? '<button class="course-mascot-listen" type="button" data-action="mascot-speak">'
      + escapeHtml(mascotSpeech.loading ? courseUi('Loading audio…', 'آڈیو لوڈ ہو رہی ہے…') : mascotSpeech.text === dialogue ? courseUi('Stop audio', 'آڈیو روکیں') : courseUi('Listen', 'سنیں'))
      + '</button>'
    : '';

  const courseMascotMarkup = (location) => {
    // ADAPTIVE LEARNING: an opted-in learner can request a reviewed visual
    // explanation. It uses the companion rail when present, rather than
    // competing with the task or loading an unreviewed generated image.
    if (adaptiveLearning.visualOpen && location === 'lesson' && state.view === 'course') {
      return '<aside class="course-mascot-rail course-mascot-rail--' + location + ' course-mascot-rail--visual" data-course-visual-rail>'
        + visualExplanationMarkup({ step: currentStep(), translatedStep: urduStep(), isUrdu: courseUsesUrdu(), escapeHtml, courseUi })
        + '</aside>';
    }
    if (!mascotCanAppear()) return '';
    const mascotLanguage = mascotPresentation.language === 'urdu' ? 'ur' : 'en';
    const mascotDirection = mascotPresentation.language === 'urdu' ? 'rtl' : 'ltr';
    const dialogue = mascotDialogue();
    const companion = location === 'lesson' ? behaviourPartner.directive : null;
    const showAiPanel = location === 'lesson' && aiChat.open && canUseMascotAiPanel();
    // A direct learner message must always receive a visible speech bubble,
    // including in Focused layout. The quiet trigger is only for unsolicited
    // proactive offers.
    const focusedPartner = selectedCourseLayout() === 'focused'
      && !behaviourPartner.focusedOpen
      && companion?.trigger !== 'using-support';
    const companionMarkup = !showAiPanel && companion
      ? companionBubbleMarkup({ directive: companion, language: mascotLanguage, escapeHtml, focused: focusedPartner, speechControl: mascotSpeechButtonMarkup(dialogue) })
      : '';
    const dialogueMarkup = !showAiPanel && dialogue && !companion
      ? '<div class="course-mascot-dialogue" data-mascot-dialogue aria-live="off" lang="' + mascotLanguage + '" dir="' + mascotDirection + '"><p>' + escapeHtml(dialogue) + '</p>' + mascotSpeechButtonMarkup(dialogue) + '</div>'
      : '';
    // The compact dock belongs to the bunny, not to a particular proactive
    // suggestion. It stays directly beneath its feet in the same rail and
    // can send a learner-initiated message at any time.
    const dockMarkup = !showAiPanel && location === 'lesson'
      ? companionDockMarkup({ language: mascotLanguage, escapeHtml, draft: behaviourPartner.draft, canSpeak: browserSpeechRecognitionAvailable(), channel: partnerControls().channel, listening: behaviourPartner.listening })
      : '';
    if (showAiPanel) {
      // The assistant owns this rail while it is open: the animated mascot is
      // deliberately inside its bordered chat box, never a separate sibling.
      return '<aside class="course-mascot-rail course-mascot-rail--' + location + ' is-ai-open" data-course-mascot>' + courseAiChatMarkup('rail') + '</aside>';
    }
    return '<aside class="course-mascot-rail course-mascot-rail--' + location + (companion ? ' has-learning-partner' : '') + '" data-course-mascot><div class="course-mascot-stage" data-course-mascot-stage aria-hidden="true"></div>' + companionMarkup + dialogueMarkup + dockMarkup + '</aside>';
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
      '</div>',
      '</div>',
      '</header>'
    ].join('');
  };

  const renderShell = (content) => authenticatedUser
    // A fixed child of the blurred sticky header is positioned against that
    // header in Chromium. Keep the dialog as an app-shell sibling so it is
    // truly centered against the browser viewport.
    ? '<div class="course-app-shell">' + courseTopbar() + '<div class="course-page-content">' + content + '</div>' + courseSettingsMenu() + '</div>'
    : content;

  const announce = (message) => {
    if (liveRegion) liveRegion.textContent = message;
  };

  const signedInLearner = () => Boolean(authenticatedUser && !authenticatedUser.isGuest && typeof authenticatedUser.getIdToken === 'function');

  const isLegacyCatalogueCourse = (course) => String(course?.courseId || '') === DEFAULT_COURSE_CONTENT.id
    && String(course?.version || '') === String(DEFAULT_COURSE_CONTENT.version || '');

  const refreshReviewedCourseCatalogue = async () => {
    if (!signedInLearner() || reviewedCourseCatalogue.status === 'loading' || reviewedCourseCatalogue.status === 'loaded') return;
    const controller = new AbortController();
    reviewedCourseCatalogue.status = 'loading';
    reviewedCourseCatalogue.error = '';
    reviewedCourseCatalogue.request = controller;
    try {
      const response = await loadPublishedCourseCatalogue({ user: authenticatedUser, signal: controller.signal });
      if (reviewedCourseCatalogue.request !== controller) return;
      reviewedCourseCatalogue.courses = (Array.isArray(response?.courses) ? response.courses : [])
        .filter((course) => course && !isLegacyCatalogueCourse(course))
        .filter((course) => String(course.courseId || '').trim() && String(course.version || '').trim());
      reviewedCourseCatalogue.status = 'loaded';
    } catch (error) {
      if (reviewedCourseCatalogue.request !== controller) return;
      reviewedCourseCatalogue.courses = [];
      reviewedCourseCatalogue.status = 'error';
      reviewedCourseCatalogue.error = error?.message || 'Reviewed courses could not load right now.';
    } finally {
      if (reviewedCourseCatalogue.request === controller) reviewedCourseCatalogue.request = null;
      if (state.view === 'dashboard' || state.view === 'browse') render();
    }
  };

  const adaptiveLearningIsActive = () => Boolean(
    signedInLearner()
    && adaptiveLearning.available
    && adaptiveLearning.consented
  );

  const stopAdaptiveLearningTelemetry = () => {
    window.clearTimeout(adaptiveLearning.taskInitiationTimer);
    adaptiveLearning.taskInitiationTimer = null;
    adaptiveLearning.telemetry?.dispose?.();
    adaptiveLearning.telemetry = null;
    adaptiveLearning.proposal = null;
    adaptiveLearning.taskInitiation = false;
    adaptiveLearning.visualOpen = false;
    adaptiveLearning.assessmentsAvailable = false;
  };

  const ensureAdaptiveLearningTelemetry = () => {
    if (!adaptiveLearningIsActive()) return null;
    if (!adaptiveLearning.telemetry) {
      adaptiveLearning.telemetry = new LearningTelemetry({
        // The telemetry module has already removed raw text, individual
        // keystrokes, recordings and chat. The server validates these compact
        // summaries again before saving them after a module.
        onFlush: (summary) => saveLearningSummary({
          user: authenticatedUser,
          // The summary remains aggregate-only. The BehaviourContext adds
          // chosen role/presence and aggregate support history, never raw
          // language, voice, chat, answers, or individual keystrokes.
          summary: (() => {
            const behaviourSnapshot = behaviourPartner.context.snapshot();
            return {
              ...summary,
              // The telemetry boundary owns its course identity. This avoids
              // attributing a queued module flush to a different reviewed
              // course if a learner changes course before the network returns.
              courseId: summary.courseId || COURSE.id,
              courseVersion: summary.courseVersion || activeCourseVersion(),
              // The two local collectors observe the same learner action.
              // Keep the telemetry transport as the canonical aggregate, then
              // merge only feature-use flags from BehaviourContext. No text,
              // transcript, response, chat, answer key, or score crosses this
              // boundary.
              support: {
                ...summary.support,
                ...Object.fromEntries(Object.entries(behaviourSnapshot.support || {})
                  .filter(([key]) => key !== 'assessmentHelp')
                  .map(([key, value]) => [key, Boolean(summary.support?.[key] || value)]))
              },
              // The server's learner-summary validator persists only the
              // compact behaviour object below. `behaviourSnapshot.metrics`
              // and its session-only title never leave this browser.
              behaviour: behaviourSnapshot.behaviour
            };
          })(),
          signal: requestTimeoutSignal(10000)
        })
      });
    }
    return adaptiveLearning.telemetry;
  };

  const syncAdaptiveLearningTelemetry = () => {
    const telemetry = ensureAdaptiveLearningTelemetry();
    if (!telemetry || state.view !== 'course' || isReviewingModule() || isFinalExamPhase()) return;
    telemetry.begin({
      courseId: COURSE.id,
      courseVersion: activeCourseVersion(),
      moduleIndex: displayedModuleIndex(),
      phase: state.progress.phase,
      language: courseUsesUrdu() ? 'ur' : 'en',
      enabled: true
    });
    syncBehaviourContext({ requestAi: true });
    scheduleTaskInitiationOffer(telemetry);
  };

  // ADAPTIVE LEARNING: this early support is deliberately modest. After a
  // quiet pause at the *preview* stage, it offers one dismissible first-step
  // card. It does not say why the pause happened, alter a preference, create
  // pressure, or interrupt reading/typing after the learner has begun.
  const scheduleTaskInitiationOffer = (telemetry) => {
    window.clearTimeout(adaptiveLearning.taskInitiationTimer);
    adaptiveLearning.taskInitiationTimer = null;
    if (!adaptiveLearningIsActive() || adaptiveLearning.taskInitiation
      || state.view !== 'course' || state.progress.phase !== 'preview'
      || isReviewingModule() || isFinalExamPhase()) return;
    const moduleIndex = displayedModuleIndex();
    adaptiveLearning.taskInitiationTimer = window.setTimeout(() => {
      if (!adaptiveLearningIsActive() || state.view !== 'course'
        || state.progress.phase !== 'preview' || displayedModuleIndex() !== moduleIndex
        || adaptiveLearning.taskInitiation || telemetry.hasRecordedFirstAction()) return;
      adaptiveLearning.taskInitiation = true;
      recordUnifiedBehaviourAction('task-initiation-offered');
      recordSupportMoment('task-entry', { result: 'optional-first-step' });
      render();
    }, 90_000);
  };

  const hydrateAdaptiveLearning = async () => {
    if (!signedInLearner()) {
      stopAdaptiveLearningTelemetry();
      adaptiveLearning.available = false;
      adaptiveLearning.consentKnown = true;
      adaptiveLearning.consented = false;
      return;
    }
    try {
      const health = await getCourseAiStatus();
      const enabled = Boolean(health?.adaptiveLearning?.available && health?.adaptiveSupport?.available);
      behaviourPartner.enabled = Boolean(health?.behaviouralPartner?.available);
      behaviourPartner.aiEnabled = Boolean(health?.behaviouralPartner?.aiWordingEnabled);
      adaptiveLearning.available = enabled;
      adaptiveLearning.assessmentsAvailable = Boolean(health?.assessments?.available);
      adaptiveLearning.retentionDays = Math.max(1, Math.min(365, Number(health?.adaptiveLearning?.retentionDays) || 90));
      if (!enabled) {
        adaptiveLearning.consented = false;
        adaptiveLearning.consentKnown = true;
        stopAdaptiveLearningTelemetry();
        return;
      }
      const consent = await getAdaptiveLearningConsent({ user: authenticatedUser, signal: requestTimeoutSignal(10000) });
      adaptiveLearning.consented = consent?.enabled === true;
      adaptiveLearning.consentKnown = true;
      // The first-run preferences page asks this question plainly. Honour an
      // explicit answer once the protected consent endpoint is reachable, but
      // never infer an answer from an older preference record that lacks it.
      const savedChoices = readLearningChoices();
      if (Object.prototype.hasOwnProperty.call(savedChoices, 'adaptive-learning')) {
        const requested = savedChoices['adaptive-learning'] === 'on';
        if (requested !== adaptiveLearning.consented) {
          void updateAdaptiveLearningConsent(requested);
          return;
        }
      }
      syncAdaptiveLearningTelemetry();
    } catch (_) {
      adaptiveLearning.available = false;
      adaptiveLearning.consented = false;
      adaptiveLearning.consentKnown = true;
      stopAdaptiveLearningTelemetry();
    } finally {
      if (authenticatedUser) render();
    }
  };

  const updateAdaptiveLearningConsent = async (enabled) => {
    if (!signedInLearner() || !adaptiveLearning.available || adaptiveLearning.updatingConsent) return;
    adaptiveLearning.updatingConsent = true;
    render();
    try {
      const result = await setAdaptiveLearningConsent({ user: authenticatedUser, enabled, signal: requestTimeoutSignal(10000) });
      adaptiveLearning.consented = result?.enabled === true;
      adaptiveLearning.consentKnown = true;
      const choices = learningChoices();
      if (choices['adaptive-learning'] !== (adaptiveLearning.consented ? 'on' : 'off')) {
        choices['adaptive-learning'] = adaptiveLearning.consented ? 'on' : 'off';
        saveLearningChoices(choices);
      }
      if (!adaptiveLearning.consented) stopAdaptiveLearningTelemetry();
      else syncAdaptiveLearningTelemetry();
      announce(adaptiveLearning.consented
        ? 'Adaptive learning support is on. You can change this anytime from your profile menu.'
        : 'Adaptive learning support is off. New learning summaries will not be saved.');
    } catch (error) {
      announce(error?.message || 'Adaptive learning support could not be changed right now.');
    } finally {
      adaptiveLearning.updatingConsent = false;
      render();
    }
  };

  const finishAdaptiveModuleSummary = async () => {
    const telemetry = ensureAdaptiveLearningTelemetry();
    if (!telemetry || !adaptiveLearningIsActive() || isReviewingModule() || isFinalExamPhase()) return;
    telemetry.begin({
      courseId: COURSE.id,
      courseVersion: activeCourseVersion(),
      moduleIndex: displayedModuleIndex(),
      phase: 'complete',
      language: courseUsesUrdu() ? 'ur' : 'en',
      enabled: true
    });
    syncBehaviourContext({ completed: true, requestAi: true });
    try {
      await telemetry.flush('module-complete');
      const response = await requestAdaptiveProposal({
        user: authenticatedUser,
        courseId: COURSE.id,
        courseVersion: activeCourseVersion(),
        moduleIndex: displayedModuleIndex(),
        signal: requestTimeoutSignal(12000)
      });
      adaptiveLearning.proposal = response?.proposal || null;
      if (adaptiveLearning.proposal && authenticatedUser) render();
    } catch (_) {
      // The learning path does not depend on analytics or a model response.
      // A learner always keeps the next action when this optional path is off.
    }
  };

  // ADAPTIVE LEARNING: all assessment navigation is one-question-at-a-time.
  // The browser never gets answer keys, numeric scores, or internal rubric.
  const resetUnderstandingCheckResponse = () => {
    stopAssessmentDictation();
    understandingCheck.response = '';
    understandingCheck.selectedOption = '';
    understandingCheck.error = '';
    understandingCheck.feedback = '';
    understandingCheck.lastInputAt = 0;
  };

  // ASSESSMENT VOICE INPUT: browser recognition begins only after an explicit
  // learner click. Its words are placed in the same editable response box and
  // are never retained in the behaviour context or stored until submission.
  const stopAssessmentDictation = () => {
    const recognition = understandingCheck.recognition;
    understandingCheck.recognition = null;
    understandingCheck.listening = false;
    if (recognition) {
      try { recognition.stop(); } catch (_) { /* Best effort only. */ }
    }
  };

  const startAssessmentDictation = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      understandingCheck.error = courseUi('Speech input is not available in this browser. You can type your response instead.', 'اس براؤزر میں آواز سے جواب دستیاب نہیں ہے۔ آپ اپنا جواب ٹائپ کر سکتے ہیں۔');
      renderUnderstandingCheck('[data-assessment-response]');
      return;
    }
    stopAssessmentDictation();
    let recognition;
    try { recognition = new Recognition(); } catch (_) {
      understandingCheck.error = courseUi('Speech input could not start. You can type your response instead.', 'آواز سے جواب شروع نہیں ہو سکا۔ آپ اپنا جواب ٹائپ کر سکتے ہیں۔');
      renderUnderstandingCheck('[data-assessment-response]');
      return;
    }
    const initial = understandingCheck.response.trim();
    recognition.lang = courseUsesUrdu() ? 'ur-PK' : 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    understandingCheck.recognition = recognition;
    understandingCheck.listening = true;
    understandingCheck.error = '';
    recognition.onresult = (event) => {
      if (understandingCheck.recognition !== recognition) return;
      const words = Array.from(event.results || []).map((result) => result[0]?.transcript || '').join(' ').trim();
      if (!words) return;
      understandingCheck.response = [initial, words].filter(Boolean).join(initial ? ' ' : '').slice(0, 1400);
      const input = app.querySelector('[data-assessment-response]');
      if (input) input.value = understandingCheck.response;
    };
    recognition.onerror = (event) => {
      if (understandingCheck.recognition !== recognition) return;
      const denied = ['not-allowed', 'service-not-allowed'].includes(String(event?.error || ''));
      understandingCheck.error = denied
        ? courseUi('Allow microphone access to speak a response, or type instead.', 'آواز سے جواب کے لیے مائیکروفون کی اجازت دیں، یا جواب ٹائپ کریں۔')
        : courseUi('Speech input stopped. Your editable words are still here.', 'آواز سے جواب رک گیا ہے۔ آپ کے قابلِ تدوین الفاظ ابھی موجود ہیں۔');
    };
    recognition.onend = () => {
      if (understandingCheck.recognition !== recognition) return;
      understandingCheck.recognition = null;
      understandingCheck.listening = false;
      recordUnifiedBehaviourAction('speech-complete');
      renderUnderstandingCheck('[data-assessment-response]');
    };
    try { recognition.start(); } catch (_) {
      understandingCheck.recognition = null;
      understandingCheck.listening = false;
      understandingCheck.error = courseUi('Speech input could not start. You can type your response instead.', 'آواز سے جواب شروع نہیں ہو سکا۔ آپ اپنا جواب ٹائپ کر سکتے ہیں۔');
      renderUnderstandingCheck('[data-assessment-response]');
      return;
    }
    recordUnifiedBehaviourAction('speech-start');
    renderUnderstandingCheck('[data-assessment-response]');
  };

  const renderUnderstandingCheck = (focusSelector = '') => {
    render();
    if (focusSelector) window.requestAnimationFrame(() => app.querySelector(focusSelector)?.focus?.({ preventScroll: true }));
  };

  const openUnderstandingCheck = async ({ resume = false, scope = 'module' } = {}) => {
    if (!understandingChecksAvailable()) {
      announce(courseUi('Understanding checks are not available right now. Your course work is still saved.', 'سمجھ جانچ اس وقت دستیاب نہیں ہے۔ آپ کا کورس ورک محفوظ ہے۔'));
      return;
    }
    understandingCheck.loading = true;
    understandingCheck.error = '';
    state.progress.assessmentScope = scope === 'final' ? 'final' : 'module';
    state.progress.phase = 'assessment';
    renderUnderstandingCheck();
    try {
      const savedRunId = state.progress.assessmentRunId;
      const result = resume && savedRunId
        ? await loadUnderstandingCheck({ user: authenticatedUser, runId: savedRunId, signal: requestTimeoutSignal(12000) })
        : await startUnderstandingCheck({ user: authenticatedUser, courseId: COURSE.id, courseVersion: activeCourseVersion(), moduleIndex: state.progress.lessonIndex, scope: state.progress.assessmentScope, language: courseUsesUrdu() ? 'ur' : 'en', signal: requestTimeoutSignal(12000) });
      const run = result?.run;
      if (!run?.runId) throw new Error(courseUi('This understanding check could not be opened.', 'یہ سمجھ جانچ نہیں کھولی جا سکی۔'));
      understandingCheck.run = run;
      resetUnderstandingCheckResponse();
      state.progress.assessmentRunId = run.runId;
      state.progress.phase = 'assessment';
      save();
      renderUnderstandingCheck(run.currentQuestion?.responseMode === 'mcq' ? '[data-assessment-option]' : '[data-assessment-response]');
    } catch (error) {
      understandingCheck.run = null;
      understandingCheck.error = error?.message || courseUi('This understanding check is not ready yet. Your course work is still saved.', 'یہ سمجھ جانچ ابھی تیار نہیں ہے۔ آپ کا کورس ورک محفوظ ہے۔');
      save();
      renderUnderstandingCheck();
    } finally {
      understandingCheck.loading = false;
      renderUnderstandingCheck();
    }
  };

  const submitUnderstandingCheck = async () => {
    const run = understandingCheck.run;
    const question = run?.currentQuestion;
    if (!run?.runId || !question || understandingCheck.loading) return;
    const answer = question.responseMode === 'mcq'
      ? { optionIndex: Number(understandingCheck.selectedOption) }
      : { text: understandingCheck.response.trim() };
    if ((question.responseMode === 'mcq' && !Number.isInteger(answer.optionIndex)) || (question.responseMode !== 'mcq' && answer.text.length < 2)) {
      understandingCheck.error = courseUi('Choose or write a response before continuing.', 'جاری رکھنے سے پہلے جواب منتخب کریں یا لکھیں۔');
      renderUnderstandingCheck(question.responseMode === 'mcq' ? '[data-assessment-option]' : '[data-assessment-response]');
      return;
    }
    understandingCheck.loading = true;
    understandingCheck.error = '';
    renderUnderstandingCheck();
    try {
      const result = await answerUnderstandingCheck({ user: authenticatedUser, runId: run.runId, answer, signal: requestTimeoutSignal(12000) });
      understandingCheck.run = result?.run || null;
      understandingCheck.feedback = result?.evaluation?.feedback || '';
      // Submitted answers are intentionally cleared immediately rather than
      // entering localStorage, progress snapshots, telemetry, or chat.
      understandingCheck.response = '';
      understandingCheck.selectedOption = '';
      if (!understandingCheck.run?.runId) throw new Error(courseUi('Your response could not be saved. Please try again.', 'آپ کا جواب محفوظ نہیں ہو سکا۔ براہِ کرم دوبارہ کوشش کریں۔'));
      state.progress.assessmentRunId = understandingCheck.run.runId;
      save();
      renderUnderstandingCheck(understandingCheck.run.status === 'complete'
        ? '[data-action="finish-understanding-check"]'
        : understandingCheck.run.currentQuestion?.responseMode === 'mcq' ? '[data-assessment-option]' : '[data-assessment-response]');
    } catch (error) {
      understandingCheck.error = error?.message || courseUi('Your response is still here. Try again when you are ready.', 'آپ کا جواب ابھی یہاں موجود ہے۔ جب تیار ہوں دوبارہ کوشش کریں۔');
      renderUnderstandingCheck(question.responseMode === 'mcq' ? '[data-assessment-option]' : '[data-assessment-response]');
    } finally {
      understandingCheck.loading = false;
      renderUnderstandingCheck();
    }
  };

  const leaveUnderstandingCheck = () => {
    understandingCheck.loading = false;
    understandingCheck.error = '';
    understandingCheck.feedback = '';
    understandingCheck.response = '';
    understandingCheck.selectedOption = '';
    understandingCheck.run = null;
    state.progress.phase = 'complete';
    save(courseUi('Your next question is saved. You can return whenever you are ready.', 'آپ کا اگلا سوال محفوظ ہے۔ جب تیار ہوں واپس آ سکتے ہیں۔'));
    renderUnderstandingCheck('[data-action="start-understanding-check"]');
  };

  const finishUnderstandingCheck = () => {
    // A completed check with one reviewed objective deliberately stays on its
    // recovery route. The learner can save/leave at any time, but cannot
    // accidentally skip the specific revisit + bounded recheck by using the
    // normal next-module control.
    if (understandingCheck.run?.completionKind === 'review') {
      reviewUnderstandingModule();
      return;
    }
    const finalScope = state.progress.assessmentScope === 'final';
    state.progress.assessmentRunId = '';
    state.progress.assessmentScope = 'module';
    understandingCheck.run = null;
    resetUnderstandingCheckResponse();
    if (finalScope) {
      goTo('dashboard', courseUi('Your final understanding check is complete.', 'آپ کی آخری سمجھ جانچ مکمل ہو گئی ہے۔'));
      return;
    }
    if (isLastStep()) {
      state.progress.phase = 'complete';
      save();
      render();
      focusCurrentTask();
      return;
    }
    startNextStep();
  };

  // ADAPTIVE LEARNING: a review outcome never labels a learner as failed and
  // never shows a score. It simply opens the one completed module whose
  // approved objective needs another look, then leaves the same calm check
  // available for a fresh attempt when the learner chooses to return.
  const reviewUnderstandingModule = () => {
    const moduleIndex = Number(understandingCheck.run?.reviewModuleIndex);
    if (!Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex >= COURSE.steps.length) return;
    // This is an aggregate-only return to course material. It helps the local
    // support policy avoid offering a second surface while a learner is
    // deliberately revisiting an objective; it never records what they read.
    recordUnifiedBehaviourAction('reread');
    state.reviewModuleIndex = moduleIndex;
    save(courseUi('That course idea is open for review. Your check is saved.', 'یہ کورس کا خیال دوبارہ دیکھنے کے لیے کھلا ہے۔ آپ کی جانچ محفوظ ہے۔'));
    render();
    focusCurrentTask();
  };

  // ADAPTIVE ASSESSMENT: reviewing an objective must not discard the completed
  // no-score check. The learner can return to that exact saved outcome and
  // choose a bounded fresh check only after looking over the related module.
  const returnToUnderstandingCheck = async () => {
    if (!understandingCheck.run?.runId) return;
    try {
      const result = await acknowledgeUnderstandingReview({
        user: authenticatedUser,
        runId: understandingCheck.run.runId,
        signal: requestTimeoutSignal(10000)
      });
      understandingCheck.run = result?.run || { ...understandingCheck.run, reviewAcknowledged: true };
      // The learner has chosen to return after a targeted revisit. Keep this
      // as a bounded navigation aggregate, not an assertion that they read a
      // particular sentence or understood a particular concept.
      recordUnifiedBehaviourAction('return');
      state.reviewModuleIndex = null;
      state.progress.phase = 'assessment';
      save(courseUi('Your saved understanding check is ready when you are.', 'آپ کی محفوظ سمجھ جانچ جب چاہیں تیار ہے۔'));
      renderUnderstandingCheck('[data-action="restart-understanding-check"]');
    } catch (error) {
      announce(error?.message || courseUi('Your review is still open. Return to the saved check when you are ready.', 'آپ کا جائزہ ابھی کھلا ہے۔ جب تیار ہوں محفوظ جانچ پر واپس جائیں۔'));
    }
  };

  const restartUnderstandingCheck = () => {
    const scope = state.progress.assessmentScope === 'final' ? 'final' : 'module';
    state.reviewModuleIndex = null;
    state.progress.assessmentRunId = '';
    understandingCheck.run = null;
    resetUnderstandingCheckResponse();
    // An earlier run remains private server-side for audit and deletion. A
    // new run has a fresh, stable question order and no learner-visible score.
    void openUnderstandingCheck({ scope });
  };

  const decideAdaptiveLearningProposal = async (accepted) => {
    const proposal = adaptiveLearning.proposal;
    if (!proposal?.id || !adaptiveLearningIsActive()) return;
    try {
      const result = await decideAdaptiveProposal({
        user: authenticatedUser,
        courseId: COURSE.id,
        courseVersion: activeCourseVersion(),
        proposalId: proposal.id,
        accepted,
        signal: requestTimeoutSignal(10000)
      });
      const resolved = result?.proposal || { ...proposal, status: accepted ? 'accepted' : 'declined' };
      adaptiveLearning.proposal = null;
      if (accepted && resolved.kind === 'preference' && resolved.preference?.key && resolved.preference?.value) {
        saveCourseLearningChoice(resolved.preference.key, resolved.preference.value);
        announce('That optional course setting is ready for your next module. You can change it anytime.');
        return;
      }
      if (accepted && resolved.kind === 'task-initiation') {
        adaptiveLearning.taskInitiation = true;
        announce('A small first-step prompt will be ready in the next module.');
      } else {
        announce('Your current course settings are unchanged.');
      }
      render();
    } catch (error) {
      announce(error?.message || 'That support suggestion could not be updated right now.');
    }
  };

  // Adaptive Recall can only process a signed-in learner's opted-in request.
  // Guests receive the deterministic, current-step fallback below instead.
  const canRequestAdaptiveRecall = () => signedInLearner();
  const requestTimeoutSignal = (milliseconds) => (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(milliseconds)
    : undefined);

  const localCourseSnapshot = () => ({
    version: 1,
    view: state.view,
    previousView: state.previousView,
    progress: state.progress,
    manualExampleVisible: state.manualExampleVisible,
    showSimple: state.showSimple,
    readingSectionIndex: state.readingSectionIndex,
    coursePaused: state.coursePaused,
    updatedAtMs: state.updatedAtMs
  });

  const cloudProgressSnapshot = () => ({
    // Versioned reviewed manifests must never overwrite the progress of an
    // earlier published revision with the same course id.
    courseId: progressCourseKey(),
    state: localCourseSnapshot(),
    settings: state.settings,
    choices: learningChoices()
  });

  const updateSaveStatus = (message) => {
    const saveStatus = document.querySelector('[data-save-status]');
    if (saveStatus) saveStatus.textContent = message;
  };

  const flushCloudProgress = async () => {
    if (!cloudProgress.ready || !signedInLearner()) return;
    if (cloudProgress.saving) {
      cloudProgress.queued = true;
      return;
    }
    cloudProgress.saving = true;
    cloudProgress.queued = false;
    try {
      await saveCourseProgress({ user: authenticatedUser, snapshot: cloudProgressSnapshot(), signal: requestTimeoutSignal(10000) });
      cloudProgress.status = 'account';
      cloudProgress.error = '';
      updateSaveStatus('Saved to your account');
    } catch (error) {
      cloudProgress.status = 'local';
      cloudProgress.error = error?.message || 'Account saving is temporarily unavailable.';
      // The browser copy is intentionally kept and remains the source of
      // truth until a future signed-in save succeeds.
      updateSaveStatus('Saved on this device');
    } finally {
      cloudProgress.saving = false;
      if (cloudProgress.queued) {
        cloudProgress.queued = false;
        queueCloudProgressSave();
      }
    }
  };

  const queueCloudProgressSave = () => {
    if (!cloudProgress.ready || !signedInLearner()) return;
    cloudProgress.queued = true;
    if (cloudProgress.timer !== null) return;
    cloudProgress.timer = window.setTimeout(() => {
      cloudProgress.timer = null;
      void flushCloudProgress();
    }, 900);
  };

  const restoreCloudProgress = async () => {
    if (!signedInLearner()) return;
    try {
      const result = await loadCourseProgress({ user: authenticatedUser, courseId: progressCourseKey(), signal: requestTimeoutSignal(6000) });
      const remote = result?.snapshot;
      if (remote?.state && Number(remote.updatedAtMs) > Number(state.updatedAtMs || 0)) {
        if (remote.settings && typeof remote.settings === 'object') {
          saveLearnerSettings(storageKeys.learnerId, createSettingsState(remote.settings));
        }
        if (remote.choices && typeof remote.choices === 'object') saveLearningChoices(remote.choices);
        localStorage.setItem(storageKeys.course, JSON.stringify(remote.state));
        state = loadState();
        cloudProgress.status = 'account';
      } else if (remote) {
        cloudProgress.status = 'account';
      }
    } catch (error) {
      cloudProgress.status = 'local';
      cloudProgress.error = error?.message || 'Account saving is temporarily unavailable.';
    } finally {
      cloudProgress.ready = true;
    }
  };

  const save = (message) => {
    try {
      if (!storageKeys.preferences || !storageKeys.course) throw new Error('Learner storage is not ready.');
      localStorage.setItem(storageKeys.preferences, JSON.stringify({
        version: 2,
        settingsMigrationVersion: LEGACY_COURSE_SETTINGS_MIGRATION_VERSION
      }));
      state.updatedAtMs = Date.now();
      localStorage.setItem(storageKeys.course, JSON.stringify(localCourseSnapshot()));
      state.settings = saveLearnerSettings(storageKeys.learnerId, state.settings);
      state.storageAvailable = true;
      updateSaveStatus(message || (signedInLearner() && cloudProgress.status === 'account' ? 'Saved to your account' : 'Saved on this device'));
      queueCloudProgressSave();
      if (message) announce(message);
    } catch (_) {
      state.storageAvailable = false;
      if (state.view === 'course') recordSupportMoment('system-error', { result: 'saving' });
      updateSaveStatus('Saving is unavailable in this browser session.');
      announce('Saving is unavailable in this browser session.');
    }
  };

  const beginPeriodicSave = () => {
    if (periodicSaveTimer !== null) window.clearInterval(periodicSaveTimer);
    periodicSaveTimer = window.setInterval(() => {
      if (authenticatedUser && storageKeys.course && state) save();
    }, PERIODIC_SAVE_INTERVAL_MS);
  };

  const isReviewingModule = () => Number.isInteger(state.reviewModuleIndex)
    && state.reviewModuleIndex >= 0
    && state.reviewModuleIndex < COURSE.steps.length;
  const displayedModuleIndex = () => isReviewingModule() ? state.reviewModuleIndex : state.progress.lessonIndex;
  const currentStep = () => COURSE.steps[displayedModuleIndex()];
  const partnerControls = () => {
    const choices = learningChoices();
    return normalisePartnerControls({
      enabled: choices['learning-partner'] === 'on',
      role: choices['mascot-role'],
      presence: choices['mascot-presence'],
      proactive: choices['mascot-proactive'] !== 'off',
      channel: choices['mascot-voice']
    });
  };

  const behaviourObjectiveIds = () => ['module-' + displayedModuleIndex() + '-core'];
  const syncBehaviourContext = ({ completed = false, requestAi = true } = {}) => {
    if (!state || state.view !== 'course' || isReviewingModule()) return;
    const controls = partnerControls();
    behaviourPartner.context.begin({
      courseId: COURSE.id,
      courseVersion: activeCourseVersion(),
      moduleIndex: displayedModuleIndex(), phase: state.progress.phase,
      language: courseUsesUrdu() ? 'ur' : 'en', layout: selectedCourseLayout(),
      objectiveIds: behaviourObjectiveIds(), moduleTitle: currentStep()?.title || '', controls
    });
    // The consented telemetry is already aggregate-only. Sharing only its
    // numeric counters avoids a parallel raw-input path and keeps every
    // adaptive surface grounded in one source of behaviour data.
    if (adaptiveLearning.telemetry?.metrics) {
      // Both the legacy adaptive telemetry and the partner context collect
      // aggregates from the same learner actions. Merge by highest observed
      // value instead of replacing the context: a consent-gated upload path
      // must never erase a local, privacy-safe support action (for example a
      // spoken draft) before the support policy can consider it.
      const currentMetrics = behaviourPartner.context.metrics || {};
      const telemetryMetrics = adaptiveLearning.telemetry.metrics || {};
      const metricNames = new Set([...Object.keys(currentMetrics), ...Object.keys(telemetryMetrics)]);
      behaviourPartner.context.metrics = Object.fromEntries([...metricNames].map((name) => [name, Math.max(
        Number(currentMetrics[name]) || 0,
        Number(telemetryMetrics[name]) || 0
      )]));
    }
    const snapshot = behaviourPartner.context.snapshot({ completed });
    const local = controls.enabled ? localCompanionDirective(snapshot) : null;
    const localKey = local ? [snapshot.moduleIndex, snapshot.phase, local.trigger, controls.role].join(':') : '';
    if (local && !behaviourPartner.context.isDismissed(local.trigger)) {
      behaviourPartner.directive = local;
      if (behaviourPartner.lastOfferKey !== localKey) {
        behaviourPartner.context.history.offered += 1;
        behaviourPartner.lastOfferKey = localKey;
      }
    } else if (!local) {
      behaviourPartner.directive = null;
      behaviourPartner.lastOfferKey = '';
    }
    // Gemini wording is an optional progressive enhancement. The deterministic
    // policy and authored message remain the immediate normal path. No request
    // is made for guests, without consent, or while the feature flag is off.
    const directiveKey = localKey;
    if (requestAi && local && !behaviourPartner.requesting && adaptiveLearningIsActive() && behaviourPartner.enabled && behaviourPartner.aiEnabled && behaviourPartner.lastRequestKey !== directiveKey) {
      behaviourPartner.requesting = true;
      behaviourPartner.lastRequestKey = directiveKey;
      void requestBehaviourDirective({ user: authenticatedUser, context: { ...snapshot, dismissed: behaviourPartner.context.isDismissed(local.trigger) }, signal: requestTimeoutSignal(10000) })
        .then((result) => {
          if (result?.directive && behaviourPartner.lastRequestKey === directiveKey && !behaviourPartner.context.isDismissed(result.directive.trigger)) {
            behaviourPartner.directive = { ...local, ...result.directive, source: result.source || 'authored' };
            render();
          }
        }).catch(() => {}).finally(() => { behaviourPartner.requesting = false; });
    }
  };

  const recordBehaviourAction = (kind, detail = {}) => {
    behaviourPartner.context.action(kind, detail);
    syncBehaviourContext({ requestAi: true });
  };

  // UNIFIED BEHAVIOUR EVENT: every adaptive surface observes the same
  // deliberately-minimised action. LearningTelemetry is the consent-gated
  // upload transport; BehaviourContext keeps the local session view. Calling
  // this helper never passes a learner's words, transcript, answer, audio, or
  // score to either collector.
  const recordUnifiedBehaviourAction = (kind, detail = {}) => {
    adaptiveLearning.telemetry?.action(kind, detail);
    recordBehaviourAction(kind, detail);
  };

  const companionMessage = (message) => {
    const text = String(message || '').trim().replace(/\s+/g, ' ');
    if (!text) return '';
    // Companion bubbles stay deliberately short. This is a separate compact
    // surface; the full Course AI chat remains available for a longer thread.
    return text.split(/(?<=[.!?؟])\s+/).slice(0, 2).join(' ').slice(0, 300);
  };

  // Learning-partner voice uses the browser recogniser only after the learner
  // presses Speak. It writes into the visible draft field first; nothing is
  // sent to an AI service until the learner reviews and chooses Send.
  const startCompanionDictation = () => {
    if (behaviourPartner.listening) {
      try { behaviourPartner.recognition?.stop?.(); } catch (_) { /* best effort */ }
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      announce(courseUi('Voice input is unavailable here. You can type your message instead.', 'وائس اِن پٹ یہاں دستیاب نہیں۔ آپ اپنا پیغام ٹائپ کر سکتے ہیں۔'));
      return;
    }
    let recognition;
    try { recognition = new Recognition(); } catch (_) { return; }
    const original = behaviourPartner.draft.trim();
    let finalText = '';
    recognition.lang = mascotPresentation.language === 'urdu' ? 'ur-PK' : 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || []).map((result) => result[0]?.transcript || '').join(' ').trim();
      if (transcript) behaviourPartner.draft = [original, transcript].filter(Boolean).join(original ? ' ' : '');
      finalText = transcript || finalText;
      const input = app.querySelector('[data-companion-input]');
      if (input) input.value = behaviourPartner.draft;
    };
    recognition.onerror = () => {
      behaviourPartner.listening = false;
      behaviourPartner.recognition = null;
      announce(courseUi('Voice input could not continue. You can type your message instead.', 'وائس اِن پٹ جاری نہیں رہ سکا۔ آپ اپنا پیغام ٹائپ کر سکتے ہیں۔'));
      render();
    };
    recognition.onend = () => {
      if (behaviourPartner.recognition !== recognition) return;
      behaviourPartner.listening = false;
      behaviourPartner.recognition = null;
      if (finalText) {
        // The transcript remains in the editable local draft. Behaviour data
        // sees only that a learner completed an optional speech interaction.
        recordUnifiedBehaviourAction('speech-complete');
        recordUnifiedBehaviourAction('return');
      }
      render();
      app.querySelector('[data-companion-input]')?.focus?.({ preventScroll: true });
    };
    behaviourPartner.recognition = recognition;
    behaviourPartner.listening = true;
    try {
      recognition.start();
      recordUnifiedBehaviourAction('speech-start');
      render();
    } catch (_) {
      behaviourPartner.listening = false;
      behaviourPartner.recognition = null;
    }
  };

  const sendCompanionMessage = async () => {
    const message = behaviourPartner.draft.trim();
    if (!message || behaviourPartner.requesting) return;
    if (!courseAiAccessAllowed()) {
      // Guest learning remains private and authored-only. Show the same clear
      // explanation used by Course AI rather than leaving this dock silent.
      openCourseAi(app.querySelector('[data-action="companion-send"]'));
      return;
    }
    behaviourPartner.requesting = true;
    recordUnifiedBehaviourAction('ai-request');
    try {
      const reply = await askCourseAi({ user: authenticatedUser, message, history: [], companionRole: partnerControls().role, ...aiPageRequestContext(), signal: requestTimeoutSignal(20000) });
      const response = companionMessage(reply?.reply) || courseUi('I could not make that clear yet. Try sharing one smaller part of the idea.', 'میں اسے ابھی واضح نہیں بنا سکا۔ خیال کا ایک چھوٹا حصہ بتانے کی کوشش کریں۔');
      behaviourPartner.directive = { ...(behaviourPartner.directive || {}), role: partnerControls().role, trigger: 'using-support', action: 'teach-partner', surface: 'bubble', message: response, reasonCategory: 'using-support' };
      behaviourPartner.draft = '';
      behaviourPartner.focusedOpen = true;
      behaviourPartner.context.accept('teach-partner');
    } catch (error) {
      behaviourPartner.directive = { ...(behaviourPartner.directive || {}), role: partnerControls().role, trigger: 'using-support', action: 'return-to-task', surface: 'bubble', message: courseUi('Your partner could not reply right now. Your task is still here, and you can continue when you are ready.', 'آپ کا ساتھی ابھی جواب نہیں دے سکا۔ آپ کا کام محفوظ ہے، اور آپ جب چاہیں جاری رکھ سکتے ہیں۔'), reasonCategory: 'system-error' };
      behaviourPartner.focusedOpen = true;
    } finally {
      behaviourPartner.requesting = false;
      render();
    }
  };

  const openCompanionChat = (element) => {
    const directive = behaviourPartner.directive;
    // The full chat retains its own short in-session conversation. Add the
    // concise partner support once so a small-screen learner receives the
    // exact same assistance without a mascot asset or duplicate chat system.
    if (directive?.message && !aiChat.messages.some((entry) => entry?.role === 'assistant' && entry?.content === directive.message)) {
      aiChat.messages.push({ role: 'assistant', content: directive.message, companion: true });
    }
    aiChat.draft = behaviourPartner.draft;
    openCourseAi(element);
  };

  const exportBehaviourData = async () => {
    if (!signedInLearner()) return;
    behaviourPartner.dataMessage = 'Preparing your compact adaptive-data export…';
    render();
    try {
      const exported = await exportAdaptiveLearningData({ user: authenticatedUser, signal: requestTimeoutSignal(15000) });
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'type2learn-adaptive-data.json'; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      behaviourPartner.dataMessage = 'Your compact adaptive-data export downloaded. It does not contain typing, recordings, chats, or answer text.';
    } catch (error) {
      behaviourPartner.dataMessage = error?.message || 'Your adaptive data could not be exported right now.';
    }
    render();
  };

  const deleteBehaviourData = async () => {
    if (!signedInLearner()) return;
    if (!window.confirm('Delete the optional adaptive summaries, partner history, and assessment outcomes saved to your account? This cannot be undone.')) return;
    behaviourPartner.dataMessage = 'Deleting your adaptive data…';
    render();
    try {
      await deleteAdaptiveLearningData({ user: authenticatedUser, signal: requestTimeoutSignal(15000) });
      adaptiveLearning.consented = false;
      stopAdaptiveLearningTelemetry();
      behaviourPartner.context = new BehaviourContext();
      behaviourPartner.directive = null;
      behaviourPartner.dataMessage = 'Your optional adaptive data was deleted. Local course progress stays on this device.';
    } catch (error) {
      behaviourPartner.dataMessage = error?.message || 'Your adaptive data could not be deleted right now.';
    }
    render();
  };
  const isLastStep = () => state.progress.lessonIndex === COURSE.steps.length - 1;
  const courseProgress = () => Math.round((state.progress.completedSteps.length / COURSE.steps.length) * 100);
  const isFinalExamPhase = () => ['assessment', 'exam-intro', 'exam', 'exam-results'].includes(state.progress.phase);
  const currentFinalExamQuestion = () => finalExam().questions[state.progress.finalExam.questionIndex];
  const taskPhaseTotal = () => usesReviewedManifest() ? 4 : 5;
  const phaseNumber = () => ({ preview: 1, read: 2, type: 3, check: 4, apply: 5, assessment: 5, complete: taskPhaseTotal() }[state.progress.phase] || 1);

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
    return courseUi(length > 220 ? 'About 2 minutes' : 'About 1 minute', length > 220 ? 'تقریباً 2 منٹ' : 'تقریباً 1 منٹ');
  };

  const savedTaskLabel = () => courseUi(({
    preview: 'Preview this small step',
    read: 'Read this short explanation',
    type: 'Type the current lesson section',
    check: 'Check understanding',
    apply: 'Use the idea in a small situation',
    assessment: 'Answer one understanding-check question',
    complete: 'One small step complete',
    'exam-intro': 'Get ready for the final exam',
    exam: 'Answer one final exam question',
    'exam-results': 'Review your final exam results'
  }[state.progress.phase] || 'Continue learning'), ({
    preview: 'اس مختصر مرحلے کا پیش نظارہ',
    read: 'یہ مختصر وضاحت پڑھیں',
    type: 'سبق کا موجودہ حصہ ٹائپ کریں',
    check: 'سمجھ جانچیں',
    apply: 'خیال کو مختصر صورتحال میں استعمال کریں',
    assessment: 'سمجھ جانچ کے ایک سوال کا جواب دیں',
    complete: 'ایک مختصر مرحلہ مکمل ہوا',
    'exam-intro': 'آخری امتحان کے لیے تیار ہوں',
    exam: 'آخری امتحان کے ایک سوال کا جواب دیں',
    'exam-results': 'آخری امتحان کے نتائج دیکھیں'
  }[state.progress.phase] || 'سیکھنا جاری رکھیں'));

  const taskLabel = () => isReviewingModule() ? 'Review a completed module' : savedTaskLabel();

  const canSkipCurrentTask = () => ['preview', 'read', 'exam-intro'].includes(state.progress.phase);
  const taskTime = () => {
    const estimate = isReviewingModule()
      ? (courseUsesUrdu() ? urduStep()?.duration : currentStep().duration) || courseUi('Ready when you are', 'جب تیار ہوں')
      : ({ preview: courseUi('You can skip this step', 'آپ یہ مرحلہ چھوڑ سکتے ہیں'), read: courseUi('You can skip this step', 'آپ یہ مرحلہ چھوڑ سکتے ہیں'), type: lessonTypingDuration(), check: courseUi('About 1 minute', 'تقریباً 1 منٹ'), apply: courseUi('About 1 minute', 'تقریباً 1 منٹ'), complete: courseUi('Ready when you are', 'جب تیار ہوں'), 'exam-intro': courseUi('You can skip this step', 'آپ یہ مرحلہ چھوڑ سکتے ہیں'), exam: courseUi('One question at a time', 'ایک وقت میں ایک سوال'), 'exam-results': courseUi('Ready when you are', 'جب تیار ہوں') }[state.progress.phase] || courseUi('Ready when you are', 'جب تیار ہوں'));
    return estimate;
  };

  const taskNarrationIsAvailable = () => Boolean(
    state.preferences.readAloud
    && state.view === 'course'
    && (state.progress.phase === 'read' || state.progress.phase === 'type' || isReviewingModule())
  );

  const taskNarrationStatus = () => {
    if (state.progress.phase === 'type' && typingGuidance.active) return typingGuidance.paused ? 'paused' : 'playing';
    return taskNarration.preludeActive
      ? (taskNarration.preludePaused ? 'paused' : 'playing')
      : narration.status;
  };

  const taskNarrationControlCopy = () => {
    const status = taskNarrationStatus();
    return status === 'playing'
      ? courseUi('Pause audio', 'آڈیو روکیں')
      : status === 'paused'
        ? courseUi('Resume audio', 'آڈیو جاری رکھیں')
        : status === 'finished'
          ? courseUi('Play again', 'دوبارہ چلائیں')
          : courseUi('Play audio', 'آڈیو چلائیں');
  };

  const taskNarrationControlMarkup = () => {
    if (!taskNarrationIsAvailable()) return '';
    const status = taskNarrationStatus();
    const copy = taskNarrationControlCopy();
    const icon = status === 'playing' ? 'Ⅱ' : '▶';
    return '<button class="course-task-narration-button" type="button" data-action="task-narration-toggle" data-task-narration-control aria-label="' + escapeHtml(copy) + '"><span aria-hidden="true">' + icon + '</span>' + escapeHtml(copy) + '</button>';
  };

  const visualExplanationControl = () => {
    // This is a reviewed, authored course map—not an AI-generated response.
    // It remains available without adaptive consent so learners can ask to see
    // the current idea another way while all behaviour stays local.
    if (!['preview', 'read'].includes(state.progress.phase)) return '';
    const label = adaptiveLearning.visualOpen
      ? courseUi('Hide visual', 'بصری وضاحت چھپائیں')
      : courseUi('Show a visual', 'بصری وضاحت دکھائیں');
    return '<button class="course-task-explain" type="button" data-action="toggle-visual-explanation">' + escapeHtml(label) + '</button>';
  };

  // Open layout deliberately keeps a lightweight pace cue. The other layouts
  // keep that area for support instead, so no duration is presented as a
  // requirement or expectation.
  const taskHeaderControls = (paceCopy = taskTime()) => {
    const explainLabel = courseUi('I’m stuck', 'مجھے مدد چاہیے');
    const explain = '<button class="course-task-explain" type="button" data-action="stuck">' + explainLabel + '</button>';
    const narrationControl = taskNarrationControlMarkup();
    const showPace = learningChoices().layout === 'open' || Boolean(narrationControl);
    // Small screens never load the mascot. When a compact partner directive
    // exists, this opens that same support in the accessible Course AI sheet
    // rather than leaving the learner without the offer.
    const mobilePartner = behaviourPartner.directive && !mascotCanAppear()
      ? '<button class="course-task-explain" type="button" data-action="companion-open-chat">' + escapeHtml(courseUi('Learning partner', 'سیکھنے کا ساتھی')) + '</button>'
      : '';
    return '<span class="course-task-header-controls">' + narrationControl + visualExplanationControl() + (showPace ? '<span class="course-task-time">' + escapeHtml(paceCopy) + '</span>' : '') + mobilePartner + explain + '</span>';
  };

  const applyPreferences = () => {
    const courseChoices = learningChoices();
    // Apply the course's colour choice before feedback and motion are painted.
    // This prevents an older site-wide mode from styling a course popup after
    // the learner has deliberately selected a different colour treatment.
    if (colorModes.includes(courseChoices.colours) && currentColorMode() !== courseChoices.colours) {
      window.Type2LearnColorMode?.set(courseChoices.colours, false);
    }
    if (websiteSchemes.includes(courseChoices['website-scheme'])
      && window.Type2LearnWebsiteScheme?.get?.() !== courseChoices['website-scheme']) {
      window.Type2LearnWebsiteScheme?.set(courseChoices['website-scheme'], false);
    }
    document.body.dataset.courseLayout = ['focused', 'balanced', 'open'].includes(courseChoices.layout) ? courseChoices.layout : 'focused';
    document.body.dataset.courseAnimations = effectiveAnimationLevel();
    document.body.dataset.courseAnimationPreference = savedAnimationLevel();
    document.body.dataset.courseEncouragement = selectedEncouragementLevel();
    const urdu = courseUsesUrdu();
    document.body.dataset.courseDirection = urdu ? 'rtl' : 'ltr';
    document.documentElement.lang = urdu ? 'ur' : 'en';
    document.documentElement.dir = urdu ? 'rtl' : 'ltr';
    const skipLink = document.querySelector('[data-course-skip-link]');
    if (skipLink) {
      skipLink.textContent = urdu ? 'موجودہ کام پر جائیں' : 'Skip to the current task';
      skipLink.lang = urdu ? 'ur' : 'en';
      skipLink.dir = urdu ? 'rtl' : 'ltr';
    }
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
    document.body.dataset.courseReadingSurface = ['paper', 'soft-blue', 'warm-cream'].includes(courseChoices['reading-surface'])
      ? courseChoices['reading-surface']
      : 'paper';
    document.body.dataset.courseNumericProgress = state.preferences.numericProgress;
    document.body.classList.toggle('course-high-contrast', Boolean(state.preferences.highContrast));
    document.body.classList.toggle('course-large-controls', Boolean(state.preferences.largerControls));
    document.body.classList.toggle('course-reduced-motion', Boolean(state.preferences.reducedMotion));
    document.body.classList.toggle('course-content-transitions', contentTransitionsAreEnabled());
    // The first task-card playback release is intentionally non-visual: it
    // provides a deliberate audio control without word/paragraph highlighting.
    document.body.classList.remove('course-tts-mode-active');
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
      || savedVoice === LOCAL_AVA_VOICE_URI) return false;
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
  // Speech input is always a deliberate button press. It is available to a
  // signed-in learner in both a concept response and the lesson-section
  // typing activity; the latter lets Speechmatics place a close transcription
  // against the authored reference without using the AI model.
  const typingAllowsVoiceInput = () => signedInLearner() && (typingIsConceptResponse() || usesLessonSectionTyping());
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
      const reviewLabel = state.preferences.visibleProgress
        ? courseUi('Reviewing module ' + (displayedModuleIndex() + 1) + ' of ' + COURSE.steps.length, 'ماڈیول ' + (displayedModuleIndex() + 1) + ' از ' + COURSE.steps.length + ' کا جائزہ')
        : courseUi('Reviewing a completed module', 'مکمل ماڈیول کا جائزہ');
      const duration = courseUsesUrdu() ? urduStep()?.duration : currentStep().duration;
      return '<span>' + escapeHtml(reviewLabel) + '</span><i aria-hidden="true"></i><span>' + escapeHtml(duration || courseUi('Ready when you are', 'جب تیار ہوں')) + '</span>';
    }
    if (isFinalExamPhase()) {
      const run = understandingCheck.run;
      const position = Math.max(1, Number(run?.questionPosition) || 1);
      const total = Math.max(position, Number(run?.questionCount) || 1);
      const detail = run?.status === 'complete'
        ? courseUi('Complete', 'مکمل')
        : courseUi('Question ' + position + ' of ' + total, 'سوال ' + position + ' از ' + total);
      return '<span>' + escapeHtml(courseUi('Final understanding check', 'آخری سمجھ جانچ')) + '</span><i aria-hidden="true"></i><span>' + escapeHtml(detail) + '</span>';
    }
    const stepNumber = state.progress.lessonIndex + 1;
    const stepLabel = state.preferences.visibleProgress
      ? courseUi('Step ' + stepNumber + ' of ' + COURSE.steps.length, 'مرحلہ ' + stepNumber + ' از ' + COURSE.steps.length)
      : courseUsesUrdu() ? (urduStep()?.title || '') : currentStep().title;
    const duration = courseUsesUrdu() ? urduStep()?.duration : currentStep().duration;
    return '<span>' + escapeHtml(urduScriptTerms(stepLabel)) + '</span><i aria-hidden="true"></i><span>' + escapeHtml(duration || '') + '</span>';
  };

  const PLANNED_COURSES = [
    {
      title: 'Introduction to Touch Typing',
      description: 'Build steady keyboard confidence with finger placement, accuracy, and practical typing habits.',
      urduTitle: 'ٹچ ٹائپنگ کا تعارف',
      urduDescription: 'انگلیوں کی درست جگہ، درستگی اور عملی ٹائپنگ کی عادتوں کے ساتھ کی بورڈ پر پُراعتماد ہونا سیکھیں۔',
      urduMode: false
    },
    {
      title: 'Introduction to English Language',
      description: 'Practise reading, vocabulary, and written expression through short active-learning tasks.',
      urduTitle: 'انگریزی زبان کا تعارف',
      urduDescription: 'مختصر عملی سرگرمیوں کے ذریعے پڑھنے، ذخیرۂ الفاظ اور تحریری اظہار کی مشق کریں۔',
      urduMode: false
    },
    {
      title: 'Introduction to Python Programming',
      description: 'Learn core programming ideas by reading, predicting, and writing small Python programs.',
      urduTitle: 'پائتھن پروگرامنگ کا تعارف',
      urduDescription: 'پڑھنے، پیش گوئی کرنے اور پائتھن کے مختصر پروگرام لکھنے سے پروگرامنگ کے بنیادی تصورات سیکھیں۔',
      urduMode: true
    },
    {
      title: 'Introduction to C++ Programming',
      description: 'Explore programming foundations, syntax, and problem-solving with C++.',
      urduTitle: 'سی پلس پلس پروگرامنگ کا تعارف',
      urduDescription: 'سی پلس پلس کے ساتھ پروگرامنگ کی بنیادیں، نحو اور مسئلہ حل کرنے کے طریقے جانیں۔',
      urduMode: true
    },
    {
      title: 'Introduction to C Programming',
      description: 'Learn fundamental programming concepts and how C programs are built step by step.',
      urduTitle: 'سی پروگرامنگ کا تعارف',
      urduDescription: 'پروگرامنگ کے بنیادی تصورات اور سی پروگرام مرحلہ وار کیسے بنتے ہیں، یہ سیکھیں۔',
      urduMode: true
    },
    {
      title: 'Introduction to ARM Assembly',
      description: 'Explore registers, instructions, and simple programs for ARM-based systems.',
      urduTitle: 'اے آر ایم اسمبلی کا تعارف',
      urduDescription: 'اے آر ایم نظاموں کے لیے رجسٹرز، ہدایات اور مختصر پروگرام جانیں۔',
      urduMode: true
    }
  ];

  const availableCourseCard = () => {
    const preferencesReady = coursePreferencesAreSaved();
    return '<section class="course-catalogue-card course-catalogue-card--available" aria-labelledby="available-course-title"><div><p class="course-eyebrow">' + courseUi('Available course', 'دستیاب کورس') + '</p><h2 id="available-course-title">' + escapeHtml(courseUi(COURSE.title, COURSE_URDU.title)) + '</h2><p class="course-catalogue-setup">' + (preferencesReady
      ? courseUi('Your course choices are ready. You can change them anytime from the profile picture in the top-right corner.', 'آپ کے کورس کے انتخاب تیار ہیں۔ آپ انہیں اوپر دائیں جانب پروفائل تصویر سے کسی بھی وقت تبدیل کر سکتے ہیں۔')
      : courseUi('Choose this course, then set up the learning options that fit this course.', 'یہ کورس منتخب کریں، پھر اس کے مطابق سیکھنے کے اختیارات ترتیب دیں۔')) + '</p><p class="course-catalogue-description">' + courseUi('Explore respectful language, everyday experiences, and practical ways to support accessible participation.', 'باعزت زبان، روزمرہ تجربات اور قابلِ رسائی شرکت میں مدد کے عملی طریقوں کے بارے میں جانیں۔') + '</p><p class="course-catalogue-language">' + courseUi('Urdu is available', 'اردو دستیاب ہے') + '</p></div><button class="course-primary-button" type="button" data-action="course-preferences">' + courseUi('Choose this course', 'یہ کورس منتخب کریں') + ' <span aria-hidden="true">' + courseUi('→', '←') + '</span></button></section>';
  };

  const lockedCourseCard = (course) => {
    const title = courseUi(course.title, course.urduTitle);
    const description = courseUi(course.description, course.urduDescription);
    return '<article class="course-catalogue-card course-catalogue-card--locked" aria-label="' + escapeHtml(courseUi(course.title + ' is planned and not available yet.', course.urduTitle + ' منصوبہ بند ہے اور ابھی دستیاب نہیں ہے۔')) + '"><div class="course-catalogue-card-copy"><p class="course-eyebrow">' + courseUi('Planned course', 'منصوبہ بند کورس') + '</p><h2>' + escapeHtml(title) + '</h2><p class="course-catalogue-description">' + escapeHtml(description) + '</p>' + (course.urduMode ? '<p class="course-catalogue-language">' + courseUi('Urdu mode planned', 'اردو موڈ منصوبہ بند ہے') + '</p>' : '') + '</div><div class="course-catalogue-lock" aria-hidden="true"><span>' + courseUi('Not available yet', 'ابھی دستیاب نہیں') + '</span></div><span class="course-visually-hidden">' + courseUi('This planned course is not available yet.', 'یہ منصوبہ بند کورس ابھی دستیاب نہیں ہے۔') + '</span></article>';
  };

  const reviewedCourseCard = (course, index) => {
    const englishTitle = String(course?.title?.en || course?.courseId || '').trim();
    const urduTitle = String(course?.title?.ur || englishTitle).trim();
    const title = courseUi(englishTitle, urduTitle);
    const englishLabel = String(course?.label?.en || 'Educational course').trim();
    const urduLabel = String(course?.label?.ur || 'تعلیمی کورس').trim();
    const modules = Math.max(0, Number(course?.modules) || 0);
    const headingId = 'reviewed-course-title-' + index;
    return '<article class="course-catalogue-card course-catalogue-card--available course-catalogue-card--published" aria-labelledby="' + headingId + '"><div><p class="course-eyebrow">' + escapeHtml(courseUi('New reviewed course', 'نیا جائزہ شدہ کورس')) + '</p><h2 id="' + headingId + '">' + escapeHtml(title) + '</h2><p class="course-catalogue-setup">' + escapeHtml(courseUi(englishLabel, urduLabel)) + (modules ? ' · ' + escapeHtml(courseUi(modules + ' modules', modules + ' ماڈیولز')) : '') + '</p><p class="course-catalogue-description">' + escapeHtml(courseUi('This approved course is ready in the same accessible Type2Learn learning flow.', 'یہ منظور شدہ کورس اسی قابلِ رسائی Type2Learn سیکھنے کے طریقے میں تیار ہے۔')) + '</p><p class="course-catalogue-language">' + escapeHtml(courseUi('English and Urdu learning choices available', 'انگریزی اور اردو سیکھنے کے انتخاب دستیاب ہیں')) + '</p></div><button class="course-primary-button" type="button" data-action="open-reviewed-course" data-course-id="' + escapeHtml(String(course.courseId)) + '" data-course-version="' + escapeHtml(String(course.version)) + '">' + escapeHtml(courseUi('Choose this course', 'یہ کورس منتخب کریں')) + ' <span aria-hidden="true">' + escapeHtml(courseUi('→', '←')) + '</span></button></article>';
  };

  const reviewedCourseCardsMarkup = () => {
    if (reviewedCourseCatalogue.status === 'loading') return '<p class="course-catalogue-loading" role="status">' + escapeHtml(courseUi('Checking for approved courses…', 'منظور شدہ کورسز دیکھے جا رہے ہیں…')) + '</p>';
    if (reviewedCourseCatalogue.status === 'error') return '<p class="course-catalogue-loading" role="status">' + escapeHtml(courseUi('Approved additional courses could not load right now. Your available course remains ready.', 'منظور شدہ اضافی کورسز ابھی لوڈ نہیں ہو سکے۔ آپ کا دستیاب کورس تیار ہے۔')) + '</p>';
    return reviewedCourseCatalogue.courses.map(reviewedCourseCard).join('');
  };

  const courseCatalogue = () => '<section class="course-catalogue" aria-label="' + courseUi('Course selection', 'کورس کا انتخاب') + '">' + availableCourseCard() + reviewedCourseCardsMarkup() + '<div class="course-catalogue-grid">' + PLANNED_COURSES.map(lockedCourseCard).join('') + '</div></section>';

  const renderDashboard = () => '<main class="course-dashboard" id="course-main">' + dashboardWithMascot('<header class="course-dashboard-header"><p class="course-eyebrow">' + courseUi('Your learning space', 'آپ کی سیکھنے کی جگہ') + '</p><h1>' + courseUi('One small step at a time.', 'ایک وقت میں ایک مختصر مرحلہ') + '</h1><p>' + courseUi('Choose one course to begin. You can set up the learning options for that course before you start.', 'شروع کرنے کے لیے ایک کورس منتخب کریں۔ اس کورس کے سیکھنے کے اختیارات شروع کرنے سے پہلے ترتیب دیے جا سکتے ہیں۔') + '</p></header>' + courseCatalogue(), 'dashboard') + '</main>';

  const renderBrowse = () => '<main class="course-dashboard" id="course-main">' + dashboardWithMascot('<div class="course-panel-page"><button class="course-back-button" type="button" data-action="dashboard">' + courseUi('← Back to learning overview', 'سیکھنے کے خلاصے پر واپس جائیں ←') + '</button><p class="course-eyebrow">' + courseUi('Browse courses', 'کورسز دیکھیں') + '</p><h1>' + courseUi('One course is ready for this prototype.', 'اس نمونے کے لیے ایک کورس تیار ہے۔') + '</h1><p class="course-lead">' + courseUi('Keeping the next choice small helps this experience stay task-focused. More courses can appear here once their content is reviewed.', 'اگلے انتخاب کو محدود رکھنے سے توجہ موجودہ کام پر رہتی ہے۔ مواد کا جائزہ مکمل ہونے پر مزید کورسز یہاں آ سکتے ہیں۔') + '</p><article class="course-listing"><div><span class="course-status">' + courseUi('Prototype course', 'نمونہ کورس') + '</span><h2>' + escapeHtml(courseUi(COURSE.title, COURSE_URDU.title)) + '</h2><p>' + courseUi(COURSE.steps.length + ' short, non-diagnostic modules about general experiences, respectful language, and accessible participation.', COURSE.steps.length + ' مختصر، غیر تشخیصی ماڈیولز: روزمرہ تجربات، باعزت زبان اور قابلِ رسائی شرکت میں مدد کے بارے میں۔') + '</p></div><button class="course-primary-button" type="button" data-action="course-preferences">' + courseUi('Choose this course', 'یہ کورس منتخب کریں') + ' <span aria-hidden="true">' + courseUi('→', '←') + '</span></button></article></div>', 'browse') + '</main>';


  const moduleProgressItem = (step, index, includeFinalExam = false) => {
    const displayedTitle = courseUsesUrdu() ? (COURSE_URDU.steps[index]?.title || '') : step.title;
    const visibleTitle = courseUsesUrdu() ? urduScriptTerms(displayedTitle) : displayedTitle;
    const complete = state.progress.completedSteps.includes(index);
    const active = isReviewingModule()
      ? index === displayedModuleIndex()
      : (!includeFinalExam || !isFinalExamPhase()) && index === state.progress.lessonIndex;
    const status = active
      ? (isReviewingModule() ? courseUi('Reviewing now', 'ابھی جائزہ لے رہے ہیں') : taskLabel())
      : complete ? courseUi('Completed · Review', 'مکمل · جائزہ') : courseUi('Available next', 'اگلا دستیاب');
    const details = complete && !active
      ? '<button type="button" data-action="review-module" data-module-index="' + index + '" aria-label="' + escapeHtml(courseUi('Review completed module ' + (index + 1) + ': ' + step.title, 'مکمل ماڈیول ' + (index + 1) + ' کا جائزہ: ' + displayedTitle)) + '"><strong>' + escapeHtml(visibleTitle) + '</strong><small>' + escapeHtml(status) + '</small></button>'
      : '<div><strong>' + escapeHtml(visibleTitle) + '</strong><small>' + escapeHtml(status) + '</small></div>';
    return '<li class="' + (complete ? 'is-complete ' : '') + (active ? 'is-active ' : '') + (complete && !active ? 'is-reviewable' : '') + '"' + (active ? ' aria-current="step"' : '') + '><span>' + (complete ? '✓' : index + 1) + '</span>' + details + '</li>';
  };

  const courseModuleStripWithFinalExam = () => {
    const modules = COURSE.steps.map((step, index) => moduleProgressItem(step, index, true)).join('');
    const examActive = isFinalExamPhase() && !isReviewingModule();
    const examComplete = Boolean(understandingCheck.run?.status === 'complete');
    const examStatus = examActive
      ? taskLabel()
      : examComplete
        ? courseUi('Completed', 'مکمل')
        : courseUi('Available after module ' + COURSE.steps.length, 'ماڈیول ' + COURSE.steps.length + ' کے بعد دستیاب');
    const examItem = '<li class="course-module-exam ' + (examComplete ? 'is-complete ' : '') + (examActive ? 'is-active' : '') + '"><span>' + (examComplete ? '✓' : COURSE.steps.length + 1) + '</span><div><strong>' + escapeHtml(courseUi('Final understanding check', 'آخری سمجھ جانچ')) + '</strong><small>' + escapeHtml(examStatus) + '</small></div></li>';
    return '<nav class="course-module-strip" aria-label="' + escapeHtml(courseUi(state.preferences.visibleProgress ? 'Course progress' : 'Course module navigation', state.preferences.visibleProgress ? 'کورس کی پیش رفت' : 'کورس ماڈیول کی رہنمائی')) + '"><div class="course-module-strip-heading"><p class="course-eyebrow">' + escapeHtml(courseUi(state.preferences.visibleProgress ? 'Course progress' : 'Course modules', state.preferences.visibleProgress ? 'کورس کی پیش رفت' : 'کورس ماڈیولز')) + '</p><span>' + escapeHtml(courseUi(COURSE.steps.length + ' small modules · one final understanding check', COURSE.steps.length + ' مختصر ماڈیولز · ایک آخری سمجھ جانچ')) + '</span></div><ol class="course-module-list">' + modules + examItem + '</ol></nav>';
  };

  const courseNextStepCopy = () => {
    if (isReviewingModule()) return courseUi('Return to your saved current task', 'اپنے محفوظ موجودہ کام پر واپس جائیں');
    return courseUi(({
    preview: 'Read the short explanation',
    read: 'Type the first lesson section',
    type: 'Complete the lesson typing',
    check: 'Use the idea in a small situation',
    apply: 'Mark this step complete',
    assessment: 'Answer one question at a time',
    complete: isLastStep() ? 'Start the final understanding check' : 'Preview the next short step',
    'exam-intro': 'Start the first exam question',
    exam: state.progress.finalExam.submitted
      ? state.progress.finalExam.questionIndex === finalExamQuestionCount() - 1 ? 'See your final results' : 'Move to the next question'
      : 'Submit your selected answer',
    'exam-results': 'Return to your learning overview'
    }[state.progress.phase] || 'Continue learning'), ({
    preview: 'مختصر وضاحت پڑھیں',
    read: 'سبق کا پہلا حصہ ٹائپ کریں',
    type: 'سبق کی ٹائپنگ مکمل کریں',
    check: 'خیال کو مختصر صورتحال میں استعمال کریں',
    apply: 'اس مرحلے کو مکمل نشان زد کریں',
    assessment: 'ایک وقت میں ایک سوال کا جواب دیں',
    complete: isLastStep() ? 'آخری سمجھ جانچ شروع کریں' : 'اگلے مختصر مرحلے کا پیش نظارہ دیکھیں',
    'exam-intro': 'امتحان کا پہلا سوال شروع کریں',
    exam: state.progress.finalExam.submitted
      ? state.progress.finalExam.questionIndex === finalExamQuestionCount() - 1 ? 'آخری نتائج دیکھیں' : 'اگلے سوال کی طرف جائیں'
      : 'منتخب جواب جمع کریں',
    'exam-results': 'سیکھنے کے خلاصے پر واپس جائیں'
    }[state.progress.phase] || 'سیکھنا جاری رکھیں'));
  };

  const courseReturnLocation = () => {
    if (isReviewingModule()) {
      const savedStep = COURSE.steps[state.progress.lessonIndex];
      return (courseUsesUrdu() ? COURSE_URDU.steps[state.progress.lessonIndex].title : savedStep.title) + ' · ' + taskLabel();
    }
    if (isFinalExamPhase()) {
      const run = understandingCheck.run;
      const position = Math.max(1, Number(run?.questionPosition) || 1);
      const total = Math.max(position, Number(run?.questionCount) || 1);
      const detail = run?.status === 'complete'
        ? courseUi('Complete', 'مکمل')
        : courseUi('Question ' + position + ' of ' + total, 'سوال ' + position + ' از ' + total);
      return courseUi('Final understanding check · ', 'آخری سمجھ جانچ · ') + detail;
    }
    if (state.progress.phase === 'exam') return courseUi('Final exam · Question ' + (state.progress.finalExam.questionIndex + 1) + ' of ' + finalExamQuestionCount(), 'آخری امتحان · سوال ' + (state.progress.finalExam.questionIndex + 1) + ' از ' + finalExamQuestionCount());
    if (state.progress.phase === 'exam-intro') return courseUi('Final exam · Ready to begin', 'آخری امتحان · شروع کرنے کے لیے تیار');
    if (state.progress.phase === 'exam-results') return courseUi('Final exam · Results and review', 'آخری امتحان · نتائج اور جائزہ');
    return (courseUsesUrdu() ? urduStep()?.title : currentStep().title) + ' · ' + taskLabel();
  };

  const courseProgressWithFinalExam = () => {
    if (!isFinalExamPhase()) return courseProgressBar();
    const run = understandingCheck.run;
    const total = Math.max(1, Number(run?.questionCount) || 1);
    const progress = run?.status === 'complete' ? total : Math.max(0, Math.min(total, (Number(run?.questionPosition) || 1) - 1));
    const status = run?.status === 'complete'
      ? courseUi('Complete', 'مکمل')
      : courseUi('Question ' + Math.max(1, Number(run?.questionPosition) || 1) + ' of ' + total, 'سوال ' + Math.max(1, Number(run?.questionPosition) || 1) + ' از ' + total);
    const progressFallback = (value, maximum) => courseUi(value + ' of ' + maximum, value + ' از ' + maximum);
    return '<section class="course-progress-panel" aria-label="' + escapeHtml(courseUi('Learning progress', 'سیکھنے کی پیش رفت')) + '"><div><p>' + escapeHtml(courseUi('Course progress', 'کورس کی پیش رفت')) + '</p><strong>' + escapeHtml(courseUi('Final understanding check', 'آخری سمجھ جانچ')) + '</strong><span>' + escapeHtml(courseUi('One calm question at a time', 'ایک وقت میں ایک پُرسکون سوال')) + '</span></div><div class="course-progress-bars"><div><span>' + escapeHtml(courseUi('Understanding check · ', 'سمجھ جانچ · ') + status) + '</span><progress value="' + progress + '" max="' + total + '">' + progressFallback(progress, total) + '</progress></div><div><span>' + escapeHtml(courseUi('Course modules · ' + state.progress.completedSteps.length + ' lessons completed', 'کورس ماڈیولز · ' + state.progress.completedSteps.length + ' اسباق مکمل')) + '</span><progress value="' + state.progress.completedSteps.length + '" max="' + COURSE.steps.length + '">' + progressFallback(state.progress.completedSteps.length, COURSE.steps.length) + '</progress></div></div></section>';
  };

  const selectedCourseLayout = () => {
    const layout = learningChoices().layout;
    return ['focused', 'balanced', 'open'].includes(layout) ? layout : 'balanced';
  };

  const courseHeaderMarkup = (layout) => {
    const isBalanced = layout === 'balanced';
    const eyebrow = isReviewingModule() ? (courseUsesUrdu() ? COURSE_URDU.label : COURSE.label) : isFinalExamPhase() ? (courseUsesUrdu() ? 'کورس کی آخری سمجھ جانچ' : 'Course final understanding check') : (courseUsesUrdu() ? COURSE_URDU.label : COURSE.label);
    const savedLabel = signedInLearner() && cloudProgress.status === 'account'
      ? courseUi('Saved to your account', 'آپ کے اکاؤنٹ میں محفوظ ہے')
      : courseUi('Saved on this device', 'اس آلے پر محفوظ ہے');
    return '<div class="course-course-header-actions"><button class="course-back-button" type="button" data-action="dashboard">' + escapeHtml(courseUi('← Back to learning overview', 'سیکھنے کے خلاصے پر واپس جائیں ←')) + '</button></div><header class="course-heading"><div><p class="course-eyebrow">' + escapeHtml(urduScriptTerms(eyebrow)) + '</p><h1 id="course-course-title" tabindex="-1">' + escapeHtml(urduScriptTerms(courseUsesUrdu() ? COURSE_URDU.title : COURSE.title)) + '</h1>' + (isBalanced ? '' : '<p class="course-step-meta">' + currentStepSummary() + '</p>') + '</div>' + (isBalanced ? '' : '<span class="course-saved-status" data-save-status>' + escapeHtml(state.storageAvailable ? savedLabel : courseUi('Saving unavailable', 'محفوظ کرنا دستیاب نہیں')) + '</span>') + '</header>';
  };

  const courseNowPanelMarkup = () => '<section class="course-now-panel"><div><span>' + escapeHtml(courseUi('What am I doing?', 'میں کیا کر رہا/رہی ہوں؟')) + '</span><strong>' + escapeHtml(taskLabel()) + '</strong></div><div><span>' + escapeHtml(courseUi('What is next?', 'اگلا کیا ہے؟')) + '</span><strong>' + escapeHtml(courseNextStepCopy()) + '</strong></div><div><span>' + escapeHtml(courseUi('Can I pause?', 'کیا میں وقفہ کر سکتا/سکتی ہوں؟')) + '</span><strong>' + escapeHtml(courseUi('Use Pause & save in the top bar.', 'اوپر والی پٹی میں وقفہ اور محفوظ کریں استعمال کریں۔')) + '</strong></div></section>';

  const renderCourseWithFinalExam = () => {
    const layout = selectedCourseLayout();
    const focused = layout === 'focused';
    const balanced = layout === 'balanced';
    const visualRail = adaptiveLearning.visualOpen && state.view === 'course';
    const shellClass = 'course-learning-shell course-learning-shell--' + layout + (mascotCanAppear() || visualRail ? ' has-course-mascot' : '');
    const context = focused ? '' : courseHeaderMarkup(layout) + (balanced ? '' : courseNowPanelMarkup());
    const taskProgress = focused || balanced ? '' : courseProgressWithFinalExam();
    return '<main class="course-learning" id="course-main"><div class="' + shellClass + '">' + (focused ? '' : courseModuleStripWithFinalExam()) + '<section class="course-workspace course-workspace--' + layout + '">' + context + renderTask() + taskProgress + '</section>' + courseMascotMarkup('lesson') + '</div></main>' + renderModal();
  };

  const renderSavedWithFinalExam = () => '<main class="course-dashboard" id="course-main">' + dashboardWithMascot('<div class="course-panel-page"><button class="course-back-button" type="button" data-action="dashboard">' + courseUi('← Back to learning overview', 'سیکھنے کے خلاصے پر واپس جائیں ←') + '</button><p class="course-eyebrow">' + courseUi('Saved lessons', 'محفوظ سبق') + '</p><h1>' + courseUi('Your learning is waiting in one clear place.', 'آپ کا سیکھنے کا کام ایک واضح جگہ پر محفوظ ہے۔') + '</h1><p class="course-lead">' + courseUi('The course returns to the current small task, along with your response and support choices in this browser.', 'کورس اسی براؤزر میں آپ کے جواب اور مدد کے انتخاب کے ساتھ موجودہ مختصر کام پر واپس آتا ہے۔') + '</p><article class="saved-card"><span class="course-status">' + courseUi('Saved locally', 'مقامی طور پر محفوظ ہے') + '</span><h2>' + escapeHtml(courseUi(COURSE.title, COURSE_URDU.title)) + '</h2><p>' + escapeHtml(courseReturnLocation()) + '</p><div><button class="course-primary-button" type="button" data-action="continue-course">' + courseUi('Return to this step', 'اس مرحلے پر واپس جائیں') + ' <span aria-hidden="true">' + courseUi('→', '←') + '</span></button></div></article></div>', 'saved') + '</main>';

  const readingSections = () => {
    const content = currentStep().content;
    if (!content) return (currentStep().read || []).map((value, index) => ({ heading: index === 0 ? 'Key idea' : '', value, sourceIndex: index }));
    const urduContent = urduStep()?.content || {};
    return [
      { heading: content.definitionHeading, value: content.definition, urduHeading: urduContent.definitionHeading, urduValue: urduContent.definition },
      { heading: content.dailyLifeHeading, value: content.dailyLife, urduHeading: urduContent.dailyLifeHeading, urduValue: urduContent.dailyLife },
      { heading: content.strengthsHeading, value: content.strengths, urduHeading: urduContent.strengthsHeading, urduValue: urduContent.strengths },
      { heading: content.challengesHeading, value: content.challenges, urduHeading: urduContent.challengesHeading, urduValue: urduContent.challenges },
      { heading: content.supportsHeading, value: content.supports, urduHeading: urduContent.supportsHeading, urduValue: urduContent.supports }
    ]
      .filter(({ heading, value }) => Boolean(heading && value))
      .map((section, sourceIndex) => ({ ...section, sourceIndex }));
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
    const urdu = urduStep();
    const card = (label, value, urduLabel = '', urduValue = '') => '<aside class="course-example" aria-label="' + escapeHtml(label) + '">' + bilingualReadingTextMarkup('strong', label, urduLabel, narrationState) + bilingualReadingTextMarkup('p', value, urduValue, narrationState) + '</aside>';
    const additional = authoredAdditionalExamples().map((value, index) => card(index === 0 ? 'Another example' : 'Additional example ' + (index + 1), value, index === 0 ? 'ایک اور مثال' : 'اضافی مثال ' + (index + 1)));
    return [first ? card('Example', first, 'مثال', urdu?.example) : '', ...additional].join('');
  };

  const readingSectionProgress = () => {
    if (!smallerSectionsAreActive()) return '';
    const total = readingSections().length;
    const index = currentReadingSectionIndex();
    return '<p class="course-reading-section-progress" aria-live="polite">' + escapeHtml(courseUi(
      'Small section ' + (index + 1) + ' of ' + total + '. Finish this part, then choose the next section.',
      'مختصر حصہ ' + (index + 1) + ' از ' + total + '۔ یہ حصہ مکمل کریں، پھر اگلا حصہ منتخب کریں۔'
    )) + '</p>';
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

  const reviewedNarrationPlaylist = (chunks) => {
    const key = reviewedNarrationKey();
    if (!key || reviewedNarration.readyKey !== key || !reviewedNarration.url || !Array.isArray(chunks) || !chunks.length) return [];
    const text = chunks.map((chunk) => String(chunk?.text || '').trim()).filter(Boolean).join(' ');
    const chunkMap = mapAudioTextToNarrationChunks(text, chunks);
    // Never approximate a human recording against content that no longer
    // matches the reviewed module's visible text.
    if (chunkMap.length !== chunks.length) return [];
    return [{
      id: `reviewed-human-${key}`,
      src: reviewedNarration.url,
      text,
      chunkIndexes: chunks.map((_, index) => index),
      chunkMap
    }];
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
    const humanPlaylist = reviewedNarrationPlaylist(chunks);
    const playlist = humanPlaylist.length ? humanPlaylist : localAvaPlaylist(chunks);
    service.setAudioPlaylist(playlist);
    return playlist;
  };

  // The next module stays a low-priority browser prefetch. It starts only
  // when the current page is idle, so it cannot delay the recording that the
  // learner can play right now.
  const currentNarrationPreloads = new Set();
  const preloadCurrentNarrationSources = (sources) => {
    if (typeof document === 'undefined') return;
    (Array.isArray(sources) ? sources : [])
      .filter((source) => typeof source === 'string' && source)
      .filter((source) => !currentNarrationPreloads.has(source))
      .forEach((source) => {
        currentNarrationPreloads.add(source);
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'audio';
        link.href = source;
        link.dataset.type2learnNarrationPreload = 'true';
        document.head.append(link);
      });
  };
  const scheduledNarrationPrefetches = new Set();
  const moduleUrduReadingSources = (audioKey) => [
    'title-ava.mp3',
    ...Array.from({ length: 5 }, (_, index) => [
      'section-' + (index + 1) + '-heading-ava.mp3',
      'section-' + (index + 1) + '-answer-ava.mp3'
    ]).flat()
  ].map((filename) => urduReadingAudioSource(audioKey, filename));

  const preloadNextModuleNarration = () => {
    const nextAudioKey = COURSE_AUDIO_MODULE_KEYS[displayedModuleIndex() + 1];
    const nextAssets = COURSE_AUDIO_MANIFEST.modules?.[nextAudioKey];
    const sources = [
      nextAssets?.read,
      nextAssets?.simpleAddon,
      ...(courseUsesUrdu() && nextAudioKey ? moduleUrduReadingSources(nextAudioKey) : [])
    ]
      .filter((source) => typeof source === 'string' && source)
      .filter((source) => !scheduledNarrationPrefetches.has(source));
    if (!sources.length || typeof document === 'undefined') return;
    sources.forEach((source) => scheduledNarrationPrefetches.add(source));
    const warm = () => sources.forEach((source) => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'audio';
      link.href = source;
      link.dataset.type2learnNextNarration = 'true';
      document.head.append(link);
    });
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(warm, { timeout: 2500 });
    else window.setTimeout(warm, 800);
  };

  const narrationSectionValue = (value) => Array.isArray(value) ? value.join('; ') + '.' : String(value || '').trim();

  const urduReadingAudioSource = (audioKey, filename) => '/course/audio/edge-ava/neurodivergent/'
    + encodeURIComponent(audioKey) + '/urdu-pk/' + encodeURIComponent(filename);

  const taskNarrationReadingChunks = () => {
    const step = currentStep();
    const sections = visibleReadingSections();
    const useUrdu = courseUsesUrdu();
    if (!useUrdu) {
      const chunks = [{ id: 'task-title', label: step.title, text: step.title }];
      sections.forEach((section, index) => {
        const answer = narrationSectionValue(section.value);
        if (section.heading) chunks.push({ id: 'task-question-' + index, label: section.heading, text: section.heading });
        if (answer) chunks.push({ id: 'task-answer-' + index, label: section.heading || 'Lesson answer', text: answer });
      });
      return chunks.filter((chunk) => chunk.text);
    }

    // Urdu mode mirrors the visible lesson: it narrates Urdu only. The
    // numbered recordings match the authored section order.
    const translation = urduStep() || {};
    const chunks = [
      { id: 'task-title-ur', label: translation.title || '', text: translation.title || '', audioLanguage: 'ur', urduAudioFile: 'title-ava.mp3' }
    ];
    sections.forEach((section, visibleIndex) => {
      // `readingSections()` returns fresh objects on every call. Keep the
      // authored index on the object instead of using object identity, which
      // otherwise made every rendered section select section 1's Urdu clip.
      const sourceIndex = Math.max(0, Number(section.sourceIndex) || 0);
      const urduHeading = section.urduHeading || section.heading;
      const urduAnswer = narrationSectionValue(section.urduValue);
      const prefix = 'section-' + (sourceIndex + 1);
      if (urduHeading) chunks.push({ id: 'task-question-ur-' + visibleIndex, label: urduHeading, text: urduHeading, audioLanguage: 'ur', urduAudioFile: prefix + '-heading-ava.mp3' });
      if (urduAnswer) chunks.push({ id: 'task-answer-ur-' + visibleIndex, label: urduHeading || 'Lesson answer', text: urduAnswer, audioLanguage: 'ur', urduAudioFile: prefix + '-answer-ava.mp3' });
    });
    return chunks.filter((chunk) => chunk.text);
  };

  const taskNarrationReadingPlaylist = (chunks) => {
    if (!chunks.length) return [];
    const humanPlaylist = reviewedNarrationPlaylist(chunks);
    if (humanPlaylist.length) return humanPlaylist;
    if (!usesLocalAvaNarration()) return [];
    const audioKey = COURSE_AUDIO_MODULE_KEYS[displayedModuleIndex()];
    const assets = COURSE_AUDIO_MANIFEST.modules?.[audioKey];
    const step = currentStep();
    if (!assets?.read || !step) return [];

    const source = [step.title, ...sourceReadSections(step)].filter(Boolean).join(' ');
    const lowerSource = source.toLocaleLowerCase();
    const playlist = [];
    let sourceCursor = 0;
    const findSource = (text) => {
      const value = String(text || '').trim();
      if (!value) return -1;
      const exact = source.indexOf(value, sourceCursor);
      if (exact >= 0) return exact;
      return lowerSource.indexOf(value.toLocaleLowerCase(), sourceCursor);
    };
    const addAvaExcerpt = (chunkIndex, text) => {
      const sourceStart = findSource(text);
      if (sourceStart < 0) return false;
      const sourceEnd = sourceStart + String(text).length;
      playlist.push({
        id: 'ava-' + chunkIndex,
        src: assets.read,
        text: source,
        chunkIndexes: [chunkIndex],
        chunkMap: [{ index: chunkIndex, sourceStart, sourceEnd }],
        wordCues: assets.readCues,
        stopAtSourceChar: sourceEnd,
        advanceOnStop: true
      });
      sourceCursor = sourceEnd;
      return true;
    };

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      if (chunk.audioLanguage === 'ur') {
        if (!chunk.urduAudioFile) return [];
        const src = urduReadingAudioSource(audioKey, chunk.urduAudioFile);
        playlist.push({
          id: 'urdu-' + index,
          src,
          text: chunk.text,
          chunkIndexes: [index],
          chunkMap: [{ index, sourceStart: 0, sourceEnd: Math.max(1, chunk.text.length) }],
          advanceOnStop: true
        });
      } else if (!addAvaExcerpt(index, chunk.text)) return [];
    }
    return playlist;
  };

  const taskNarrationGenericChunks = () => {
    const step = courseUsesUrdu() ? (urduStep() || currentStep()) : currentStep();
    const check = step.check || {};
    const optionText = (option) => Array.isArray(option) ? option[0] : option;
    const englishPracticeChoices = [
      practiceSupport(),
      'Assume one support will work for everyone.',
      'Make the learner explain or prove a diagnosis before offering support.',
      'Withhold support until the learner finishes the task alone.'
    ];
    const urduContent = urduStep()?.content || {};
    const urduPracticeChoices = [
      urduContent.supports?.[0],
      'یہ فرض کر لیں کہ ایک مدد سب کے لیے کارآمد ہو گی۔',
      'مدد دینے سے پہلے سیکھنے والے سے تشخیص سمجھانے یا ثابت کرنے کا مطالبہ کریں۔',
      'اس وقت تک مدد روک لیں جب تک سیکھنے والا اکیلے کام مکمل نہ کرے۔'
    ];
    if (state.progress.phase === 'preview') return [{
      id: 'preview',
      label: taskLabel(),
      text: courseUsesUrdu()
        ? ('«' + (urduStep()?.title || step.title) + '» کے بارے میں ایک باعزت خیال کو سمجھیں اور اسے ایک مختصر صورتحال میں استعمال کریں۔')
        : ('Understand one respectful idea from “' + currentStep().title + '” and use it in a small situation.')
    }];
    if (state.progress.phase === 'check') return [{ id: 'question', label: 'Question', text: [check.question, ...(check.options || []).map(optionText)].filter(Boolean).join('. ') }];
    if (state.progress.phase === 'apply') return [{
      id: 'practice',
      label: courseUi('Practice question', 'عملی مشق'),
      text: [
        courseUi('Which response best uses the idea from this module?', 'کون سا ردِعمل اس ماڈیول کے خیال کو سب سے بہتر استعمال کرتا ہے؟'),
        ...(courseUsesUrdu() ? urduPracticeChoices : englishPracticeChoices)
      ].filter(Boolean).join('. ')
    }];
    if (state.progress.phase === 'exam-intro') {
      const exam = courseUsesUrdu() ? (COURSE_URDU.finalExam || finalExam()) : finalExam();
      return [{ id: 'final-exam-intro', label: exam.title, text: [exam.title, exam.description].filter(Boolean).join('. ') }];
    }
    if (state.progress.phase === 'exam') {
      const question = courseUsesUrdu() ? (COURSE_URDU.finalExam?.questions || [])[state.progress.finalExam.questionIndex] : currentFinalExamQuestion();
      return question ? [{ id: 'final-exam-question', label: 'Final exam question', text: [question.question, ...(question.options || []).map(optionText)].filter(Boolean).join('. ') }] : [];
    }
    if (state.progress.phase === 'exam-results') return [{ id: 'final-exam-results', label: 'Final exam results', text: courseUi('Your final exam results and question-by-question review are available on this page.', 'آپ کے آخری امتحان کے نتائج اور ہر سوال کا جائزہ اس صفحے پر موجود ہے۔') }];
    if (state.progress.phase === 'complete') return [{
      id: 'complete',
      label: courseUi('Completion', 'تکمیل'),
      text: courseUi(
        'One small step is complete. Your progress is saved. You can come back whenever you are ready, or continue to the next short step.',
        'ایک مختصر مرحلہ مکمل ہو گیا ہے۔ آپ کی پیش رفت محفوظ ہے۔ جب تیار ہوں واپس آ سکتے ہیں یا اگلے مختصر مرحلے پر جا سکتے ہیں۔'
      )
    }];
    return [{ id: 'task', label: taskLabel(), text: [step.title, step.objective || step.hint || step.simple].filter(Boolean).join('. ') }];
  };

  const TYPING_TTS_ROOT = '/assets/audio/typing-tts/';
  const typingTtsSource = (voice, folder, filename) => TYPING_TTS_ROOT
    + encodeURIComponent(voice === 'target' ? 'Male 1' : 'Female 1') + '/'
    + (folder ? encodeURIComponent(folder) + '/' : '')
    + encodeURIComponent(filename);

  const typingCharacterClip = (voice, character) => {
    const value = String(character || '');
    const upper = value.toUpperCase();
    if (/^[A-Z]$/.test(upper)) return typingTtsSource(voice, 'Alphabets', upper + '.mp3');
    const names = {
      '0': ['zero.mp3', 'Zero.mp3'], '1': ['one.mp3', 'One.mp3'], '2': ['two.mp3', 'Two.mp3'],
      '3': ['three.mp3', 'Three.mp3'], '4': ['four.mp3', 'Four.mp3'], '5': ['five.mp3', 'Five.mp3'],
      '6': ['six.mp3', 'Six.mp3'], '7': ['seven.mp3', 'Seven.mp3'], '8': ['eight.mp3', 'Eight.mp3'],
      '9': ['nine.mp3', 'Nine.mp3'], ' ': ['space.mp3', 'Space.mp3'], ',': ['comma.mp3', 'Comma.mp3'],
      '-': ['dash.mp3', 'Dash.mp3'], '.': ['Full stop.mp3', 'Full Stop.mp3'], '?': ['question mark.mp3', 'Question Mark.mp3'],
      '!': ['Exclamation Mark.mp3', 'Exclamation Mark.mp3'], ';': ['semi colon.mp3', 'Semi Colon.mp3']
    };
    const filenames = names[value];
    return filenames ? typingTtsSource(voice, 'Words', filenames[voice === 'target' ? 0 : 1]) : '';
  };

  const TYPING_GUIDANCE_ROOT = TYPING_TTS_ROOT + 'guidance/';
  const typingGuidanceClip = (name) => TYPING_GUIDANCE_ROOT
    + encodeURIComponent(name + '-' + (courseUsesUrdu() ? 'ur' : 'en') + '.mp3');
  const typingGuidanceIntroSources = () => [
    typingGuidanceClip('male-instruction'),
    typingGuidanceClip('click-inside-box')
  ];

  const typingGuidanceAssetSources = () => {
    const referenceCharacters = [...new Set(Array.from(activeTypingReference() || ''))];
    return [...new Set([
      ...typingGuidanceIntroSources(),
      ...referenceCharacters.map((character) => typingCharacterClip('target', character))
    ].filter(Boolean))];
  };

  // A normal narration playlist cannot wait for, react to, or correct an
  // individual keystroke. This controller uses only the target voice and
  // keeps every prompt on one audio channel, so no clips can overlap.
  const typingAudioNarrationPlan = () => ({ chunks: [], playlist: [], sources: typingGuidanceAssetSources() });

  const clearTypingGuidanceTimers = () => {
    if (typingGuidance.repeatTimer !== null) window.clearTimeout(typingGuidance.repeatTimer);
    if (typingGuidance.fastTimer !== null) window.clearTimeout(typingGuidance.fastTimer);
    typingGuidance.repeatTimer = null;
    typingGuidance.fastTimer = null;
  };

  const stopTypingGuidanceAudio = () => {
    typingGuidance.audioToken += 1;
    const audio = typingGuidance.audio;
    typingGuidance.audio = null;
    typingGuidance.currentRole = '';
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    try { audio.pause?.(); } catch (_) { /* Best-effort audio cleanup. */ }
    try { audio.removeAttribute?.('src'); } catch (_) { /* Best-effort audio cleanup. */ }
    try { audio.load?.(); } catch (_) { /* Best-effort audio cleanup. */ }
  };

  const finishTypingGuidance = () => {
    clearTypingGuidanceTimers();
    stopTypingGuidanceAudio();
    typingGuidance.active = false;
    typingGuidance.paused = false;
    typingGuidance.phase = 'finished';
    syncTaskNarrationControl();
  };

  const stopTypingGuidance = () => {
    clearTypingGuidanceTimers();
    stopTypingGuidanceAudio();
    typingGuidance.active = false;
    typingGuidance.paused = false;
    typingGuidance.phase = 'idle';
    typingGuidance.fastMode = false;
    typingGuidance.lastInputAt = 0;
    typingGuidance.lastValue = '';
  };

  const typingGuidanceInputIsFocused = () => document.activeElement?.matches?.('[data-typing-input]');

  const playTypingGuidanceSource = (source, role, after = () => {}) => {
    if (!typingGuidance.active || typingGuidance.paused || !source || typeof window.Audio !== 'function') {
      after();
      return;
    }
    stopTypingGuidanceAudio();
    const token = ++typingGuidance.audioToken;
    const audio = new window.Audio();
    let settled = false;
    const complete = () => {
      if (settled || token !== typingGuidance.audioToken) return;
      settled = true;
      typingGuidance.audio = null;
      typingGuidance.currentRole = '';
      after();
    };
    audio.preload = 'auto';
    audio.src = source;
    audio.volume = Math.min(1, Math.max(0, Number(state.preferences.narrationVolume) || 1));
    audio.playbackRate = Math.min(1.25, Math.max(0.85, Number(state.preferences.narrationSpeed) || 1));
    audio.onended = complete;
    audio.onerror = complete;
    typingGuidance.audio = audio;
    typingGuidance.currentRole = role;
    Promise.resolve(audio.play()).catch(complete);
    syncTaskNarrationControl();
  };

  const nextSpeakableTypingIndex = (fromIndex) => {
    const reference = Array.from(activeTypingReference() || '');
    for (let index = Math.max(0, Number(fromIndex) || 0); index < reference.length; index += 1) {
      if (typingCharacterClip('target', reference[index])) return index;
    }
    return -1;
  };

  const promptExpectedTypingCharacter = (fromIndex, repeatCount = 0) => {
    if (!typingGuidance.active || typingGuidance.paused || !typingGuidanceInputIsFocused()) return;
    const index = nextSpeakableTypingIndex(fromIndex);
    if (index < 0) {
      finishTypingGuidance();
      return;
    }
    const responseAtPrompt = state.progress.attempt.response || '';
    const source = typingCharacterClip('target', Array.from(activeTypingReference() || '')[index]);
    typingGuidance.expectedIndex = index;
    typingGuidance.phase = 'prompting';
    playTypingGuidanceSource(source, 'target', () => {
      if (!typingGuidance.active || typingGuidance.paused || typingGuidance.fastMode) return;
      if (!typingGuidanceInputIsFocused() || typingGuidance.expectedIndex !== index || (state.progress.attempt.response || '') !== responseAtPrompt) return;
      if (repeatCount >= 3) {
        finishTypingGuidance();
        return;
      }
      typingGuidance.phase = 'waiting';
      typingGuidance.repeatTimer = window.setTimeout(() => promptExpectedTypingCharacter(index, repeatCount + 1), 2000);
      syncTaskNarrationControl();
    });
  };

  const resumeTypingGuidance = () => {
    if (!typingGuidance.active) return;
    typingGuidance.paused = false;
    if (typingGuidance.audio) {
      Promise.resolve(typingGuidance.audio.play()).catch(() => finishTypingGuidance());
    } else if (typingGuidanceInputIsFocused()) {
      promptExpectedTypingCharacter(Array.from(state.progress.attempt.response || '').length);
    } else {
      typingGuidance.phase = 'waiting';
    }
    syncTaskNarrationControl();
  };

  const pauseTypingGuidance = () => {
    if (!typingGuidance.active) return;
    clearTypingGuidanceTimers();
    typingGuidance.paused = true;
    try { typingGuidance.audio?.pause?.(); } catch (_) { /* Best-effort pause. */ }
    syncTaskNarrationControl();
  };

  const startTypingGuidance = () => {
    const service = ensureNarrationService();
    stopTypingGuidance();
    service.stop({ silent: true });
    const sources = typingGuidanceAssetSources();
    preloadCurrentNarrationSources(sources);
    service.preloadAudioSources?.(sources);
    typingGuidance.active = true;
    typingGuidance.paused = false;
    typingGuidance.phase = 'intro';
    typingGuidance.lastValue = state.progress.attempt.response || '';
    typingGuidance.expectedIndex = Array.from(typingGuidance.lastValue).length;
    const intro = typingGuidanceIntroSources();
    let introIndex = 0;
    const playNextIntro = () => {
      if (!typingGuidance.active || typingGuidance.paused) return;
      const source = intro[introIndex++];
      if (source) {
        playTypingGuidanceSource(source, 'target', playNextIntro);
        return;
      }
      typingGuidance.phase = 'waiting';
      syncTaskNarrationControl();
      if (typingGuidanceInputIsFocused()) promptExpectedTypingCharacter(typingGuidance.expectedIndex);
    };
    playNextIntro();
  };

  const toggleTypingGuidance = () => {
    if (!typingGuidance.active) {
      startTypingGuidance();
      return;
    }
    if (typingGuidance.paused) resumeTypingGuidance();
    else pauseTypingGuidance();
  };

  const handleTypingGuidanceInput = (nextValue) => {
    if (!typingGuidance.active || typingGuidance.paused || typingGuidance.phase === 'intro') {
      typingGuidance.lastValue = nextValue;
      return;
    }
    const now = Date.now();
    const interval = typingGuidance.lastInputAt ? now - typingGuidance.lastInputAt : Number.POSITIVE_INFINITY;
    typingGuidance.lastInputAt = now;
    if (interval < 600) typingGuidance.fastMode = true;
    if (typingGuidance.fastTimer !== null) window.clearTimeout(typingGuidance.fastTimer);
    typingGuidance.fastTimer = window.setTimeout(() => { typingGuidance.fastMode = false; }, 1250);
    const previous = Array.from(typingGuidance.lastValue || '');
    const response = Array.from(nextValue || '');
    typingGuidance.lastValue = nextValue;
    if (typingGuidance.repeatTimer !== null) window.clearTimeout(typingGuidance.repeatTimer);
    typingGuidance.repeatTimer = null;

    if (response.length < previous.length) {
      stopTypingGuidanceAudio();
      typingGuidance.expectedIndex = response.length;
      typingGuidance.phase = 'waiting';
      if (typingGuidanceInputIsFocused()) window.setTimeout(() => promptExpectedTypingCharacter(response.length), 120);
      return;
    }
    if (response.length <= previous.length) return;

    const insertedCharacters = response.slice(previous.length);
    const referenceCharacters = Array.from(activeTypingReference() || '');
    const firstMismatchOffset = insertedCharacters.findIndex((character, offset) => character !== referenceCharacters[previous.length + offset]);
    const character = response[response.length - 1];
    const position = response.length - 1;
    const expected = referenceCharacters[position];
    const correct = character === expected;

    // Any incoming character invalidates a prompt for the previous position.
    // This lets a learner move past an ignored typo instead of getting stuck.
    if (typingGuidance.currentRole === 'target') stopTypingGuidanceAudio();

    if (insertedCharacters.length > 1) typingGuidance.fastMode = true;
    if (typingGuidance.fastMode) {
      // Fast input commonly arrives as a single `input` event containing a
      // burst of characters. Advance through the burst deterministically and
      // cue only the first mismatch; never leave the narrator waiting on an
      // already-correct character.
      const mismatchPosition = firstMismatchOffset < 0 ? -1 : previous.length + firstMismatchOffset;
      typingGuidance.expectedIndex = mismatchPosition >= 0 ? mismatchPosition : response.length;
      if (mismatchPosition >= 0) {
        stopTypingGuidanceAudio();
        typingGuidance.phase = 'correction';
        playTypingGuidanceSource(typingCharacterClip('target', referenceCharacters[mismatchPosition]), 'target', () => {
          if (typingGuidance.active && !typingGuidance.paused) {
            typingGuidance.phase = 'waiting';
            syncTaskNarrationControl();
          }
        });
      } else {
        typingGuidance.phase = 'waiting';
        syncTaskNarrationControl();
      }
      return;
    }

    stopTypingGuidanceAudio();
    typingGuidance.expectedIndex = correct ? position + 1 : position;
    typingGuidance.phase = 'waiting';
    // Do not narrate what the learner typed. A brief hand-off keeps the next
    // target letter clear without making normal typing feel delayed.
    window.setTimeout(() => {
      if (!typingGuidance.active || typingGuidance.paused) return;
      if ((state.progress.attempt.response || '') !== nextValue) return;
      promptExpectedTypingCharacter(typingGuidance.expectedIndex);
    }, 120);
  };

  const taskNarrationPlan = () => {
    if (state.progress.phase === 'type') return typingAudioNarrationPlan();
    const readingTask = state.progress.phase === 'read' || isReviewingModule();
    const language = courseUsesUrdu() ? 'ur' : 'en';
    const chunks = (readingTask ? taskNarrationReadingChunks() : taskNarrationGenericChunks())
      .map((chunk) => ({ ...chunk, lang: chunk.lang || chunk.audioLanguage || language }));
    return { chunks, playlist: readingTask ? taskNarrationReadingPlaylist(chunks) : [] };
  };

  const syncTaskNarrationControl = () => {
    const control = app.querySelector('[data-task-narration-control]');
    if (!control) return;
    const status = taskNarrationStatus();
    const copy = taskNarrationControlCopy();
    control.disabled = status === 'unsupported';
    control.setAttribute('aria-label', copy);
    control.innerHTML = '<span aria-hidden="true">' + (status === 'playing' ? 'Ⅱ' : '▶') + '</span>' + escapeHtml(copy);
  };

  const clearTaskNarrationPrelude = () => {
    if (taskNarration.preludeTimer !== null) window.clearTimeout(taskNarration.preludeTimer);
    taskNarration.preludeTimer = null;
    taskNarration.preludeActive = false;
    taskNarration.preludePaused = false;
    taskNarration.preludeContinue = null;
  };

  const stopTaskNarration = ({ silent = true } = {}) => {
    taskNarration.session += 1;
    clearTaskNarrationPrelude();
    stopTypingGuidance();
    try { window.speechSynthesis?.cancel?.(); } catch (_) { /* Best-effort cancellation. */ }
    narration.service?.stop({ silent });
    narration.activeIndex = -1;
    narration.activeRange = null;
    if (silent) narration.status = 'idle';
    syncTaskNarrationControl();
  };

  const startTaskNarration = async () => {
    if (!taskNarrationIsAvailable()) return;
    if (state.progress.phase === 'type') {
      toggleTypingGuidance();
      return;
    }
    const service = ensureNarrationService();
    if (taskNarration.preludeActive) {
      try {
        if (taskNarration.preludePaused) {
          window.speechSynthesis?.resume?.();
          taskNarration.preludePaused = false;
          taskNarration.preludeTimer = window.setTimeout(() => taskNarration.preludeContinue?.(), 6500);
        } else {
          window.speechSynthesis?.pause?.();
          taskNarration.preludePaused = true;
          if (taskNarration.preludeTimer !== null) window.clearTimeout(taskNarration.preludeTimer);
          taskNarration.preludeTimer = null;
        }
        syncTaskNarrationControl();
        return;
      } catch (_) {
        // Continue into the recorded lesson if a browser cannot pause its cue.
      }
    }
    if (narration.status === 'playing') {
      service.pause();
      return;
    }
    if (narration.status === 'paused') {
      service.start();
      return;
    }
    if (state.progress.phase === 'read' || isReviewingModule()) await ensureReviewedNarrationForCurrentTask();
    const plan = taskNarrationPlan();
    if (!plan.chunks.length) {
      announce(courseUi('There is no audio summary for this step yet.', 'اس مرحلے کے لیے ابھی آڈیو خلاصہ موجود نہیں ہے۔'));
      return;
    }
    service.configure({
      rate: Math.min(1, Number(state.preferences.narrationSpeed) || 1),
      voiceURI: effectiveNarrationVoice(),
      volume: Number(state.preferences.narrationVolume)
    });
    narration.chunks = plan.chunks;
    narration.activeIndex = -1;
    narration.activeRange = null;
    service.setChunks(plan.chunks);
    service.setAudioPlaylist(plan.playlist);

    // Do not bridge a slow recording with the browser's synthetic voice. The
    // included Ava recording is intentionally the only course narration voice.
    clearTaskNarrationPrelude();
    service.start(0);
    syncTaskNarrationControl();
    return;

    /* Legacy browser-speech prelude retained as a rollback reference.
    const session = ++taskNarration.session;
    let lessonStarted = false;
    const beginLesson = () => {
      if (lessonStarted || session !== taskNarration.session) return;
      lessonStarted = true;
      clearTaskNarrationPrelude();
      service.start(0);
      syncTaskNarrationControl();
    };
    taskNarration.preludeContinue = beginLesson;
    const canSkipTask = canSkipCurrentTask();
    const prelude = courseUi(
      COURSE.title + (canSkipTask ? '. You can skip this step.' : '.'),
      COURSE_URDU.title + (canSkipTask ? '۔ آپ اس مرحلے کو چھوڑ سکتے ہیں۔' : '۔')
    );
    const canSpeakPrelude = typeof window.SpeechSynthesisUtterance === 'function' && window.speechSynthesis;
    if (!canSpeakPrelude) {
      beginLesson();
      return;
    }
    clearTaskNarrationPrelude();
    taskNarration.preludeActive = true;
    taskNarration.preludePaused = false;
    const utterance = new SpeechSynthesisUtterance(prelude);
    utterance.rate = 0.9;
    utterance.volume = Number(state.preferences.narrationVolume);
    utterance.lang = courseUsesUrdu() ? 'ur' : 'en';
    const preludeVoice = service.voices.find((voice) => String(voice.lang || '').toLowerCase().startsWith(utterance.lang));
    if (preludeVoice) utterance.voice = preludeVoice;
    utterance.onend = beginLesson;
    utterance.onerror = beginLesson;
    // Some browser engines never resolve a speech cue. The real course audio
    // must still begin rather than leaving the learner on a paused-looking UI.
    taskNarration.preludeTimer = window.setTimeout(beginLesson, 6500);
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (_) {
      beginLesson();
    }
    syncTaskNarrationControl();
    */
  };

  const narrationVoiceOptions = () => hasLocalAvaNarration()
    ? '<option value="' + LOCAL_AVA_VOICE_URI + '">Microsoft Edge Ava (included)</option>'
    : '';

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
    const sections = visibleReadingSections().map(({ heading, value, urduHeading, urduValue }) => {
      const title = bilingualReadingTextMarkup('h3', heading || 'Key idea', urduHeading, narrationState);
      const content = Array.isArray(value)
        ? '<ul class="course-reading-list">' + value.map((item, index) => bilingualReadingTextMarkup('li', item, Array.isArray(urduValue) ? urduValue[index] : '', narrationState)).join('') + '</ul>'
        : bilingualReadingTextMarkup('p', value, urduValue, narrationState);
      return '<section class="course-reading-section">' + title + content + '</section>';
    });
    if (shouldShowSimple()) {
      // Put the authored plain-language version first so enabling this support
      // changes what the learner encounters immediately instead of placing the
      // simpler wording after a long detailed explanation.
      const translation = urduStep();
      sections.unshift('<section class="course-simple-copy">' + bilingualReadingTextMarkup('strong', 'A simpler way to say it', 'یہ بات آسان طریقے سے', narrationState) + bilingualReadingTextMarkup('p', currentStep().simple, translation?.simple, narrationState) + '</section>');
    }
    if (shouldShowExample()) {
      sections.push(exampleCardsMarkup(narrationState));
    }
    if (state.preferences.recap && currentStep().simple && !shouldShowSimple()) {
      const translation = urduStep();
      sections.push('<aside class="course-recap"><strong>' + bilingualCopy('Quick recap', 'مختصر خلاصہ') + '</strong><p>' + bilingualCopy(currentStep().simple, translation?.simple) + '</p></aside>');
    }
    return sections.join('');
  };

  const previewTask = () => {
    const urdu = urduStep();
    const initiation = taskInitiationMarkup({ active: adaptiveLearning.taskInitiation, escapeHtml, courseUi });
    const reviewed = usesReviewedManifest();
    return '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">' + bilingualCopy('Preview', 'پیش نظارہ') + '</p><h2 id="course-task-heading" tabindex="-1">' + bilingualCopy('See the path before you begin', 'شروع کرنے سے پہلے راستہ دیکھیں') + '</h2><p>' + bilingualCopy(reviewed ? 'This reviewed step contains reading, one complete lesson section at a time to type, and a protected quick check.' : 'This step contains reading, one complete lesson section at a time to type, a quick check, and one adapted practice activity.', reviewed ? 'اس منظور شدہ مرحلے میں پڑھنا، ایک وقت میں سبق کے ایک مکمل حصے کی ٹائپنگ اور ایک محفوظ فوری جانچ شامل ہے۔' : 'اس مرحلے میں پڑھنا، ایک وقت میں سبق کے ایک مکمل حصے کی ٹائپنگ، ایک فوری جانچ اور ایک عملی مشق شامل ہے۔') + '</p></div>' + taskHeaderControls() + '</div>' + initiation + '<div class="course-reading-copy"><section class="course-reading-section"><h3>' + bilingualCopy('Objective', 'مقصد') + '</h3><p>' + bilingualCopy('Understand one respectful idea from “' + currentStep().title + '” and use it in a small situation.', '«' + (urdu?.title || currentStep().title) + '» کے بارے میں ایک باعزت خیال کو سمجھیں اور اسے ایک مختصر صورتحال میں استعمال کریں۔') + '</p></section><section class="course-reading-section"><h3>' + bilingualCopy('What stays in your control', 'کیا چیز آپ کے اختیار میں رہتی ہے') + '</h3><p>' + bilingualCopy('You can pause, use support controls, use your usual compatible input tools, or ask for help. There are no countdown timers, speed scores, or autoplay audio.', 'آپ وقفہ کر سکتے ہیں، مدد کے کنٹرول استعمال کر سکتے ہیں، اپنے معمول کے موافق اِن پٹ ٹولز استعمال کریں یا مدد مانگ سکتے ہیں۔ یہاں کوئی الٹی گنتی، رفتار کا اسکور یا خودکار آواز نہیں ہے۔') + '</p></section><section class="course-reading-section"><h3>' + bilingualCopy('Completion', 'تکمیل') + '</h3><p>' + bilingualCopy(reviewed ? 'Read, type each lesson section one at a time, and check understanding with a reviewed course question.' : 'Read, type each lesson section one at a time, check understanding, and choose a practical response.', reviewed ? 'پڑھیں، سبق کے ہر حصے کو ایک وقت میں ایک ٹائپ کریں، اور منظور شدہ کورس کے سوال کے ذریعے سمجھ جانچیں۔' : 'پڑھیں، سبق کے ہر حصے کو ایک وقت میں ایک ٹائپ کریں، سمجھ جانچیں اور ایک عملی ردِعمل منتخب کریں۔') + '</p></section></div><div class="course-task-actions"><button class="course-primary-button" type="button" data-action="preview-complete">' + courseUi('Begin this small step', 'یہ مختصر مرحلہ شروع کریں') + ' <span aria-hidden="true">→</span></button></div></article>';
  };

  const readTask = () => '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">' + bilingualCopy('Learn', 'سیکھیں') + '</p><h2 id="course-task-heading" tabindex="-1">' + bilingualCopy('Read this short explanation', 'یہ مختصر وضاحت پڑھیں') + '</h2><p>' + bilingualCopy(smallerSectionsAreActive() ? 'Read one small section at a time. You decide when to move to the next part.' : 'Read at your own pace. Move on when the explanation feels clear enough.', smallerSectionsAreActive() ? 'ایک وقت میں ایک چھوٹا حصہ پڑھیں۔ اگلے حصے پر کب جانا ہے، یہ آپ طے کریں۔' : 'اپنی رفتار سے پڑھیں۔ جب وضاحت کافی واضح لگے تو آگے بڑھیں۔') + '</p></div>' + taskHeaderControls() + '</div>' + readingSectionProgress() + '<div class="course-reading-copy" data-structured="true">' + readingContentMarkup(false) + '</div><div class="course-task-actions">' + readingTaskActions() + '</div></article>';

  const readTaskWithTextToSpeech = () => '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">' + bilingualCopy('Learn', 'سیکھیں') + '</p><h2 id="course-task-heading" tabindex="-1">' + bilingualCopy('Read this short explanation', 'یہ مختصر وضاحت پڑھیں') + '</h2><p>' + bilingualCopy('Text to speech mode is on. Click or tap inside the text where you want it to begin, or focus a text part and press Enter or Space. The current word is highlighted as it is read.', 'متن کو آواز میں پڑھنے کا موڈ فعال ہے۔ متن میں جہاں سے شروع کرنا ہو وہاں کلک یا ٹیپ کریں، یا متن کے حصے پر فوکس کر کے Enter یا Space دبائیں۔ پڑھتے وقت موجودہ لفظ نمایاں ہوتا ہے۔') + '</p></div>' + taskHeaderControls() + '</div>' + readingSectionProgress() + '<div class="course-reading-copy course-tts-reading" data-narration-content data-structured="true">' + readingContentMarkup(true) + '</div><div class="course-task-actions">' + readingTaskActions() + '</div></article>';

  const reviewModuleTask = () => {
    const urdu = urduStep();
    const returnToCheck = understandingCheck.run?.status === 'complete'
      && Number(understandingCheck.run?.reviewModuleIndex) === displayedModuleIndex()
      ? '<button class="course-secondary-button" type="button" data-action="return-to-understanding-check">' + courseUi('Return to saved understanding check', 'محفوظ سمجھ جانچ پر واپس جائیں') + '</button>'
      : '';
    return '<article class="course-task-card course-review-card"><div class="course-task-top"><div><p class="course-task-label">' + bilingualCopy('Completed module review', 'مکمل ماڈیول کا جائزہ') + '</p><h2 id="course-task-heading" tabindex="-1">' + bilingualCopy(currentStep().title, urdu?.title) + '</h2><p>' + bilingualCopy('You are reviewing a completed module. Your current task is still saved and will be ready when you return.', 'آپ مکمل ماڈیول کا جائزہ لے رہے ہیں۔ آپ کا موجودہ کام محفوظ ہے اور واپسی پر تیار ہوگا۔') + '</p></div>' + taskHeaderControls() + '</div><div class="course-reading-copy" data-structured="true">' + readingContentMarkup(false) + '</div><div class="course-task-actions">' + returnToCheck + '<button class="course-primary-button" type="button" data-action="return-from-module-review">' + courseUi('Return to current task', 'موجودہ کام پر واپس جائیں') + ' <span aria-hidden="true">→</span></button></div></article>';
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
      return inputMethodSelector() + '<div class="guided-typing lesson-section-typing"><span>' + escapeHtml(courseUi('Section ' + (index + 1) + ' of ' + total, 'حصہ ' + (index + 1) + ' از ' + total)) + '</span><p class="typing-target" lang="en" dir="ltr">' + escapeHtml(section.text) + '</p></div>';
    }
    if (typing.level !== 'Guided typing') return inputMethodSelector() + '<p class="typing-target" lang="en" dir="ltr">' + escapeHtml(typing.target || '') + '</p>';
    const phraseIndex = Math.min(state.progress.attempt.guidedIndex, typing.phrases.length - 1);
    return inputMethodSelector() + '<div class="guided-typing"><span>' + escapeHtml(courseUi('Phrase ' + (phraseIndex + 1) + ' of ' + typing.phrases.length, 'جملہ ' + (phraseIndex + 1) + ' از ' + typing.phrases.length)) + '</span><p class="typing-target" lang="en" dir="ltr">' + escapeHtml(typing.phrases[phraseIndex]) + '</p></div>';
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

  const adaptiveFallback = (barrier = '', response = '', previousResponse = '') => {
    const urdu = courseUsesUrdu();
    const words = String(response || '').trim().split(/\s+/).filter(Boolean);
    const previousWords = String(previousResponse || '').trim().split(/\s+/).filter(Boolean);
    const section = usesLessonSectionTyping() ? activeLessonTypingSection()?.section?.heading : '';
    const focus = section || currentStep().title || (urdu ? 'موجودہ خیال' : 'the current idea');
    const started = words.length > 0;
    const changed = started && previousWords.length > 0 && String(response).trim() !== String(previousResponse).trim();
    const next = {
      instruction: urdu ? 'صرف موجودہ ہدایت کا پہلا حصہ دیکھیں۔' : 'Look at only the first part of the current instruction.',
      'too-large': urdu ? 'ایک جملے یا ایک خیال سے آغاز کریں۔' : 'Start with one sentence or one idea.',
      'difficult-words': urdu ? 'کلیدی خیال تلاش کریں؛ ہر مشکل لفظ حل کرنا ضروری نہیں۔' : 'Look for the key idea; you do not need every difficult word.',
      starting: urdu ? 'اس جملے سے شروع کر سکتے ہیں: “اہم خیال یہ ہے کہ…”' : 'You can begin with: “The main idea is that…”',
      'too-much-on-screen': urdu ? 'صرف موجودہ عنوان اور اس کے نیچے متن کو دیکھیں۔' : 'Look only at the current heading and the text beneath it.',
      'worried-about-wrong': urdu ? 'اپنا پہلا خیال لکھیں؛ بعد میں اسے بدل سکتے ہیں۔' : 'Write a first thought; you can change it afterwards.'
    }[barrier] || (urdu ? 'اپنے الفاظ میں ایک مرکزی خیال بیان کریں۔' : 'Name one main idea in your own words.');
    const feedback = !started
      ? (urdu ? 'آپ ابھی ایک خیال سے آغاز کر سکتے ہیں۔' : 'You can begin with one idea when you are ready.')
      : changed
        ? (urdu ? 'آپ نے اپنے جواب میں تبدیلی کی ہے۔ اب اسے موجودہ خیال سے جوڑیں۔' : 'You changed your response. Now connect it to the current idea.')
        : words.length < 8
          ? (urdu ? 'آپ نے آغاز کر دیا ہے۔ ایک اور مکمل جملہ شامل کرنے کی کوشش کریں۔' : 'You have started. Try adding one more complete sentence.')
          : (urdu ? 'آپ نے ایک مکمل خیال شامل کیا ہے۔ اب اسے اگلے حصے سے جوڑیں۔' : 'You added a complete thought. Now connect it to the next part.');
    return {
      evidence_found: started ? [urdu ? 'آپ کی اپنی وضاحت' : 'your own explanation'] : [],
      missing_concept: focus,
      support_mode: 'hint',
      feedback,
      next_prompt: next,
      improvement: changed ? (urdu ? 'آپ کا نیا جواب پہلے جواب سے مختلف ہے۔' : 'Your new response differs from your earlier response.') : ''
    };
  };

  const adaptiveResultMarkup = ({ compact = false } = {}) => {
    const result = adaptiveRecall.result;
    if (!result && !adaptiveRecall.loading && !adaptiveRecall.error) return '';
    if (adaptiveRecall.loading) return '<aside class="course-adaptive-recall is-loading" role="status"><p class="course-eyebrow">Adaptive recall</p><strong>' + escapeHtml(courseUi('Looking at this one response…', 'اسی ایک جواب کو دیکھ رہے ہیں…')) + '</strong><p>' + escapeHtml(courseUi('The course is checking for one strength, one missing idea, and one useful next step.', 'کورس ایک مضبوط بات، ایک باقی خیال اور ایک مفید اگلا قدم دیکھ رہا ہے۔')) + '</p></aside>';
    if (adaptiveRecall.error && !result) return '<aside class="course-adaptive-recall is-fallback" role="status"><p class="course-eyebrow">Current-step support</p><strong>' + escapeHtml(courseUi('Your response is ready to keep working with.', 'آپ کے جواب پر کام جاری رکھا جا سکتا ہے۔')) + '</strong><p>' + escapeHtml(adaptiveRecall.error) + '</p></aside>';
    const evidence = result.evidence_found?.length
      ? '<p><strong>' + escapeHtml(courseUi('You already showed:', 'آپ نے پہلے ہی یہ ظاہر کیا:')) + '</strong> ' + escapeHtml(result.evidence_found.join(' · ')) + '</p>'
      : '';
    const improvement = result.improvement
      ? '<p><strong>' + escapeHtml(courseUi('What changed:', 'کیا بہتر ہوا:')) + '</strong> ' + escapeHtml(result.improvement) + '</p>'
      : '';
    const review = adaptiveRecall.error ? '<p class="course-adaptive-review">' + escapeHtml(adaptiveRecall.error) + '</p>' : '';
    return '<aside class="course-adaptive-recall' + (adaptiveRecall.error ? ' is-fallback' : '') + (compact ? ' is-compact' : '') + '" data-adaptive-recall role="status"><p class="course-eyebrow">' + escapeHtml(courseUi('Adaptive recall', 'تطبیقی یادداشت')) + '</p><h3>' + escapeHtml(courseUi('Your thinking, made visible', 'آپ کی سوچ، نمایاں')) + '</h3><p>' + escapeHtml(result.feedback) + '</p>' + evidence + '<p><strong>' + escapeHtml(courseUi('One idea to add:', 'شامل کرنے کے لیے ایک خیال:')) + '</strong> ' + escapeHtml(result.missing_concept) + '</p>' + improvement + '<div class="course-adaptive-next"><span>' + escapeHtml(courseUi('Next prompt', 'اگلا سوال')) + '</span><p>' + escapeHtml(result.next_prompt) + '</p></div>' + review + '</aside>';
  };

  const clearAdaptiveRecall = () => {
    adaptiveRecall.controller?.abort?.();
    adaptiveRecall.loading = false;
    adaptiveRecall.result = null;
    adaptiveRecall.error = '';
    adaptiveRecall.barrier = '';
    adaptiveRecall.firstAttempt = '';
    adaptiveRecall.revisionReviewed = false;
    adaptiveRecall.controller = null;
  };

  const analyseAdaptiveRecall = async ({ barrier = '', response = '', previousResponse = '' } = {}) => {
    const safeResponse = String(response || '').trim();
    adaptiveRecall.barrier = barrier;
    adaptiveRecall.loading = true;
    adaptiveRecall.error = '';
    const controller = new AbortController();
    adaptiveRecall.controller?.abort?.();
    adaptiveRecall.controller = controller;
    recordUnifiedBehaviourAction('ai-request');
    render();
    const fallback = adaptiveFallback(barrier, safeResponse, previousResponse);
    try {
      if (!canRequestAdaptiveRecall()) throw new Error(courseUi('Sign in to use the adaptive check. Current-step support is still available.', 'تطبیقی جانچ کے لیے لاگ اِن کریں۔ موجودہ مرحلے کی مدد پھر بھی دستیاب ہے۔'));
      const payload = await requestAdaptiveRecall({
        user: authenticatedUser,
        courseId: COURSE.id,
        courseVersion: activeCourseVersion(),
        page: { moduleIndex: displayedModuleIndex(), phase: state.progress.phase },
        language: courseUsesUrdu() ? 'ur' : 'en',
        response: safeResponse,
        previousResponse: String(previousResponse || '').trim(),
        barrier,
        // BEHAVIOURAL LEARNING PARTNER: Adaptive Recall receives only the
        // consented, neutral state names—not behavioural counters or learner
        // language—to choose the smallest useful presentation of its support.
        behaviourStates: adaptiveLearningIsActive() ? behaviourPartner.context.snapshot().behaviour.states : [],
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      adaptiveRecall.result = payload?.result || fallback;
      adaptiveRecall.error = payload?.review ? courseUi('Result under review. You can continue with this current-step support.', 'نتیجہ زیرِ جائزہ ہے۔ آپ اس موجودہ مرحلے کی مدد کے ساتھ جاری رکھ سکتے ہیں۔') : '';
    } catch (error) {
      if (controller.signal.aborted) return;
      adaptiveRecall.result = fallback;
      adaptiveRecall.error = error?.message || courseUi('Adaptive recall is unavailable right now. This current-step support is ready.', 'تطبیقی یادداشت ابھی دستیاب نہیں۔ موجودہ مرحلے کی مدد تیار ہے۔');
    } finally {
      if (adaptiveRecall.controller === controller) adaptiveRecall.controller = null;
      adaptiveRecall.loading = false;
      render();
    }
  };

  const typingTask = () => {
    const typing = currentStep().typing;
    const attempt = state.progress.attempt;
    const sectionTyping = usesLessonSectionTyping();
    const activeSection = sectionTyping ? activeLessonTypingSection() : null;
    const voiceInputAvailable = typingAllowsVoiceInput();
    const responseLabel = voiceInputAvailable
      ? courseUi('Type or speak your response', 'اپنا جواب ٹائپ کریں یا بولیں')
      : courseUi('Type your response', 'اپنا جواب ٹائپ کریں');
    const inputHelp = voiceInputAvailable
      ? courseUi('Use the microphone beside the response field to speak, or type your response. Speech input starts only when you choose the microphone.', 'بولنے کے لیے جواب کے خانے کے پاس مائیکروفون استعمال کریں، یا اپنا جواب ٹائپ کریں۔ آواز کے ذریعے اِن پٹ صرف مائیکروفون منتخب کرنے پر شروع ہوتا ہے۔')
      : typing.level === 'Recall typing'
        ? courseUi('Use your own words. Your response is not ranked or scored for speed.', 'اپنے الفاظ استعمال کریں۔ آپ کے جواب کی رفتار کے لحاظ سے درجہ بندی یا اسکور نہیں دیا جاتا۔')
        : courseUi('Paste is blocked in keyboard practice. Press Enter to check this response. Use Shift+Enter for a new line.', 'کی بورڈ مشق میں پیسٹ کرنا بند ہے۔ جواب جانچنے کے لیے Enter دبائیں۔ نئی سطر کے لیے Shift+Enter استعمال کریں۔');
    const feedback = attempt.feedback ? '<p class="typing-feedback" role="alert">' + escapeHtml(attempt.feedback) + '</p>' : '';
    const integrity = attempt.integrityNotice ? '<p class="integrity-note">' + escapeHtml(courseUi('A large amount of text appeared at once. That is okay—this course will use a short understanding check rather than a speed score.', 'متن کی بڑی مقدار ایک ساتھ ظاہر ہوئی۔ یہ ٹھیک ہے—یہ کورس رفتار کے اسکور کے بجائے مختصر سمجھ جانچ استعمال کرے گا۔')) + '</p>' : '';
    const urduTypingSection = sectionTyping ? readingSections()[activeSection.index] : null;
    const label = sectionTyping
      ? courseUi('Lesson typing · section ' + (activeSection.index + 1) + ' of ' + activeSection.total, 'سبق کی ٹائپنگ · حصہ ' + (activeSection.index + 1) + ' از ' + activeSection.total)
      : courseUi(typing.level, 'ٹائپنگ کی مشق');
    const title = sectionTyping
      ? courseUi(activeSection.section.heading, urduTypingSection?.urduHeading || '')
      : courseUi('Make one idea visible', 'اپنے خیال کو واضح کریں');
    const prompt = sectionTyping
      ? courseUi('Type the complete section below. Take the time you need.', 'نیچے پورا حصہ ٹائپ کریں۔ جتنا وقت درکار ہو لیں۔')
      : courseUi(typing.prompt, 'اپنے خیال کو اپنے الفاظ میں لکھیں۔');
    const note = sectionTyping
      ? courseUi('This is one complete part of the lesson. It is not ranked or scored for speed.', 'یہ سبق کا ایک مکمل حصہ ہے۔ رفتار کے لحاظ سے نہ درجہ بندی ہوتی ہے اور نہ اسکور۔')
      : courseUi('Use this space to show your thinking. It is not ranked or scored for speed.', 'اپنی سوچ ظاہر کرنے کے لیے یہ جگہ استعمال کریں۔ رفتار کے لحاظ سے نہ درجہ بندی ہوتی ہے اور نہ اسکور۔');
    const nextAction = sectionTyping && activeSection.index < activeSection.total - 1
      ? courseUi('Check this section', 'اس حصے کو جانچیں')
      : sectionTyping
        ? courseUi('Continue to quick check', 'فوری جانچ کی طرف جائیں')
        : typing.level === 'Guided typing' && attempt.guidedIndex < typing.phrases.length - 1
          ? courseUi('Check this phrase', 'اس جملے کو جانچیں')
          : typing.level === 'Recall typing' ? courseUi('Review my explanation', 'میری وضاحت کا جائزہ لیں') : courseUi('Check my sentence', 'میرے جملے کو جانچیں');
    const adaptive = typing.level === 'Recall typing' ? adaptiveResultMarkup() : '';
    const recallAction = typing.level === 'Recall typing' && adaptiveRecall.result && !adaptiveRecall.revisionReviewed
      ? courseUi('Review my updated explanation', 'میری بہتر وضاحت کا جائزہ لیں')
      : nextAction;
    return '<article class="course-task-card course-typing-task"><div class="course-typing-body"><div class="course-task-top"><div><p class="course-task-label">' + escapeHtml(label) + '</p><h2 id="course-task-heading" tabindex="-1">' + escapeHtml(title) + '</h2><p>' + escapeHtml(prompt) + '</p></div>' + taskHeaderControls() + '</div><div class="typing-practice"><p class="typing-note">' + escapeHtml(note) + '</p>' + typingMomentumMarkup() + adaptive + typingTarget() + '<label class="course-input-label" for="course-typing-input">' + responseLabel + '</label><textarea id="course-typing-input" data-typing-input rows="4" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="' + escapeHtml(typing.placeholder || 'Type the visible section here…') + '" aria-describedby="typing-help">' + escapeHtml(attempt.response) + '</textarea><p id="typing-help" class="course-input-help">' + inputHelp + '</p>' + integrity + feedback + '</div></div><div class="course-task-actions"><button class="course-primary-button" type="button" data-action="check-typing"' + (adaptiveRecall.loading ? ' disabled' : '') + '>' + recallAction + ' <span aria-hidden="true">→</span></button></div></article>';
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

  const renderedTaskOptions = (options, name, dataAttribute, urduOptions = [], reviewedResult = '') => {
    const selected = state.progress.attempt.selectedAnswer === '' ? null : Number(state.progress.attempt.selectedAnswer);
    const authoredCorrectIndex = options.findIndex(([, correct]) => correct);
    // A reviewed manifest never contains an answer key. Once its protected
    // server request resolves, use only that bounded outcome for feedback.
    const correctIndex = reviewedResult === 'complete'
      ? selected
      : reviewedResult === 'try-again'
        ? -1
        : authoredCorrectIndex;
    const submitted = Boolean(state.progress.attempt.submitted);
    return options.map(([label], index) => '<label class="course-check-option' + taskOptionState(index, selected, correctIndex, submitted) + '"><input type="radio" name="' + name + '" value="' + index + '" ' + dataAttribute + (index === selected ? ' checked' : '') + (submitted ? ' disabled' : '') + '><span>' + bilingualCopy(label, urduOptions[index]) + '</span>' + taskOptionFeedback(index, selected, correctIndex, submitted) + '</label>').join('');
  };

  const checkTaskWithFeedback = () => {
    const check = currentStep().check;
    const urduCheck = urduStep()?.check || {};
    const selected = state.progress.attempt.selectedAnswer === '' ? null : Number(state.progress.attempt.selectedAnswer);
    const reviewedResult = usesReviewedManifest() ? state.progress.attempt.checkResult : '';
    const correctIndex = reviewedResult === 'complete'
      ? selected
      : reviewedResult === 'try-again'
        ? -1
        : check.options.findIndex(([, correct]) => correct);
    const submitted = Boolean(state.progress.attempt.submitted);
    const correct = submitted && selected === correctIndex;
    const feedback = state.progress.attempt.checking
      ? '<p class="course-input-help" role="status">' + escapeHtml(courseUi('Checking this reviewed answer…', 'اس منظور شدہ جواب کی جانچ ہو رہی ہے…')) + '</p>'
      : submitted ? savedSupportMarkup(correct ? 'answer-correct' : 'answer-incorrect', { result: 'quick-check' }) : '';
    const actions = state.progress.attempt.checking
      ? '<button class="course-primary-button" type="button" disabled>' + escapeHtml(courseUi('Checking…', 'جانچ ہو رہی ہے…')) + '</button>'
      : !submitted
      ? '<button class="course-primary-button" type="button" data-action="submit-check"' + (selected === null ? ' disabled' : '') + '>' + escapeHtml(courseUi('Submit answer', 'جواب جمع کریں')) + ' <span aria-hidden="true">→</span></button>'
      : correct
        ? '<button class="course-primary-button" type="button" data-action="continue-check">' + escapeHtml(courseUi('Continue', 'جاری رکھیں')) + ' <span aria-hidden="true">→</span></button>'
        : '<button class="course-secondary-button" type="button" data-action="retry-question">' + escapeHtml(courseUi('Choose another answer', 'دوسرا جواب منتخب کریں')) + '</button><button class="course-secondary-button" type="button" data-action="return-to-read">' + escapeHtml(courseUi('Read this step again', 'یہ مرحلہ دوبارہ پڑھیں')) + '</button><button class="course-secondary-button" type="button" data-action="simple-read">' + escapeHtml(courseUi('Explain more simply', 'زیادہ آسان الفاظ میں سمجھائیں')) + '</button>';
    return '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">' + bilingualCopy('Quick check', 'فوری جانچ') + '</p><h2 id="course-task-heading" tabindex="-1">' + bilingualCopy('Check understanding', 'سمجھ جانچیں') + '</h2><p>' + bilingualCopy('Choose the answer that best matches the short explanation.', 'وہ جواب منتخب کریں جو مختصر وضاحت سے سب سے بہتر میل کھاتا ہو۔') + '</p></div>' + taskHeaderControls() + '</div>' + (state.progress.attempt.integrityNotice ? '<p class="integrity-note">' + bilingualCopy('This quick check keeps the focus on understanding, not on how text entered the box.', 'یہ فوری جانچ اس بات پر توجہ رکھتی ہے کہ آپ نے خیال کو سمجھا ہے، نہ کہ متن باکس میں کیسے داخل ہوا۔') + '</p>' : '') + '<fieldset class="course-check-options' + (submitted ? ' is-submitted' : '') + '"><legend>' + bilingualCopy(check.question, urduCheck.question) + '</legend>' + renderedTaskOptions(check.options, 'course-check', 'data-check-answer', urduCheck.options, reviewedResult) + '</fieldset>' + feedback + '<div class="course-task-actions">' + actions + '</div></article>';
  };

  const applyTaskWithFeedback = () => {
    const choices = [[practiceSupport(), true], ['Assume one support will work for everyone.', false], ['Make the learner explain or prove a diagnosis before offering support.', false], ['Withhold support until the learner finishes the task alone.', false]];
    const urduContent = urduStep()?.content || {};
    const urduChoices = [urduContent.supports?.[0], 'یہ فرض کر لیں کہ ایک مدد سب کے لیے کارآمد ہو گی۔', 'مدد دینے سے پہلے سیکھنے والے سے تشخیص سمجھانے یا ثابت کرنے کا مطالبہ کریں۔', 'اس وقت تک مدد روک لیں جب تک سیکھنے والا اکیلے کام مکمل نہ کرے۔'];
    const selected = state.progress.attempt.selectedAnswer === '' ? null : Number(state.progress.attempt.selectedAnswer);
    const correctIndex = choices.findIndex(([, correct]) => correct);
    const submitted = Boolean(state.progress.attempt.submitted);
    const correct = submitted && selected === correctIndex;
    const feedback = submitted ? savedSupportMarkup(correct ? 'answer-correct' : 'answer-incorrect', { result: 'applied-practice' }) : '';
    const actions = !submitted
      ? '<button class="course-primary-button" type="button" data-action="submit-apply"' + (selected === null ? ' disabled' : '') + '>' + escapeHtml(courseUi('Submit answer', 'جواب جمع کریں')) + ' <span aria-hidden="true">→</span></button>'
      : correct
        ? '<button class="course-primary-button" type="button" data-action="continue-apply">' + escapeHtml(courseUi('Complete this step', 'یہ مرحلہ مکمل کریں')) + ' <span aria-hidden="true">→</span></button>'
        : '<button class="course-secondary-button" type="button" data-action="retry-question">' + escapeHtml(courseUi('Choose another answer', 'دوسرا جواب منتخب کریں')) + '</button>';
    return '<article class="course-task-card"><div class="course-task-top"><div><p class="course-task-label">' + bilingualCopy('Adapted practice', 'عملی مشق') + '</p><h2 id="course-task-heading" tabindex="-1">' + bilingualCopy('Use the idea in a small situation', 'خیال کو ایک مختصر صورتحال میں استعمال کریں') + '</h2><p>' + bilingualCopy('A learner is working on a similar task. Which response best uses the idea from this module?', 'ایک سیکھنے والا ملتے جلتے کام پر ہے۔ کون سا ردِعمل اس ماڈیول کے خیال کو سب سے بہتر استعمال کرتا ہے؟') + '</p></div>' + taskHeaderControls() + '</div><fieldset class="course-check-options' + (submitted ? ' is-submitted' : '') + '"><legend>' + bilingualCopy('Which response best uses the idea from this module?', 'کون سا ردِعمل اس ماڈیول کے خیال کو سب سے بہتر استعمال کرتا ہے؟') + '</legend>' + renderedTaskOptions(choices, 'course-apply', 'data-apply-answer', urduChoices) + '</fieldset>' + feedback + '<div class="course-task-actions">' + actions + '</div></article>';
  };

  // ADAPTIVE LEARNING: the assessment service returns only one public
  // question at a time. Its answer key, internal rubric and raw outcome stay
  // server-side, while the course save stores an opaque run id only.
  const understandingChecksAvailable = () => adaptiveLearningIsActive() && adaptiveLearning.assessmentsAvailable;
  // Published manifests own their reviewed final bank. Do not send an
  // arbitrary published course to the historical adaptive bank, because its
  // objectives can be different. Its established UI still uses the protected
  // one-question /courses/check-answer endpoint for the final review.
  const reviewedManifestFinalAvailable = () => usesReviewedManifest() && finalExamQuestionCount() > 0;
  // Dynamic checks now resolve the selected reviewed manifest on the server.
  // Teacher-created theory courses therefore receive the same one-question,
  // no-score assessment flow as the historic Type2Learn course.
  const moduleUnderstandingChecksAvailable = () => understandingChecksAvailable();

  const assessmentQuestionMarkup = (question) => {
    if (question?.responseMode === 'mcq') {
      const selected = understandingCheck.selectedOption;
      return '<fieldset class="course-check-options"><legend>' + escapeHtml(question.prompt) + '</legend>'
        + question.options.map((option, index) => '<label class="course-check-option' + (selected === String(index) ? ' is-selected' : '') + '"><input type="radio" name="understanding-check-answer" value="' + index + '" data-assessment-option' + (selected === String(index) ? ' checked' : '') + '><span>' + escapeHtml(option) + '</span></label>').join('') + '</fieldset>';
    }
    const canSpeak = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    const speech = canSpeak
      ? '<div class="course-assessment-input-tools"><button class="course-secondary-button" type="button" data-action="assessment-dictation"' + (understandingCheck.listening ? ' aria-pressed="true"' : '') + '>' + escapeHtml(understandingCheck.listening ? courseUi('Listening…', 'سن رہا ہے…') : courseUi('Speak response', 'آواز سے جواب دیں')) + '</button><p class="course-input-help">' + escapeHtml(courseUi('Your spoken words appear here for you to review and edit before submitting.', 'آپ کے بولے گئے الفاظ یہاں آئیں گے تاکہ آپ جمع کرنے سے پہلے انہیں دیکھ اور بدل سکیں۔')) + '</p></div>'
      : '';
    return '<label class="course-input-label" for="course-assessment-response">' + escapeHtml(courseUi('Your response', 'آپ کا جواب')) + '</label><textarea id="course-assessment-response" data-assessment-response rows="5" maxlength="1400" autocomplete="off" spellcheck="true" placeholder="' + escapeHtml(courseUi('Answer in your own words.', 'اپنے الفاظ میں جواب دیں۔')) + '">' + escapeHtml(understandingCheck.response) + '</textarea>' + speech + '<p class="course-input-help">' + escapeHtml(courseUi('There is no target text, timer, or score. Your response stays editable until you submit it.', 'کوئی ہدف متن، ٹائمر یا اسکور نہیں ہے۔ جمع کرنے تک آپ اپنا جواب بدل سکتے ہیں۔')) + '</p>';
  };

  const understandingCheckTask = () => {
    const run = understandingCheck.run;
    if (!run) {
      const canResume = Boolean(state.progress.assessmentRunId);
      const action = canResume ? 'resume-understanding-check' : 'start-understanding-check';
      const label = understandingCheck.loading
        ? courseUi('Preparing…', 'تیار ہو رہا ہے…')
        : canResume ? courseUi('Resume check', 'جانچ دوبارہ کھولیں') : courseUi('Start understanding check', 'سمجھ جانچ شروع کریں');
      return '<article class="course-task-card course-assessment-task"><div class="course-task-top"><div><p class="course-task-label">' + escapeHtml(courseUi('Understanding check', 'سمجھ جانچ')) + '</p><h2 id="course-task-heading" tabindex="-1">' + escapeHtml(courseUi(canResume ? 'Your next question is saved.' : 'Preparing one question at a time.', canResume ? 'آپ کا اگلا سوال محفوظ ہے۔' : 'ایک وقت میں ایک سوال تیار ہو رہا ہے۔')) + '</h2><p>' + escapeHtml(understandingCheck.error || courseUi('This check uses reviewed course questions. It has no timer, score, or target text.', 'اس جانچ میں کورس کے منظور شدہ سوالات استعمال ہوتے ہیں۔ اس میں کوئی ٹائمر، اسکور یا ہدف متن نہیں ہے۔')) + '</p></div>' + taskHeaderControls() + '</div><div class="course-task-actions"><button class="course-secondary-button" type="button" data-action="return-from-understanding-check">' + escapeHtml(courseUi('Return to module', 'ماڈیول پر واپس جائیں')) + '</button><button class="course-primary-button" type="button" data-action="' + action + '"' + (understandingCheck.loading ? ' disabled' : '') + '>' + escapeHtml(label) + ' <span aria-hidden="true">→</span></button></div></article>';
    }
    if (run.status === 'complete') {
      const needsReview = run.completionKind === 'review';
      const next = state.progress.assessmentScope === 'final'
        ? (needsReview
          ? courseUi('One course idea would benefit from another look.', 'کورس کے ایک خیال کو دوبارہ دیکھنا مفید ہو سکتا ہے۔')
          : courseUi('Your course check is complete.', 'آپ کی کورس جانچ مکمل ہو گئی ہے۔'))
        : run.nextHelpfulStep || courseUi('Your next learning step is ready.', 'آپ کا اگلا سیکھنے کا مرحلہ تیار ہے۔');
      const continueLabel = state.progress.assessmentScope === 'final'
        ? courseUi('Return to learning overview', 'سیکھنے کے خلاصے پر واپس جائیں')
        : courseUi('Continue to next module', 'اگلے ماڈیول کی طرف جائیں');
      const recovery = needsReview
        ? '<p class="course-assessment-recovery">' + escapeHtml(run.recheckAvailable
          ? courseUi('You can revisit one related module, then choose one more calm check. This is not a score or a judgement.', 'آپ ایک متعلقہ ماڈیول دوبارہ دیکھ سکتے ہیں، پھر ایک اور پُرسکون جانچ منتخب کر سکتے ہیں۔ یہ اسکور یا فیصلہ نہیں ہے۔')
          : courseUi('Revisit the related course idea before choosing another calm check. This check is saved; it is not a score or a judgement.', 'ایک اور پُرسکون جانچ منتخب کرنے سے پہلے متعلقہ کورس کے خیال کا جائزہ لیں۔ یہ جانچ محفوظ ہے؛ یہ اسکور یا فیصلہ نہیں ہے۔')) + '</p>'
        : '';
      const completionAction = needsReview
        ? (run.recheckAvailable
          ? '<button class="course-primary-button" type="button" data-action="restart-understanding-check">' + escapeHtml(courseUi('Try another calm check', 'ایک اور پُرسکون جانچ آزمائیں')) + ' <span aria-hidden="true">→</span></button>'
          : '<button class="course-primary-button" type="button" data-action="review-understanding-module">' + escapeHtml(courseUi('Review this course idea', 'اس کورس کے خیال کا جائزہ لیں')) + ' <span aria-hidden="true">→</span></button>')
        : '<button class="course-primary-button" type="button" data-action="finish-understanding-check">' + escapeHtml(continueLabel) + ' <span aria-hidden="true">→</span></button>';
      return '<article class="course-task-card course-complete-card course-assessment-task"><div class="completion-mark" aria-hidden="true">✓</div><div class="course-task-top"><div><p class="course-task-label">' + escapeHtml(courseUi('Understanding check complete', 'سمجھ جانچ مکمل')) + '</p><h2 id="course-task-heading" tabindex="-1">' + escapeHtml(next) + '</h2><p>' + escapeHtml(understandingCheck.feedback || courseUi('Your response was recorded. Choose the next step when you are ready.', 'آپ کا جواب محفوظ ہو گیا ہے۔ جب تیار ہوں اگلا مرحلہ منتخب کریں۔')) + '</p></div>' + taskHeaderControls() + '</div>' + recovery + completionAction + '</div></article>';
    }
    const question = run.currentQuestion;
    const ready = question?.responseMode === 'mcq' ? understandingCheck.selectedOption !== '' : understandingCheck.response.trim().length >= 2;
    return '<article class="course-task-card course-typing-task course-assessment-task"><div class="course-typing-body"><div class="course-task-top"><div><p class="course-task-label">' + escapeHtml(courseUi('Understanding check', 'سمجھ جانچ')) + '</p><h2 id="course-task-heading" tabindex="-1">' + escapeHtml(courseUi('Question ' + run.questionPosition + ' of ' + run.questionCount, 'سوال ' + run.questionPosition + ' از ' + run.questionCount)) + '</h2><p>' + escapeHtml(courseUi('Answer one question in the way that works for you.', 'ایک وقت میں ایک سوال کا اپنی سہولت سے جواب دیں۔')) + '</p></div>' + taskHeaderControls() + '</div><div class="typing-practice">' + assessmentQuestionMarkup(question) + (understandingCheck.feedback ? '<p class="check-feedback" role="status">' + escapeHtml(understandingCheck.feedback) + '</p>' : '') + (understandingCheck.error ? '<p class="typing-feedback" role="alert">' + escapeHtml(understandingCheck.error) + '</p>' : '') + '</div></div><div class="course-task-actions"><button class="course-secondary-button" type="button" data-action="return-from-understanding-check">' + escapeHtml(courseUi('Save and return', 'محفوظ کریں اور واپس جائیں')) + '</button><button class="course-primary-button" type="button" data-action="submit-understanding-check"' + (!ready || understandingCheck.loading ? ' disabled' : '') + '>' + escapeHtml(understandingCheck.loading ? courseUi('Saving…', 'محفوظ ہو رہا ہے…') : courseUi('Continue', 'جاری رکھیں')) + ' <span aria-hidden="true">→</span></button></div></article>';
  };

  const completeTask = () => {
    const proposal = adaptiveProposalMarkup({ proposal: adaptiveLearning.proposal, escapeHtml, courseUi });
    const assessmentAction = moduleUnderstandingChecksAvailable()
      ? '<button class="course-primary-button" type="button" data-action="start-understanding-check">' + escapeHtml(courseUi('Continue to understanding check', 'سمجھ جانچ کی طرف بڑھیں')) + ' <span aria-hidden="true">→</span></button>'
      : '';
    const nextStepAction = assessmentAction
      ? ''
      : '<button class="course-primary-button" type="button" data-action="next-step">' + courseUi('Continue to step ' + (state.progress.lessonIndex + 2), 'مرحلہ ' + (state.progress.lessonIndex + 2) + ' جاری رکھیں') + ' <span aria-hidden="true">→</span></button>';
    const readinessCopy = assessmentAction
      ? bilingualCopy('Your learning is saved. When you are ready, use one calm understanding check before the next module.', 'آپ کی تعلیم محفوظ ہے۔ جب تیار ہوں، اگلے ماڈیول سے پہلے ایک پُرسکون سمجھ جانچ استعمال کریں۔')
      : bilingualCopy('Your next step is ready whenever you are.', 'آپ کا اگلا مرحلہ جب چاہیں تیار ہے۔');
    return '<article class="course-task-card course-complete-card"><div class="completion-mark" aria-hidden="true">✓</div><div class="course-task-top"><div><p class="course-task-label">' + bilingualCopy('Progress update', 'پیش رفت کی تازہ کاری') + '</p><h2 id="course-task-heading" tabindex="-1">' + bilingualCopy('One small step complete.', 'ایک مختصر مرحلہ مکمل ہو گیا۔') + '</h2><p>' + readinessCopy + '</p></div>' + taskHeaderControls() + '</div>' + proposal + '<div class="course-task-actions"><button class="course-secondary-button" type="button" data-action="save-exit">' + courseUi('Save and exit', 'محفوظ کریں اور باہر جائیں') + '</button>' + assessmentAction + nextStepAction + '</div></article>';
  };

  const finalModuleCompleteTask = () => '<article class="course-task-card course-complete-card"><div class="completion-mark" aria-hidden="true">✓</div><div class="course-task-top"><div><p class="course-task-label">' + bilingualCopy('Course modules complete', 'کورس کے ماڈیولز مکمل') + '</p><h2 id="course-task-heading" tabindex="-1">' + bilingualCopy('The 11 learning modules are complete.', 'سیکھنے کے 11 ماڈیولز مکمل ہو گئے ہیں।') + '</h2><p>' + bilingualCopy('Your completed modules and settings are saved locally. When you are ready, complete the final exam one question at a time. It has ' + finalExamQuestionCount() + ' questions and no timer.', 'آپ کے مکمل ماڈیولز اور ترتیبات مقامی طور پر محفوظ ہیں۔ جب تیار ہوں، آخری امتحان ایک وقت میں ایک سوال مکمل کریں۔ اس میں ' + finalExamQuestionCount() + ' سوال ہیں اور کوئی ٹائمر نہیں ہے۔') + '</p></div>' + taskHeaderControls() + '</div><div class="course-task-actions"><button class="course-secondary-button" type="button" data-action="save-exit">' + courseUi('Save and exit', 'محفوظ کریں اور باہر جائیں') + '</button><button class="course-primary-button" type="button" data-action="start-final-exam">' + courseUi('Start final exam', 'آخری امتحان شروع کریں') + ' <span aria-hidden="true">→</span></button></div></article>';

  // Reviewed courses use the manifest's protected final-question bank, while
  // retaining this same completion card, settings controls, and navigation.
  const reviewedFinalCompleteTask = () => '<article class="course-task-card course-complete-card"><div class="completion-mark" aria-hidden="true">✓</div><div class="course-task-top"><div><p class="course-task-label">' + bilingualCopy('Course modules complete', 'کورس کے ماڈیولز مکمل') + '</p><h2 id="course-task-heading" tabindex="-1">' + bilingualCopy('All ' + COURSE.steps.length + ' learning modules are complete.', 'سیکھنے کے تمام ' + COURSE.steps.length + ' ماڈیولز مکمل ہو گئے ہیں۔') + '</h2><p>' + bilingualCopy('When you are ready, complete the reviewed final understanding check one question at a time. It has ' + finalExamQuestionCount() + ' questions, no timer, and no learner-visible score.', 'جب تیار ہوں، منظور شدہ آخری سمجھ جانچ ایک وقت میں ایک سوال مکمل کریں۔ اس میں ' + finalExamQuestionCount() + ' سوال ہیں، کوئی ٹائمر نہیں اور سیکھنے والے کے لیے کوئی اسکور نہیں۔') + '</p></div>' + taskHeaderControls() + '</div><div class="course-task-actions"><button class="course-secondary-button" type="button" data-action="save-exit">' + courseUi('Save and exit', 'محفوظ کریں اور باہر جائیں') + '</button><button class="course-primary-button" type="button" data-action="start-final-exam">' + courseUi('Start final understanding check', 'آخری سمجھ جانچ شروع کریں') + ' <span aria-hidden="true">→</span></button></div></article>';

  const finalUnderstandingCompleteTask = () => '<article class="course-task-card course-complete-card"><div class="completion-mark" aria-hidden="true">✓</div><div class="course-task-top"><div><p class="course-task-label">' + bilingualCopy('Course modules complete', 'کورس کے ماڈیولز مکمل') + '</p><h2 id="course-task-heading" tabindex="-1">' + bilingualCopy('The 11 learning modules are complete.', 'سیکھنے کے 11 ماڈیولز مکمل ہو گئے ہیں۔') + '</h2><p>' + bilingualCopy('When you are ready, take the final understanding check one question at a time. There are no timers or scores.', 'جب تیار ہوں، آخری سمجھ جانچ ایک وقت میں ایک سوال مکمل کریں۔ کوئی ٹائمر یا اسکور نہیں ہے۔') + '</p></div>' + taskHeaderControls() + '</div><div class="course-task-actions"><button class="course-secondary-button" type="button" data-action="save-exit">' + courseUi('Save and exit', 'محفوظ کریں اور باہر جائیں') + '</button><button class="course-primary-button" type="button" data-action="start-final-understanding-check">' + courseUi('Start final understanding check', 'آخری سمجھ جانچ شروع کریں') + ' <span aria-hidden="true">→</span></button></div></article>';

  // The safeguards that make an understanding check private and objective are
  // server-side. If they are unavailable, the course ends here rather than
  // falling back to the retired client-only final exam.
  const finalModuleSavedTask = () => '<article class="course-task-card course-complete-card"><div class="completion-mark" aria-hidden="true">✓</div><div class="course-task-top"><div><p class="course-task-label">' + bilingualCopy('Course modules complete', 'کورس کے ماڈیولز مکمل') + '</p><h2 id="course-task-heading" tabindex="-1">' + bilingualCopy('Your course work is saved.', 'آپ کا کورس ورک محفوظ ہے۔') + '</h2><p>' + bilingualCopy('The optional understanding check is not available in this session. You can return to your learning overview without losing your completed modules.', 'اختیاری سمجھ جانچ اس سیشن میں دستیاب نہیں ہے۔ آپ مکمل ماڈیولز کھوئے بغیر سیکھنے کے خلاصے پر واپس جا سکتے ہیں۔') + '</p></div>' + taskHeaderControls() + '</div><div class="course-task-actions"><button class="course-secondary-button" type="button" data-action="save-exit">' + courseUi('Save and exit', 'محفوظ کریں اور باہر جائیں') + '</button><button class="course-primary-button" type="button" data-action="dashboard">' + courseUi('Return to learning overview', 'سیکھنے کے خلاصے پر واپس جائیں') + ' <span aria-hidden="true">→</span></button></div></article>';

  const completionTask = () => isLastStep()
    ? (understandingChecksAvailable() ? finalUnderstandingCompleteTask() : reviewedManifestFinalAvailable() ? reviewedFinalCompleteTask() : finalModuleSavedTask())
    : completeTask();

  const examOptionState = (index, selected, correctIndex, submitted) => {
    return index === selected ? ' is-selected' : '';
  };

  const examOptionFeedback = () => '';

  const finalExamIntroTask = () => '<article class="course-task-card course-final-exam exam-intro-card"><div class="course-task-top"><div><p class="course-task-label">' + bilingualCopy('Final exam', 'آخری امتحان') + '</p><h2 id="course-task-heading" tabindex="-1">' + bilingualCopy('Finish with one question at a time.', 'ایک وقت میں ایک سوال مکمل کریں۔') + '</h2><p>' + bilingualCopy(finalExam().description || 'Use what you learned across the course.', COURSE_URDU.finalExam.description) + '</p></div>' + taskHeaderControls() + '</div><p>' + bilingualCopy('This is a calm review of the course. There are ' + finalExamQuestionCount() + ' multiple-choice questions, each with four choices. There is no timer, speed score, or ranking.', 'یہ کورس کا پُرسکون جائزہ ہے۔ اس میں ' + finalExamQuestionCount() + ' کثیرالانتخاب سوال ہیں، ہر ایک کے چار انتخاب ہیں۔ کوئی ٹائمر، رفتار کا اسکور یا درجہ بندی نہیں ہے۔') + '</p><p>' + bilingualCopy('Your progress is saved after each choice. You can pause and return to the same question whenever you need.', 'ہر انتخاب کے بعد آپ کی پیش رفت محفوظ ہوتی ہے۔ جب ضرورت ہو آپ وقفہ کر کے اسی سوال پر واپس آ سکتے ہیں۔') + '</p><div class="course-task-actions"><button class="course-secondary-button" type="button" data-action="save-exit">' + courseUi('Save and exit', 'محفوظ کریں اور باہر جائیں') + '</button><button class="course-primary-button" type="button" data-action="start-final-exam">' + courseUi('Start final exam', 'آخری امتحان شروع کریں') + ' <span aria-hidden="true">→</span></button></div></article>';

  const finalExamQuestionTask = () => {
    const exam = state.progress.finalExam;
    const question = currentFinalExamQuestion();
    const urduQuestion = urduFinalQuestion(exam.questionIndex);
    if (!question) return '<article class="course-task-card course-final-exam"><p class="course-task-label">Final exam</p><h2 id="course-task-heading" tabindex="-1">The final exam is not available.</h2><p>Please return to the course overview and try again.</p><div class="course-task-actions"><button class="course-primary-button" type="button" data-action="dashboard">Return to learning overview</button></div></article>';
    const selected = exam.answers[exam.questionIndex];
    const submitted = Boolean(exam.submitted);
    const reviewed = usesReviewedManifest();
    const feedback = exam.checking
      ? '<p class="course-input-help" id="exam-feedback" role="status">' + escapeHtml(courseUi('Checking this reviewed answer…', 'اس منظور شدہ جواب کی جانچ ہو رہی ہے…')) + '</p>'
      : reviewed && exam.lastResult === 'try-again'
        ? '<p class="check-feedback" id="exam-feedback" role="status">' + escapeHtml(courseUi('Not quite. You can choose another answer, reread the course, or ask for support.', 'ابھی نہیں۔ آپ دوسرا جواب منتخب کر سکتے ہیں، کورس دوبارہ پڑھ سکتے ہیں یا مدد مانگ سکتے ہیں۔')) + '</p>'
        : submitted ? '<p class="check-feedback" id="exam-feedback" role="status">' + escapeHtml(reviewed ? courseUi('That response fits the reviewed course content. Continue when you are ready.', 'یہ جواب منظور شدہ کورس کے مواد سے میل کھاتا ہے۔ جب تیار ہوں آگے بڑھیں۔') : courseUi('Result under review. Your choice is recorded, and you can continue when you are ready.', 'نتیجہ زیرِ جائزہ ہے۔ آپ کا انتخاب محفوظ ہو گیا ہے اور جب تیار ہوں آگے بڑھ سکتے ہیں۔')) + '</p>' : '';
    const action = exam.checking
      ? '<button class="course-primary-button" type="button" disabled>' + escapeHtml(courseUi('Checking…', 'جانچ ہو رہی ہے…')) + '</button>'
      : submitted
      ? '<button class="course-primary-button" type="button" data-action="next-exam-question">' + courseUi(exam.questionIndex === finalExamQuestionCount() - 1 ? 'Finish review' : 'Next question', exam.questionIndex === finalExamQuestionCount() - 1 ? 'جائزہ مکمل کریں' : 'اگلا سوال') + ' <span aria-hidden="true">→</span></button>'
      : '<button class="course-primary-button" type="button" data-action="submit-exam-answer"' + (selected === null || typeof selected === 'undefined' ? ' disabled' : '') + '>' + escapeHtml(courseUi('Submit answer', 'جواب جمع کریں')) + ' <span aria-hidden="true">→</span></button>';
    return '<article class="course-task-card course-final-exam"><div class="course-task-top"><div><p class="course-task-label">' + bilingualCopy('Final review', 'آخری جائزہ') + '</p><h2 id="course-task-heading" tabindex="-1">' + bilingualCopy('Answer one question at a time.', 'ایک وقت میں ایک سوال کا جواب دیں۔') + '</h2><p>' + bilingualCopy('Choose the answer that best fits what you learned. You can change your choice before you submit it.', 'وہ جواب منتخب کریں جو آپ کی سیکھی ہوئی بات سے سب سے بہتر میل کھاتا ہو۔ جمع کرنے سے پہلے آپ اپنا انتخاب بدل سکتے ہیں۔') + '</p></div>' + taskHeaderControls(courseUi('One question at a time', 'ایک وقت میں ایک سوال')) + '</div><fieldset class="course-check-options" aria-describedby="exam-question-help' + (feedback ? ' exam-feedback' : '') + '"><legend class="exam-question-card" id="exam-question-card" tabindex="-1"><span class="exam-question-count">' + courseUi('Question ', 'سوال ') + (exam.questionIndex + 1) + courseUi(' of ', ' از ') + finalExamQuestionCount() + '</span><strong>' + bilingualCopy(question.question, urduQuestion?.question) + '</strong><span id="exam-question-help">' + bilingualCopy('Choose one answer, then submit when you are ready.', 'ایک جواب منتخب کریں، پھر جب تیار ہوں تو اسے جمع کریں۔') + '</span></legend>' + question.options.map(([label], index) => '<label class="course-check-option exam-option' + examOptionState(index, selected, -1, submitted) + '"><input type="radio" name="final-exam-answer" value="' + index + '" data-exam-answer' + (index === selected ? ' checked' : '') + (submitted || exam.checking ? ' disabled' : '') + '><span class="exam-option-copy">' + bilingualCopy(label, urduQuestion?.options?.[index]) + '</span>' + examOptionFeedback() + '</label>').join('') + '</fieldset>' + feedback + '<div class="course-task-actions">' + action + '</div></article>';
  };

  const finalExamResultsTask = () => '<article class="course-task-card course-final-exam exam-results-card"><div class="course-task-top"><div><p class="course-task-label">' + bilingualCopy('Final review complete', 'آخری جائزہ مکمل') + '</p><h2 id="course-task-heading" tabindex="-1">' + bilingualCopy('Thank you for showing your understanding.', 'اپنی سمجھ ظاہر کرنے کا شکریہ۔') + '</h2><p>' + bilingualCopy('Result under review. Your choices are saved locally; this course does not show scores, answer keys, rankings, or speed results.', 'نتیجہ زیرِ جائزہ ہے۔ آپ کے انتخاب مقامی طور پر محفوظ ہیں؛ یہ کورس اسکور، جوابی کلید، درجہ بندی یا رفتار کے نتائج نہیں دکھاتا۔') + '</p></div>' + taskHeaderControls(courseUi('Saved locally', 'مقامی طور پر محفوظ ہے')) + '</div><div class="course-task-actions"><button class="course-primary-button" type="button" data-action="return-course">' + courseUi('Return to learning overview', 'سیکھنے کے خلاصے پر واپس جائیں') + ' <span aria-hidden="true">→</span></button></div></article>';

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
    const previousCharacters = Array.from(previousValue || '');
    const inputCharacters = Array.from(input.value || '');
    const addedOneCharacter = animateNewestCharacter
      && inputCharacters.length === previousCharacters.length + 1;
    overlay.innerHTML = renderTypingCharacters(activeTypingReference(), input.value, addedOneCharacter ? inputCharacters.length - 1 : -1);
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

  const syncTypingFocusCurtain = (input) => {
    const surface = input?.closest('.typing-tester-surface');
    const curtain = surface?.querySelector('[data-typing-focus-curtain]');
    if (!curtain) return;
    const inputIsActive = document.activeElement === input;
    // A learner who is speaking is already actively entering their response.
    // Do not place a typing-only curtain over the live transcript.
    const voiceIsActive = voiceInput.listening;
    curtain.hidden = inputIsActive || voiceIsActive;
    curtain.setAttribute('aria-hidden', inputIsActive || voiceIsActive ? 'true' : 'false');
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
    field.className = 'typing-tester' + (freeResponse ? ' is-free-response' : '') + (sectionTyping ? ' is-lesson-section' : '') + (voiceInputAvailable ? ' has-voice-input' : '');
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
    }

    const surface = document.createElement('div');
    surface.className = 'typing-tester-surface';
    field.append(surface);
    if (!freeResponse) {
      const overlay = document.createElement('div');
      overlay.className = 'typing-tester-overlay';
      overlay.dataset.typingOverlay = '';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = renderTypingCharacters(reference, textarea.value);
      surface.append(overlay);
    }

    const phraseLabel = sectionTyping
      ? courseUi(
        'Section ' + (activeSection.index + 1) + ' of ' + activeSection.total + ' — type the complete visible section',
        'حصہ ' + (activeSection.index + 1) + ' از ' + activeSection.total + ' — نظر آنے والا پورا حصہ ٹائپ کریں'
      )
      : typing.level === 'Guided typing'
        ? courseUi(
          'Phrase ' + (state.progress.attempt.guidedIndex + 1) + ' of ' + typing.phrases.length + ' — type the visible phrase',
          'فقرہ ' + (state.progress.attempt.guidedIndex + 1) + ' از ' + typing.phrases.length + ' — نظر آنے والا فقرہ ٹائپ کریں'
        )
        : courseUi(
          freeResponse ? 'Write your response in the field' : 'Type the visible text in the field',
          freeResponse ? 'خانے میں اپنا جواب لکھیں' : 'خانے میں نظر آنے والا متن ٹائپ کریں'
        );
    label.textContent = voiceInputAvailable
      ? courseUi('Type or speak your response', 'اپنا جواب ٹائپ کریں یا بولیں')
      : phraseLabel;
    textarea.classList.add('typing-tester-input');
    textarea.removeAttribute('rows');
    textarea.removeAttribute('placeholder');
    textarea.setAttribute('aria-label', label.textContent);
    textarea.setAttribute('aria-describedby', 'typing-reference typing-help');
    const typingHelp = practice.querySelector('#typing-help');
    const checkInstruction = courseUi(
      'Press Enter to check this response. Use Shift+Enter for a new line.',
      'جواب جانچنے کے لیے اِنٹر دبائیں۔ نئی سطر کے لیے شفٹ کے ساتھ اِنٹر استعمال کریں۔'
    );
    if (typingHelp && !typingHelp.textContent.includes(checkInstruction)) typingHelp.textContent += ' ' + checkInstruction;
    label.insertAdjacentElement('afterend', field);
    surface.append(textarea);
    const focusCurtain = document.createElement('button');
    focusCurtain.type = 'button';
    focusCurtain.className = 'typing-focus-curtain';
    focusCurtain.dataset.typingFocusCurtain = '';
    focusCurtain.setAttribute('aria-label', courseUi('Click in the typing box to continue', 'لکھنا جاری رکھنے کے لیے ٹائپنگ باکس میں کلک کریں'));
    focusCurtain.innerHTML = '<span>' + escapeHtml(courseUi('Click in the typing box to continue', 'لکھنا جاری رکھنے کے لیے ٹائپنگ باکس میں کلک کریں')) + '</span>';
    surface.append(focusCurtain);
    if (voiceInputAvailable) {
      const controls = document.createElement('div');
      controls.className = 'typing-tester-controls';
      controls.dataset.voiceInputControls = '';
      const supported = Boolean(browserCanRecordVoice() || voiceRecognitionConstructor());
      controls.innerHTML = '<button class="course-secondary-button typing-mic-button" type="button" data-action="start-voice-input" aria-label="Use microphone to speak your response" aria-describedby="course-voice-input-status"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 14.5a3 3 0 0 0 3-3v-5a3 3 0 0 0 3 3Zm-5-3v.5a5 5 0 0 0 10 0v-.5M12 17v4M8.5 21h7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg><span data-voice-input-button-label>Speak</span></button>';
      // This is deliberately a sibling of the typing box: Speak starts a
      // voice-entry mode, rather than being part of the learner's text.
      field.insertAdjacentElement('beforebegin', controls);
      const liveControl = document.createElement('div');
      liveControl.className = 'typing-voice-live-control';
      liveControl.dataset.voiceInputLiveControl = '';
      liveControl.hidden = true;
      liveControl.innerHTML = '<button class="typing-voice-pause-button" type="button" data-action="toggle-voice-input-pause" aria-describedby="course-voice-input-status" aria-label="Pause speech recognition"><svg data-voice-input-live-icon viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5v14M16 5v14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.4"/></svg><span class="course-live-region" data-voice-input-live-label>Listening</span></button>';
      surface.append(liveControl);
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
    syncTypingFocusCurtain(textarea);
  };

  const voiceRecognitionConstructor = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;

  const voiceInputStateDefinition = (status) => ({
    ready: { name: 'Ready', button: 'Speak', active: false, disabled: false, label: 'Use microphone to speak your response', copy: 'Ready. Microphone input is optional. Typing stays available.' },
    listening: { name: 'Listening', button: 'Listening', active: true, disabled: true, label: 'Listening for your response', copy: 'Listening. Spoken words appear in the box as you speak.' },
    recognising: { name: 'Recognising', button: 'Recognising', active: true, disabled: true, label: 'Recognising your spoken response', copy: 'Recognising. Your words are being added to the response field. Typing stays available.' },
    paused: { name: 'Paused', button: 'Paused', active: false, disabled: true, label: 'Use the play button in the typing box to resume speech recognition', copy: 'Paused. Use the play button in the typing box to resume, or click in the typing box to type.' },
    stopped: { name: 'Stopped', button: 'Speak again', active: false, disabled: false, label: 'Start microphone input again', copy: 'Stopped. Your response is still in the field, and typing stays available.' },
    unsupported: { name: 'Unsupported', button: 'Unsupported', active: false, disabled: true, label: 'Microphone input is unsupported in this browser', copy: 'Unsupported. This browser cannot record microphone input for voice entry. Type your response instead.' },
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
    const liveControlVisible = ['listening', 'paused'].includes(voiceInput.status);
    const voiceFocusActive = liveControlVisible || voiceInput.status === 'recognising';
    // Speechmatics is a recording-and-transcribe fallback, rather than live
    // browser recognition. It needs an explicit completion control: leaving a
    // learner with only Pause would make them wait for the safety timeout.
    const recordingForSpeechmatics = voiceInput.recorder?.state === 'recording';
    app.querySelectorAll('[data-voice-input-live-control]').forEach((control) => {
      control.hidden = !liveControlVisible;
      control.dataset.voiceInputMode = recordingForSpeechmatics ? 'recording' : 'live';
      const toggle = control.querySelector('[data-action="toggle-voice-input-pause"]');
      const icon = control.querySelector('[data-voice-input-live-icon]');
      const label = control.querySelector('[data-voice-input-live-label]');
      const paused = voiceInput.status === 'paused';
      if (toggle) toggle.setAttribute('aria-label', recordingForSpeechmatics
        ? 'Finish speaking and add text'
        : paused ? 'Resume speech recognition' : 'Pause speech recognition');
      if (label) {
        label.classList.toggle('course-live-region', !recordingForSpeechmatics);
        label.textContent = recordingForSpeechmatics ? 'Finish' : paused ? 'Resume' : 'Listening';
      }
      if (icon) icon.innerHTML = recordingForSpeechmatics
        ? '<path d="m5 12 4.2 4.2L19 6.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4"/>'
        : paused
          ? '<path d="m9 5 10 7-10 7V5Z" fill="currentColor"/>'
          : '<path d="M8 5v14M16 5v14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.4"/>';
    });
    const status = app.querySelector('[data-voice-input-status]');
    if (status) status.textContent = detail ? definition.name + '. ' + detail : definition.copy;
    app.querySelectorAll('.typing-tester').forEach((field) => {
      field.classList.toggle('is-voice-active', voiceFocusActive);
    });
    const input = app.querySelector('[data-typing-input]');
    if (input) syncTypingFocusCurtain(input);
  };

  const stopVoiceInput = (message = '', nextStatus = 'stopped') => {
    const recognition = voiceInput.recognition;
    const recorder = voiceInput.recorder;
    const hadActiveSpeech = Boolean(recognition || recorder || voiceInput.listening);
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
    if (voiceInput.recordingTimer) {
      window.clearTimeout(voiceInput.recordingTimer);
      voiceInput.recordingTimer = null;
    }
    voiceInput.recognition = null;
    voiceInput.recorder = null;
    voiceInput.stream?.getTracks?.().forEach((track) => track.stop());
    voiceInput.stream = null;
    voiceInput.chunks = [];
    voiceInput.startedAt = 0;
    voiceInput.recorderStopping = false;
    voiceInput.listening = false;
    voiceInput.initialResponse = '';
    voiceInput.finalTranscript = '';
    voiceInput.finalResultIndexes = new Set();
    voiceInput.restartCount = 0;
    voiceInput.lastError = '';
    voiceInput.fallbackMessage = '';
    voiceInput.paused = false;
    if (recognition) {
      try { recognition.stop(); } catch (_) { /* Stopping is best-effort. */ }
    }
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch (_) { /* Stopping a recorder is best-effort. */ }
    }
    // A stopped microphone is still a completed *interaction*, not proof of
    // understanding. The unified context records only that the learner used
    // an optional input method; it never receives the audio or transcript.
    if (hadActiveSpeech) recordUnifiedBehaviourAction('speech-complete');
    renderVoiceInputState(nextStatus, message);
  };

  const pauseVoiceInput = () => {
    if (voiceInput.recorder?.state === 'recording') {
      // Unlike browser recognition, the Speechmatics compatibility path sends
      // an entire short recording. Finish it immediately so the learner gets
      // their transcript rather than waiting for the 45-second safety stop.
      stopSpeechmaticsTypingInput();
      renderVoiceInputState('recognising', 'Finishing your recording and turning it into editable text.');
      return;
    }
    const recognition = voiceInput.recognition;
    if (!recognition || !voiceInput.listening) return;
    voiceInput.stopRequested = true;
    voiceInput.paused = true;
    if (voiceInput.restartTimer) {
      window.clearTimeout(voiceInput.restartTimer);
      voiceInput.restartTimer = null;
    }
    voiceInput.recognition = null;
    try { recognition.stop(); } catch (_) { /* Stopping is best-effort. */ }
    renderVoiceInputState('paused');
    announce('Speech recognition paused.');
  };

  const resumeVoiceInput = () => {
    if (!voiceInput.paused) return;
    if (voiceInput.recorder?.state === 'paused') {
      try { voiceInput.recorder.resume(); } catch (_) { /* Best effort. */ }
      voiceInput.paused = false;
      renderVoiceInputState('listening');
      return;
    }
    if (!voiceRecognitionConstructor()) {
      renderVoiceInputState('error', 'Voice input cannot resume in this browser. You can type your response instead.');
      return;
    }
    voiceInput.paused = false;
    voiceInput.stopRequested = false;
    voiceInput.restartCount = 0;
    voiceInput.sessionId += 1;
    const sessionId = voiceInput.sessionId;
    renderVoiceInputState('listening', 'Resuming microphone input. Spoken words appear in the box as you speak.');
    beginVoiceRecognitionCycle(sessionId);
  };

  const toggleVoiceInputPause = () => {
    if (voiceInput.paused) resumeVoiceInput();
    else pauseVoiceInput();
  };

  const placeBrowserSpeechTranscript = (transcript) => {
    const input = app.querySelector('[data-typing-input]');
    const target = typingIsAccuracyObjective() ? activeTypingReference() : '';
    const canonical = target ? canonicaliseSpokenTyping(transcript, target) : { value: normaliseText(transcript), corrected: false };
    const livePrefix = target && !canonical.corrected
      ? canonicaliseSpokenTypingPrefix(transcript, target)
      : { value: canonical.value, aligned: canonical.corrected };
    const nextValue = target
      ? livePrefix.value
      : [voiceInput.initialResponse, canonical.value].filter(Boolean).join(' ');
    state.progress.attempt.response = nextValue;
    state.progress.attempt.feedback = '';
    state.progress.attempt.inputMethod = 'voice';
    state.progress.attempt.alternativeInput = true;
    if (input) {
      input.value = nextValue;
      syncTypingTester(input);
      scheduleTypingAutoSubmit(input);
    }
    save(canonical.corrected
      ? 'A close spoken match was placed as the visible course sentence.'
      : livePrefix.aligned
        ? 'Your spoken words are matching the visible course sentence.'
        : 'Voice input added to your response.');
    return { ...canonical, ...livePrefix };
  };

  const beginVoiceRecognitionCycle = (sessionId) => {
    if (sessionId !== voiceInput.sessionId || voiceInput.stopRequested) return;
    const Recognition = voiceRecognitionConstructor();
    let recognition;
    try {
      recognition = new Recognition();
    } catch (_) {
      stopVoiceInput('Live browser recognition could not start. Try Speak again, or type your response instead.', 'error');
      return;
    }
    voiceInput.recognition = recognition;
    voiceInput.finalResultIndexes = new Set();
    voiceInput.lastError = '';
    recognition.lang = browserRecognitionLanguage();
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
      renderVoiceInputState('listening', voiceInput.fallbackMessage);
      announce('Microphone input is listening.');
    };
    recognition.onresult = (event) => {
      if (sessionId !== voiceInput.sessionId || voiceInput.recognition !== recognition || voiceInput.stopRequested) return;
      // Keep the live state stable while interim results arrive. Updating the
      // UI for every recognition event made the control look interrupted.
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
      placeBrowserSpeechTranscript(transcript);
    };
    recognition.onerror = (event) => {
      if (sessionId !== voiceInput.sessionId || voiceInput.recognition !== recognition || voiceInput.stopRequested) return;
      const errorCode = String(event?.error || 'unknown');
      voiceInput.lastError = errorCode;
      if (errorCode === 'no-speech' || errorCode === 'aborted' || errorCode === 'network') {
        // Never retry a browser recogniser without a new learner action.
        // Chromium can otherwise report `network` indefinitely while showing
        // a misleading listening control and never placing a transcript.
        stopVoiceInput(errorCode === 'network'
          ? 'Live browser recognition lost its connection. Try Speak again, or type your response instead.'
          : 'No speech was heard. Try Speak again when you are ready, or type your response instead.', 'error');
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
      stopVoiceInput('Live browser recognition stopped. Your response is still here; choose Speak again only if you want another attempt.', 'stopped');
    };
    try {
      recognition.start();
    } catch (_) {
      if (voiceInput.recognition === recognition) voiceInput.recognition = null;
      stopVoiceInput('Live browser recognition could not start. Try Speak again, or type your response instead.', 'error');
    }
  };

  const startBrowserVoiceInput = (detail = '') => {
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
    voiceInput.paused = false;
    voiceInput.restartCount = 0;
    voiceInput.lastError = '';
    voiceInput.fallbackMessage = detail;
    voiceInput.sessionId += 1;
    const sessionId = voiceInput.sessionId;
    voiceInput.initialResponse = state.progress.attempt.response.trim();
    voiceInput.finalTranscript = '';
    voiceInput.finalResultIndexes = new Set();
    renderVoiceInputState('listening', detail || 'Starting microphone input. Spoken words appear in the box as you speak.');
    recordUnifiedBehaviourAction('speech-start');
    beginVoiceRecognitionCycle(sessionId);
  };

  const browserCanRecordVoice = () => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

  const clearSpeechmaticsTypingTimer = () => {
    if (voiceInput.recordingTimer) window.clearTimeout(voiceInput.recordingTimer);
    voiceInput.recordingTimer = null;
  };

  const stopSpeechmaticsTypingInput = () => {
    const recorder = voiceInput.recorder;
    if (!recorder || recorder.state === 'inactive' || voiceInput.recorderStopping) return;
    voiceInput.recorderStopping = true;
    clearSpeechmaticsTypingTimer();
    try { recorder.stop(); } catch (_) { stopVoiceInput('Voice input stopped. Your response is still here.'); }
  };

  const finishSpeechmaticsTypingInput = async (sessionId) => {
    if (sessionId !== voiceInput.sessionId || voiceInput.stopRequested) return;
    const elapsed = Math.max(300, Math.round(window.performance.now() - voiceInput.startedAt));
    const mimeType = voiceInput.recorder?.mimeType || 'audio/webm';
    const recording = new Blob(voiceInput.chunks, { type: mimeType });
    voiceInput.stream?.getTracks?.().forEach((track) => track.stop());
    voiceInput.recorder = null;
    voiceInput.stream = null;
    voiceInput.chunks = [];
    voiceInput.startedAt = 0;
    voiceInput.recorderStopping = false;
    clearSpeechmaticsTypingTimer();
    if (!recording.size) {
      renderVoiceInputState('error', 'No speech was recorded. Try again or type your response.');
      return;
    }
    renderVoiceInputState('recognising', 'Turning your short recording into editable text. Typing stays available.');
    try {
      const result = await transcribeCourseAudio({
        user: authenticatedUser,
        audio: recording,
        durationMs: elapsed,
        language: courseUsesUrdu() ? 'ur' : 'en',
        purpose: 'typing'
      });
      if (sessionId !== voiceInput.sessionId || voiceInput.stopRequested) return;
      const transcript = String(result?.transcript || '').trim();
      if (!transcript) throw new Error('No transcript');
      const input = app.querySelector('[data-typing-input]');
      const target = typingIsAccuracyObjective() ? activeTypingReference() : '';
      const canonical = target ? canonicaliseSpokenTyping(transcript, target) : { value: transcript, corrected: false };
      const nextValue = target ? canonical.value : [voiceInput.initialResponse, canonical.value].filter(Boolean).join(' ');
      state.progress.attempt.response = nextValue;
      state.progress.attempt.feedback = '';
      state.progress.attempt.inputMethod = 'voice';
      state.progress.attempt.alternativeInput = true;
      if (input) {
        input.value = nextValue;
        syncTypingTester(input);
        scheduleTypingAutoSubmit(input);
      }
      save(canonical.corrected
        ? 'A close spoken match was placed as the visible course sentence.'
        : 'Voice input added to your response. You can edit it before checking.');
      renderVoiceInputState('stopped', canonical.corrected
        ? 'A close spoken match was aligned with the visible course sentence.'
        : 'Your recording is now editable in the response field.');
      recordUnifiedBehaviourAction('speech-complete');
    } catch (error) {
      if (sessionId !== voiceInput.sessionId || voiceInput.stopRequested) return;
      renderVoiceInputState('error', error?.message || 'Voice input could not continue. Your response is still here, and typing stays available.');
    }
  };

  const startSpeechmaticsTypingInput = async () => {
    if (!browserCanRecordVoice()) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (state.view !== 'course' || state.progress.phase !== 'type') {
        stream.getTracks().forEach((track) => track.stop());
        return true;
      }
      const sessionId = ++voiceInput.sessionId;
      const mimeType = supportedRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      voiceInput.stopRequested = false;
      voiceInput.initialResponse = state.progress.attempt.response.trim();
      voiceInput.recorder = recorder;
      voiceInput.stream = stream;
      voiceInput.chunks = [];
      voiceInput.startedAt = window.performance.now();
      voiceInput.recorderStopping = false;
      recorder.addEventListener('dataavailable', (event) => {
        if (sessionId === voiceInput.sessionId && event.data?.size) voiceInput.chunks.push(event.data);
      });
      recorder.addEventListener('stop', () => { void finishSpeechmaticsTypingInput(sessionId); }, { once: true });
      state.progress.attempt.inputMethod = 'voice';
      state.progress.attempt.alternativeInput = true;
      recordUnifiedBehaviourAction('speech-start');
      recorder.start(250);
      clearSpeechmaticsTypingTimer();
      voiceInput.recordingTimer = window.setTimeout(() => stopSpeechmaticsTypingInput(), 45000);
      renderVoiceInputState('listening', 'Listening. Select Finish when you are done speaking to add your text.');
      announce('Microphone input is listening.');
      return true;
    } catch (error) {
      renderVoiceInputState('permission-denied', error?.name === 'NotAllowedError'
        ? 'Allow microphone access for this site, or type your response instead.'
        : 'Voice input could not start. You can type your response instead.');
      return true;
    }
  };

  const speechmaticsTypingIsReady = async () => {
    if (!authenticatedUser || authenticatedUser.isGuest || !browserCanRecordVoice()) return false;
    try {
      const status = await getCourseAiStatus();
      return Boolean(status?.speechToText?.available);
    } catch (_) {
      return false;
    }
  };

  const startVoiceInput = async () => {
    if (!typingAllowsVoiceInput()) {
      announce(signedInLearner()
        ? 'Voice input is not available for this activity.'
        : 'Log in required to use Speechmatics voice input.');
      return;
    }
    // For signed-in learners use the explicit recording route first. It works
    // consistently across Firefox and Chromium and never leaves Brave in a
    // reconnecting state that appears active without adding text.
    if (await speechmaticsTypingIsReady()) {
      await startSpeechmaticsTypingInput();
      return;
    }
    if (voiceRecognitionConstructor()) {
      startBrowserVoiceInput('Live browser recognition is a fallback. It will listen once and never reconnect repeatedly.');
      return;
    }
    renderVoiceInputState('error', 'Voice input is not connected in this browser right now. You can type your response instead.');
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
        ? courseUi('This activity checks the visible typing practice sentence. It does not measure speed.', 'یہ سرگرمی نظر آنے والے ٹائپنگ مشق کے جملے کو جانچتی ہے۔ اس میں رفتار نہیں ناپی جاتی۔')
        : courseUi('This activity checks your idea, not spelling or handwriting. You can use a typed, speech-to-text, or other valid response when the option is available.', 'یہ سرگرمی آپ کے خیال کو جانچتی ہے، ہجے یا لکھائی کو نہیں۔ جہاں اختیار دستیاب ہو وہاں ٹائپ کیا ہوا، آواز سے متن، یا دوسرا موزوں جواب استعمال کیا جا سکتا ہے۔');
      practice.querySelector('#typing-help')?.insertAdjacentElement('afterend', objective);
    }
    if (typingIsAccuracyObjective() && state.preferences.alternativeInput && !practice.querySelector('[data-typing-objective-note]')) {
      const note = document.createElement('p');
      note.className = 'course-input-help';
      note.dataset.typingObjectiveNote = '';
      note.textContent = courseUi('This is a keyboard typing practice, so the visible sentence stays the learning objective. Your device’s keyboard, switch, and one-handed input can still be used.', 'یہ کی بورڈ ٹائپنگ کی مشق ہے، اس لیے نظر آنے والا جملہ ہی سیکھنے کا مقصد رہتا ہے۔ آپ اپنے آلے کا کی بورڈ، سوئچ، اور ایک ہاتھ سے اِن پٹ پھر بھی استعمال کر سکتے ہیں۔');
      practice.querySelector('#typing-help')?.insertAdjacentElement('afterend', note);
    }
    if (typingAllowsAlternativeInput() && !practice.querySelector('[data-alternative-input-note]')) {
      const note = document.createElement('p');
      note.className = 'course-input-help';
      note.dataset.alternativeInputNote = '';
      note.textContent = courseUi('Alternative input changes how a response is entered, not what makes it valid. An authored input route appears beside the field only when this activity provides one.', 'متبادل اِن پٹ صرف جواب درج کرنے کا طریقہ بدلتا ہے، اس کی درستی نہیں۔ جب سرگرمی میں اختیار موجود ہو تو جواب کے خانے کے پاس مناسب راستہ ظاہر ہوتا ہے۔');
      practice.querySelector('#typing-help')?.insertAdjacentElement('afterend', note);
    }
    if (typingAllowsAlternativeResponse() && !practice.querySelector('[data-alternative-response-note]')) {
      const note = document.createElement('p');
      note.className = 'course-input-help';
      note.dataset.alternativeResponseNote = '';
      note.textContent = courseUi('Alternative response formats change the form of an answer only when the learning objective and authored activity allow it. This activity still checks the same concept.', 'متبادل جواب کی صورت صرف اسی وقت بدلی جاتی ہے جب سیکھنے کا مقصد اور سرگرمی اس کی اجازت دیں۔ یہ سرگرمی پھر بھی اسی خیال کو جانچتی ہے۔');
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
      notice.textContent = courseUi(
        'This screen keeps one task visible. Next: ' + courseNextStepCopy() + '.',
        'اس اسکرین پر ایک کام نظر آتا ہے۔ اگلا: ' + courseNextStepCopy() + '۔'
      );
      workspace.querySelector('.course-now-panel')?.insertAdjacentElement('afterend', notice);
    }
    if (state.preferences.literalInstructions) {
      const top = app.querySelector('.course-task-top > div');
      if (top && !top.querySelector('[data-literal-instruction]')) {
        const instruction = document.createElement('p');
        instruction.className = 'course-literal-instruction';
        instruction.dataset.literalInstruction = '';
        instruction.innerHTML = courseUsesUrdu()
          ? '<strong>یہ کریں:</strong> ' + escapeHtml(taskLabel()) + '۔ <strong>یہاں مکمل کریں:</strong> ' + escapeHtml(courseNextStepCopy()) + '۔'
          : '<strong>Do this:</strong> ' + escapeHtml(taskLabel()) + '. <strong>Finish when:</strong> ' + escapeHtml(courseNextStepCopy()) + '.';
        top.append(instruction);
      }
    }
    const taskCard = app.querySelector('.course-task-card');
    if (taskCard && state.preferences.extraHints && currentStep()?.hint && !taskCard.querySelector('[data-extra-hint]')) {
      const hint = document.createElement('details');
      hint.className = 'course-extra-hint';
      hint.dataset.extraHint = '';
      const hintCopy = courseUsesUrdu() ? (urduStep()?.hint || '') : currentStep().hint;
      hint.innerHTML = '<summary>' + escapeHtml(courseUi('Optional hint', 'اختیاری اشارہ')) + '</summary><p>' + escapeHtml(urduScriptTerms(hintCopy)) + '</p>';
      taskCard.querySelector('.course-task-top')?.insertAdjacentElement('afterend', hint);
    }
    if (taskCard && !taskCard.querySelector('[data-input-access-note]') && (state.preferences.switchInput || state.preferences.keyboardShortcuts)) {
      const note = document.createElement('p');
      note.className = 'course-input-access-note';
      note.dataset.inputAccessNote = '';
      const messages = [];
      if (state.preferences.switchInput) messages.push(courseUi('Switch input is on: use Tab to move between controls, then Space or Enter to activate the focused control.', 'سوئچ اِن پٹ فعال ہے: کنٹرولز کے درمیان جانے کے لیے ٹیب استعمال کریں، پھر منتخب کنٹرول چلانے کے لیے اسپیس یا اِنٹر دبائیں۔'));
      if (state.preferences.keyboardShortcuts) messages.push(courseUi('Keyboard shortcuts are on: Alt+P opens Pause and save; Alt+H opens I’m stuck.', 'کی بورڈ شارٹ کٹس فعال ہیں: آلٹ کے ساتھ پی سے وقفہ اور محفوظ کریں کھلتا ہے؛ آلٹ کے ساتھ ایچ سے مدد کھلتی ہے۔'));
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
        note.textContent = courseUi('Written lesson text stays visible while optional text to speech plays.', 'اختیاری آواز چلتے وقت بھی سبق کا تحریری متن نظر آتا رہتا ہے۔');
        reading.insertAdjacentElement('beforebegin', note);
      }
    }
    app.querySelectorAll('.course-progress-panel').forEach((panel) => {
      if (!numericProgressIsReduced()) return;
      panel.querySelector('strong')?.replaceChildren(document.createTextNode(courseUi('One small step at a time', 'ایک وقت میں ایک مختصر مرحلہ')));
      panel.querySelectorAll('.course-progress-bars span').forEach((label, index) => {
        label.textContent = index === 0
          ? courseUi('Current learning step', 'سیکھنے کا موجودہ مرحلہ')
          : (isFinalExamPhase() ? courseUi('Saved course progress', 'محفوظ کورس کی پیش رفت') : courseUi('Course progress', 'کورس کی پیش رفت'));
      });
    });
    app.querySelectorAll('[data-action="show-example"]').forEach((button) => {
      button.textContent = shouldShowExample() ? courseUi('Hide examples', 'مثالیں چھپائیں') : courseUi('Show examples', 'مثالیں دکھائیں');
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
    notice.innerHTML = bilingualCopy(COURSE.contentNotice, COURSE_URDU.contentNotice);
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
    title.innerHTML = bilingualCopy(COURSE.conclusion.title, COURSE_URDU.conclusion.title);
    conclusion.append(title);
    COURSE.conclusion.paragraphs.forEach((paragraph, index) => {
      const copy = document.createElement('p');
      copy.innerHTML = bilingualCopy(paragraph, COURSE_URDU.conclusion.paragraphs[index]);
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
      if (moduleCopy) {
        moduleCopy.textContent = courseUi(
          COURSE.steps.length + ' small modules · one final exam',
          COURSE.steps.length + ' مختصر ماڈیولز · ایک آخری امتحان'
        );
      }
    }
  };

  const syncNarrationVoiceOptions = () => {
    const select = app.querySelector('[data-narration-voice]');
    if (!select) return;
    select.innerHTML = narrationVoiceOptions();
    select.value = effectiveNarrationVoice();
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
        syncTaskNarrationControl();
        if (status === 'playing') announce('Text to speech started from the selected section.');
        else if (status === 'paused') announce('Text to speech paused.');
        else if (status === 'finished') {
          recordUnifiedBehaviourAction('tts-complete');
          announce('Text to speech finished.');
        }
        else if (status === 'unsupported') announce('Text to speech is not available in this browser. You can use your device’s usual reading support.');
        else if (status === 'error') announce('Text to speech could not continue. The lesson text is still available to read.');
      },
      onChunkChange: (index) => {
        narration.activeIndex = index;
        narration.activeRange = index >= 0 ? { index, start: 0, end: 0 } : null;
        syncNarrationUi();
        syncTaskNarrationControl();
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
        syncTaskNarrationControl();
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
    // A human upload can fail or expire. Preserve browser text-to-speech as
    // the documented fallback; bundled Ava narration remains recorded-only.
    service.setRecordedAudioOnly?.(usesLocalAvaNarration());
    service.configure({
      rate: state.preferences.narrationSpeed,
      voiceURI: effectiveNarrationVoice(),
      volume: Number(state.preferences.narrationVolume)
    });
    narration.activeIndex = -1;
    narration.activeRange = null;
    service.stop({ silent: true });
    const readingTask = state.view === 'course' && (state.progress.phase === 'read' || isReviewingModule());
    if (readingTask) {
      const currentAudioKey = COURSE_AUDIO_MODULE_KEYS[displayedModuleIndex()];
      const currentAssets = COURSE_AUDIO_MANIFEST.modules?.[currentAudioKey];
      if (courseUsesUrdu()) {
        const plan = taskNarrationPlan();
        narration.chunks = plan.chunks;
        service.setChunks(narration.chunks);
        service.setAudioPlaylist(plan.playlist);
        const currentSources = [...new Set(plan.playlist.map((track) => track.src).filter(Boolean))];
        preloadCurrentNarrationSources(currentSources);
        service.preloadAudioSources?.(currentSources);
      } else {
        narration.chunks = renderedNarrationChunks();
        if (!narration.chunks.length) narration.chunks = readingNarrationChunks();
        service.setChunks(narration.chunks);
        // This calls the service's page-level preloader even if Text-to-speech
        // is currently off, so the included Ava file is ready on demand.
        configureLocalAvaPlaylist(service, narration.chunks);
        // Mapping deliberately refuses to play a full recording when the
        // visible excerpt no longer matches it. That safety rule must not stop
        // us from warming the verified module files for a later matching view.
        const currentSources = [currentAssets?.read, currentAssets?.simpleAddon];
        preloadCurrentNarrationSources(currentSources);
        service.preloadAudioSources?.(currentSources);
      }
      preloadNextModuleNarration();
    } else if (state.view === 'course' && state.progress.phase === 'type') {
      const plan = typingAudioNarrationPlan();
      narration.chunks = plan.chunks;
      service.setChunks(narration.chunks);
      // Guided typing manages one character at a time rather than using a
      // sequential playlist. Its intro plus both voices for every required
      // character warm before the learner presses Play.
      service.setAudioPlaylist(plan.playlist);
      preloadCurrentNarrationSources(plan.sources);
      service.preloadAudioSources?.(plan.sources);
      preloadNextModuleNarration();
    } else {
      narration.chunks = [];
      service.setAudioPlaylist?.([]);
    }
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

  const startNarration = async (index) => {
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
      await ensureReviewedNarrationForCurrentTask();
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
    recordUnifiedBehaviourAction('tts-start');
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

  const startNarrationFromChunkPoint = async (requestedIndex, requestedOffset = 0) => {
    if (!state.preferences.readAloud || state.view !== 'course' || (state.progress.phase !== 'read' && !isReviewingModule())) return;
    if (!Number.isInteger(requestedIndex)) return;
    const service = ensureNarrationService();
    await ensureReviewedNarrationForCurrentTask();
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
    void startNarrationFromChunkPoint(point.index, point.characterOffset);
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
    // Playful has its own friendly, illustrated encouragement panel inside
    // the task. Keeping it in the reading flow gives the celebration a home
    // without covering the course heading or the learner's next control.
    const isPlayfulScheme = learningChoices()['website-scheme'] === 'playful';
    // A visible mascot already gives encouragement a stable surface. Keep the
    // written moment inside the task instead of layering a popup over it.
    const isPopup = moment.encouragementLevel !== 'subtle' && !isPlayfulScheme && !mascotCanAppear();
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
    // The colourful Playful scheme deliberately uses the inline treatment:
    // an acknowledgement should decorate the task, never float over it.
    const popupPresentation = moment.encouragementLevel !== 'subtle'
      && learningChoices()['website-scheme'] !== 'playful'
      && !mascotCanAppear();
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
    'return-course', 'return-to-read', 'simple-read', 'return-from-module-review',
    'guest-skip-module', 'guest-previous-module'
  ]);

  const routeMotionKind = (action) => {
    if (['preview-complete', 'read-complete', 'next-reading-section', 'simple-read', 'return-to-read'].includes(action)) return 'reading';
    if (['check-typing'].includes(action)) return 'typing';
    if (['submit-check', 'continue-check', 'submit-exam-answer', 'next-exam-question', 'start-understanding-check', 'resume-understanding-check', 'submit-understanding-check'].includes(action)) return 'question';
    if (['submit-apply', 'continue-apply'].includes(action)) return 'applied';
    if (['next-step', 'start-final-exam', 'start-final-understanding-check', 'finish-understanding-check', 'return-course'].includes(action)) return 'milestone';
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
    understandingCheck.run?.runId || state.progress.assessmentRunId || '',
    understandingCheck.run?.questionPosition || 0,
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
    addGuestModuleNavigation();
    buildTypingTester();
    applyRenderedSupportBehavior();
    prepareNarrationForRenderedTask();
    enhanceQuizPresentation();
    enhanceSupportMomentPresentation();
    enhancePageEntranceMotion();
  };

  const renderTask = () => isReviewingModule()
    ? reviewModuleTask()
    : ({ preview: previewTask, read: readTask, type: typingTask, check: checkTaskWithFeedback, apply: applyTaskWithFeedback, assessment: understandingCheckTask, complete: completionTask, 'exam-intro': finalExamIntroTask, exam: finalExamQuestionTask, 'exam-results': finalExamResultsTask }[state.progress.phase] || previewTask)();

  const courseProgressBar = () => '<section class="course-progress-panel" aria-label="' + escapeHtml(courseUi('Learning progress', 'سیکھنے کی پیش رفت')) + '"><div><p>' + escapeHtml(courseUi('Course progress', 'کورس کی پیش رفت')) + '</p><strong>' + escapeHtml(courseUi('Step ' + (state.progress.lessonIndex + 1) + ' of ' + COURSE.steps.length, 'مرحلہ ' + (state.progress.lessonIndex + 1) + ' از ' + COURSE.steps.length)) + '</strong><span>' + escapeHtml(courseUi('One small step at a time', 'ایک وقت میں ایک مختصر مرحلہ')) + '</span></div><div class="course-progress-bars"><div><span>' + escapeHtml(courseUi('Current step · Task ' + phaseNumber() + ' of ' + taskPhaseTotal(), 'موجودہ مرحلہ · کام ' + phaseNumber() + ' از ' + taskPhaseTotal())) + '</span><progress value="' + phaseNumber() + '" max="' + taskPhaseTotal() + '">' + escapeHtml(courseUi(phaseNumber() + ' of ' + taskPhaseTotal(), phaseNumber() + ' از ' + taskPhaseTotal())) + '</progress></div><div><span>' + escapeHtml(courseUi('Course · ' + state.progress.completedSteps.length + ' lessons completed', 'کورس · ' + state.progress.completedSteps.length + ' اسباق مکمل')) + '</span><progress value="' + state.progress.completedSteps.length + '" max="' + COURSE.steps.length + '">' + escapeHtml(courseUi(state.progress.completedSteps.length + ' of ' + COURSE.steps.length, state.progress.completedSteps.length + ' از ' + COURSE.steps.length)) + '</progress></div></div></section>';

  const helpDetail = () => {
    const step = currentStep();
    const option = state.helpOption;
    if (!option) return '<p class="help-placeholder">' + courseUi('Choose the kind of help that would make the next step clearer. You can change your mind at any time.', 'وہ مدد منتخب کریں جو اگلے مرحلے کو زیادہ واضح بنائے۔ آپ کسی بھی وقت اپنا فیصلہ بدل سکتے ہیں۔') + '</p>';
    const urdu = urduStep();
    if (courseUsesUrdu()) {
      const urduContent = {
        simple: ['آسان وضاحت', urdu?.simple],
        example: ['ایک مثال', urdu?.example],
        smaller: ['چھوٹے مرحلے', '1۔ ایک پیراگراف پڑھیں۔ 2۔ نمایاں خیال نوٹ کریں۔ 3۔ آگے بڑھنے کے لیے بٹن استعمال کریں۔ اس وقت آپ کو صرف یہی ایک کام کرنا ہے۔'],
        hint: ['نرم اشارہ', urdu?.hint],
        retry: ['دوبارہ کوشش کریں', 'اس سے صرف موجودہ مختصر سرگرمی دوبارہ شروع ہوتی ہے۔ مکمل کیے گئے کورس کے مراحل محفوظ رہتے ہیں۔'],
        break: ['مختصر وقفہ لیں', 'آپ کا کام محفوظ ہے۔ جب تیار ہوں تو آپ یہ صفحہ بند کر سکتے ہیں یا سیکھنے کے خلاصے پر واپس جا سکتے ہیں۔']
      }[option];
      return '<div class="help-detail" lang="ur" dir="rtl"><strong>' + escapeHtml(urduContent[0]) + '</strong><p>' + escapeHtml(urduContent[1] || '') + '</p>' + (option === 'break' ? '<button class="course-primary-button" type="button" data-action="save-exit">محفوظ کریں اور باہر جائیں</button>' : '') + '</div>';
    }
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

  const stuckSupportChoices = () => {
    const urdu = courseUsesUrdu();
    const options = urdu
      ? [
        ['instruction', 'میں ہدایت نہیں سمجھ رہا/رہی'],
        ['too-large', 'یہ مرحلہ بہت بڑا لگ رہا ہے'],
        ['difficult-words', 'الفاظ مشکل ہیں'],
        ['starting', 'مجھے شروع کرنا نہیں آ رہا'],
        ['too-much-on-screen', 'اسکرین پر بہت زیادہ ہے'],
        ['worried-about-wrong', 'مجھے غلط ہونے کی فکر ہے']
      ]
      : [
        ['instruction', 'I do not understand the instruction'],
        ['too-large', 'The step feels too large'],
        ['difficult-words', 'The words are difficult'],
        ['starting', 'I do not know how to start'],
        ['too-much-on-screen', 'There is too much on screen'],
        ['worried-about-wrong', 'I am worried about getting it wrong']
      ];
    // ADAPTIVE LEARNING: a learner can choose a concrete barrier first, or
    // open the bounded page-specific conversation when they would rather ask
    // a question in their own words. Both paths keep the current task intact.
    const talkToAi = '<button class="course-barrier-talk-ai" type="button" data-action="help-open-ai"' + (adaptiveRecall.loading ? ' disabled' : '') + '>' + escapeHtml(urdu ? 'کورس اے آئی سے بات کریں' : 'Talk to Course AI') + '</button>';
    return '<div class="help-choice-grid course-barrier-choice-grid">' + options.map(([value, label]) => '<button type="button" data-action="adaptive-barrier" data-barrier="' + value + '"' + (adaptiveRecall.loading ? ' disabled' : '') + '>' + escapeHtml(label) + '</button>').join('') + talkToAi + '</div>';
  };

  const stuckModalMarkup = () => {
    const urdu = courseUsesUrdu();
    const title = urdu ? 'مجھے مدد چاہیے' : 'I’m stuck';
    const intro = urdu
      ? 'ایک رکاوٹ منتخب کریں۔ مدد صرف اس موجودہ مرحلے کو آسان بنائے گی؛ آپ کا سبق تبدیل نہیں ہوگا۔'
      : 'Choose what is getting in the way. Support will adapt only this current step; it will not change your lesson.';
    return '<div class="course-modal-backdrop" role="presentation"><section class="course-modal course-help-modal course-adaptive-help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"' + (urdu ? ' lang="ur" dir="rtl"' : '') + '><button class="course-modal-close" type="button" data-action="close-modal" aria-label="' + escapeHtml(urdu ? 'مدد کا ڈائیلاگ بند کریں' : 'Close support dialog') + '">×</button><p class="course-eyebrow">' + escapeHtml(urdu ? 'موجودہ مرحلے کی مدد' : 'Current-step support') + '</p><h2 id="help-title" tabindex="-1">' + escapeHtml(title) + '</h2><p>' + escapeHtml(intro) + '</p>' + stuckSupportChoices() + adaptiveResultMarkup({ compact: true }) + '</section></div>';
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
    return '<div class="course-explain-sections"><section><h3>What this step is for</h3><p>' + escapeHtml(details.purpose) + '</p></section><section><h3>A clear way to do it</h3><ol>' + details.steps.map((step) => '<li>' + escapeHtml(step) + '</li>').join('') + '</ol></section><section class="course-explain-support"><h3>If you need a little more support</h3><p>' + escapeHtml(details.support) + '</p></section></div>';
  };

  const renderModal = () => {
    if (!state.modal) return '';
    if (state.modal === 'guest-ai') {
      const urdu = courseUsesUrdu();
      return '<div class="course-modal-backdrop" role="presentation"><section class="course-modal course-help-modal" role="dialog" aria-modal="true" aria-labelledby="guest-ai-title"' + (urdu ? ' lang="ur" dir="rtl"' : '') + '><button class="course-modal-close" type="button" data-action="close-modal" aria-label="' + escapeHtml(urdu ? 'پیغام بند کریں' : 'Close message') + '">×</button><p class="course-eyebrow">' + escapeHtml(urdu ? 'مہمان موڈ' : 'Guest mode') + '</p><h2 id="guest-ai-title" tabindex="-1">' + escapeHtml(urdu ? 'کورس اے آئی کے لیے سائن اِن کریں' : 'Sign in to use Course AI') + '</h2><p>' + escapeHtml(urdu ? 'مہمان موڈ میں آپ کا سیکھنا نجی طور پر اس براؤزر میں رہتا ہے۔ کورس اے آئی اور اس کے پیغامات استعمال کرنے کے لیے سائن اِن درکار ہے۔ موجودہ مرحلے کی مدد، مثالیں اور وضاحتیں پھر بھی دستیاب ہیں۔' : 'Guest learning stays private to this browser. Sign in to use Course AI and send a message. Current-step help, examples, and explanations are still available.') + '</p><div class="course-modal-actions"><a class="course-primary-button" href="/login/?next=' + encodeURIComponent(window.location.pathname + window.location.search) + '">' + escapeHtml(urdu ? 'سائن اِن کریں' : 'Sign in') + '</a><button class="course-secondary-button" type="button" data-action="close-modal">' + escapeHtml(urdu ? 'سیکھتے رہیں' : 'Keep learning') + '</button></div></section></div>';
    }
    if (state.modal === 'ai-chat') {
      // On compact screens this is a dedicated full-screen course view rather
      // than a squeezed modal. The learner can return without losing the
      // course state or the bounded in-memory chat session.
      return '<div class="course-ai-page-backdrop" data-course-ai-page role="presentation"><section class="course-ai-page" role="dialog" aria-modal="true" aria-labelledby="course-ai-chat-title">' + courseAiChatMarkup('page') + '</section></div>';
    }
    if (state.modal === 'help') return stuckModalMarkup();
    if (courseUsesUrdu()) {
      if (state.modal === 'pause') return '<div class="course-modal-backdrop" role="presentation"><section class="course-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title" lang="ur" dir="rtl"><button class="course-modal-close" type="button" data-action="close-modal" aria-label="وقفے کا ڈائیلاگ بند کریں">×</button><p class="course-eyebrow">وقفہ کریں اور محفوظ کریں</p><h2 id="pause-title" tabindex="-1">آپ کی پیش رفت محفوظ ہے۔</h2><p>جب آپ تیار ہوں واپس آ سکتے ہیں۔ آپ «' + escapeHtml(courseReturnLocation()) + '» پر واپس آئیں گے۔</p><div class="course-modal-actions"><button class="course-secondary-button" type="button" data-action="close-modal">سیکھتے رہیں</button><button class="course-primary-button" type="button" data-action="save-exit">محفوظ کریں اور باہر جائیں</button></div></section></div>';
      if (state.modal === 'explain') {
        const urdu = urduStep();
        return '<div class="course-modal-backdrop" role="presentation"><section class="course-modal course-explain-modal" role="dialog" aria-modal="true" aria-labelledby="explain-title" lang="ur" dir="rtl"><button class="course-modal-close" type="button" data-action="close-modal" aria-label="وضاحت بند کریں">×</button><p class="course-eyebrow">مرحلے کی مدد</p><h2 id="explain-title" tabindex="-1">یہ مرحلہ سمجھائیں</h2><p class="course-explain-intro">یہ سامنے موجود کام کے لیے ایک پُرسکون رہنمائی ہے۔ آپ کا موجودہ کام اپنی جگہ محفوظ رہتا ہے۔</p><div class="course-explain-sections"><section><h3>اس مرحلے کا مقصد</h3><p>ایک وقت میں ایک واضح خیال پر توجہ دیں، اپنی رفتار سے پڑھیں اور جب تیار ہوں تو آگے بڑھیں۔</p></section><section><h3>اسے کرنے کا آسان طریقہ</h3><ol><li>اس صفحے کا صرف موجودہ حصہ دیکھیں۔</li><li>اہم خیال پر توجہ دیں؛ ہر لفظ یاد رکھنا ضروری نہیں۔</li><li>ضرورت ہو تو آسان وضاحت، مثال یا مدد کے اختیارات استعمال کریں۔</li></ol></section><section class="course-explain-support"><h3>اگر مزید مدد چاہیے</h3><p>' + escapeHtml(urdu?.hint || urdu?.simple || 'ایک وقت میں ایک چھوٹا مرحلہ کافی ہے۔') + '</p></section></div><div class="course-modal-actions"><button class="course-primary-button" type="button" data-action="close-modal">اس مرحلے پر واپس جائیں</button></div></section></div>';
      }
      return '<div class="course-modal-backdrop" role="presentation"><section class="course-modal course-help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" lang="ur" dir="rtl"><button class="course-modal-close" type="button" data-action="close-modal" aria-label="مدد کا ڈائیلاگ بند کریں">×</button><p class="course-eyebrow">مدد کے اختیارات</p><h2 id="help-title" tabindex="-1">مجھے مدد چاہیے</h2><p>سبق چھوڑے بغیر سنبھلنے کا ایک طریقہ منتخب کریں۔</p><div class="help-choice-grid"><button type="button" data-action="help" data-help-option="simple">مزید آسان الفاظ میں سمجھائیں</button><button type="button" data-action="help" data-help-option="example">ایک مثال دکھائیں</button><button type="button" data-action="listen">اسے بلند آواز سے پڑھیں</button><button type="button" data-action="help" data-help-option="smaller">اسے چھوٹے مرحلوں میں تقسیم کریں</button><button type="button" data-action="help" data-help-option="hint">مجھے اشارہ دیں</button><button type="button" data-action="help" data-help-option="retry">مجھے دوبارہ کوشش کرنے دیں</button><button type="button" data-action="help" data-help-option="break">مختصر وقفہ لیں</button></div>' + helpDetail() + '</section></div>';
    }
    if (state.modal === 'pause') return '<div class="course-modal-backdrop" role="presentation"><section class="course-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title"><button class="course-modal-close" type="button" data-action="close-modal" aria-label="Close pause dialog">×</button><p class="course-eyebrow">Pause and save</p><h2 id="pause-title" tabindex="-1">Your progress is saved.</h2><p>You can come back whenever you’re ready. You will return to ' + escapeHtml(courseReturnLocation()) + '.</p><div class="course-modal-actions"><button class="course-secondary-button" type="button" data-action="close-modal">Keep learning</button><button class="course-primary-button" type="button" data-action="save-exit">Save and exit</button></div></section></div>';
    if (state.modal === 'explain') return '<div class="course-modal-backdrop" role="presentation"><section class="course-modal course-explain-modal" role="dialog" aria-modal="true" aria-labelledby="explain-title"><button class="course-modal-close" type="button" data-action="close-modal" aria-label="Close course support">×</button><p class="course-eyebrow">Course support</p><h2 id="explain-title" tabindex="-1">Support for this step</h2><p class="course-explain-intro">Here is a calm guide for the task in front of you. Your current work stays in place.</p>' + explainStepMarkup() + '<div class="course-modal-actions"><button class="course-primary-button" type="button" data-action="close-modal">Return to this step</button></div></section></div>';
    return '<div class="course-modal-backdrop" role="presentation"><section class="course-modal course-help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button class="course-modal-close" type="button" data-action="close-modal" aria-label="Close help dialog">×</button><p class="course-eyebrow">Support options</p><h2 id="help-title" tabindex="-1">I’m stuck</h2><p>Choose one way to recover without leaving your lesson.</p><div class="help-choice-grid"><button type="button" data-action="help" data-help-option="simple">Explain more simply</button><button type="button" data-action="help" data-help-option="example">Show an example</button><button type="button" data-action="listen">Read this aloud</button><button type="button" data-action="help" data-help-option="smaller">Break this into smaller steps</button><button type="button" data-action="help" data-help-option="hint">Give me a hint</button><button type="button" data-action="help" data-help-option="retry">Let me try again</button><button type="button" data-action="help" data-help-option="break">Take a short break</button></div>' + helpDetail() + '</section></div>';
  };

  const prepareModalAccessibility = () => {
    const backdrop = app.querySelector('.course-modal-backdrop, .course-ai-page-backdrop');
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
      // 3D rollback reference: the complete Three.js implementation remains
      // untouched in mascot-3d.js and can be restored with this loader.
      // mascotControllerLoad = import('./mascot-3d.js?v=20260802-motion8')
      //   .then(({ createCourseMascot }) => {
      //     courseMascot = createCourseMascot();
      //     return courseMascot;
      //   })
      //   .catch(() => null);
      mascotControllerLoad = import('./mascot-2d.js?v=20260825-role-states1')
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
      // fetched. Never attach the companion to a detached page fragment.
      if (!mascot || !stage.isConnected || stage !== app.querySelector('[data-course-mascot-stage]') || !mascotCanAppear()) return;
      mascot.mount(stage, { ...mascotPresentation, reducedMotion, scene, location: state.view });
      if (supportMoment && activeSupportMoment?.id === supportMoment.id && supportMoment.id !== lastMascotSupportEventId) {
        mascot.react(supportMoment);
        lastMascotSupportEventId = supportMoment.id;
        lastMascotScene = scene;
      }
    });
  };

  const URDU_UI_COPY = {
    'Pause & save': 'وقفہ کریں اور محفوظ کریں',
    '← Back to learning overview': 'سیکھنے کے خلاصے پر واپس جائیں ←',
    'Back to learning overview': 'سیکھنے کے خلاصے پر واپس جائیں',
    'Saved locally': 'مقامی طور پر محفوظ ہے',
    'Saving unavailable': 'محفوظ کرنا دستیاب نہیں',
    'Course progress': 'کورس کی پیش رفت',
    'Course modules': 'کورس کے ماڈیولز',
    'Final exam': 'آخری امتحان',
    'Completed': 'مکمل',
    'Available next': 'اگلا دستیاب',
    'Preview this small step': 'اس مختصر مرحلے کا جائزہ',
    'Read this short explanation': 'یہ مختصر وضاحت پڑھیں',
    'Type the current lesson section': 'موجودہ سبق کا حصہ ٹائپ کریں',
    'Check understanding': 'سمجھ جانچیں',
    'Use the idea in a small situation': 'خیال کو مختصر صورتحال میں استعمال کریں',
    'Reviewing now': 'اب جائزہ لیا جا رہا ہے',
    'Continue': 'جاری رکھیں',
    'Show examples': 'مثالیں دکھائیں',
    'Hide examples': 'مثالیں چھپائیں',
    'Previous section': 'پچھلا حصہ',
    'Next section': 'اگلا حصہ',
    'Submit answer': 'جواب جمع کریں',
    'Choose another answer': 'دوسرا جواب منتخب کریں',
    'Read this step again': 'یہ مرحلہ دوبارہ پڑھیں',
    'Explain more simply': 'مزید آسان الفاظ میں سمجھائیں',
    'Complete this step': 'یہ مرحلہ مکمل کریں',
    'Save and exit': 'محفوظ کریں اور باہر جائیں',
    'Keep learning': 'سیکھتے رہیں',
    'Return to this step': 'اس مرحلے پر واپس جائیں',
    'Start final exam': 'آخری امتحان شروع کریں',
    'Next question': 'اگلا سوال',
    'See final results': 'آخری نتائج دیکھیں',
    'Return to learning overview': 'سیکھنے کے خلاصے پر واپس جائیں',
    'Question-by-question review': 'سوال بہ سوال جائزہ',
    'Correct': 'درست',
    'Correct answer': 'درست جواب',
    'Not correct': 'درست نہیں',
    'Pause and save': 'وقفہ کریں اور محفوظ کریں',
    'Your progress is saved.': 'آپ کی پیش رفت محفوظ ہے۔',
    'Step support': 'مرحلے کی مدد',
    'I’m stuck': 'مجھے مدد چاہیے',
    'Support options': 'مدد کے اختیارات',
    'I’m stuck': 'میں رُک گیا/گئی ہوں',
    'Show an example': 'ایک مثال دکھائیں',
    'Read this aloud': 'اسے بلند آواز سے پڑھیں',
    'Break this into smaller steps': 'اسے چھوٹے مرحلوں میں تقسیم کریں',
    'Give me a hint': 'مجھے اشارہ دیں',
    'Let me try again': 'مجھے دوبارہ کوشش کرنے دیں',
    'Take a short break': 'مختصر وقفہ لیں',
    'Close settings': 'ترتیبات بند کریں',
    'Sign out': 'سائن آؤٹ',
    'Starting language': 'ابتدائی زبان',
    'Choose the mascot language you would like to begin with.': 'وہ زبان منتخب کریں جس میں آپ آغاز کرنا چاہتے ہیں۔',
    'Website scheme': 'ویب سائٹ کی پیشکش',
    'Choose the overall presentation for your learning space. Calm keeps the current look; Playful is bright, colourful, and kid-friendly.': 'اپنی سیکھنے کی جگہ کے لیے ویب سائٹ کی پیشکش منتخب کریں۔ پُرسکون موجودہ انداز رکھتا ہے؛ کھیل کود رنگین اور بچوں کے لیے دوستانہ ہے۔',
    'Calm': 'پُرسکون',
    'Playful': 'کھیل کود',
    'Color style': 'رنگ کا انداز',
    'Choose how much color appears around the task.': 'منتخب کریں کہ کام کے گرد کتنا رنگ نظر آئے۔',
    'Page layout': 'صفحے کی ترتیب',
    'Choose how much space sits around one task.': 'منتخب کریں کہ ایک کام کے گرد کتنی جگہ ہو۔',
    'Encouragement': 'حوصلہ افزائی',
    'Choose how visible supportive moments feel.': 'منتخب کریں کہ حوصلہ افزا لمحات کتنے نمایاں ہوں۔',
    'Animations': 'حرکتیں',
    'Choose how much supportive movement you would like to see.': 'منتخب کریں کہ آپ کتنی معاون حرکت دیکھنا چاہتے ہیں۔',
    'Background noise': 'پس منظر کی آواز',
    'Optional looping sound. It always starts quietly.': 'اختیاری بار بار چلنے والی آواز۔ یہ ہمیشہ آہستہ شروع ہوتی ہے۔',
    'Text to speech': 'متن کو آواز میں پڑھنا',
    'Keep optional read-aloud support available. It will not play by itself.': 'اختیاری بلند آواز میں پڑھنے کی مدد دستیاب رکھیں۔ یہ خود بخود نہیں چلے گی۔',
    'Mascot': 'میسکوٹ',
    'Show your learning companion during this course.': 'اس کورس کے دوران اپنے سیکھنے کے ساتھی کو دکھائیں۔',
    'Mascot language': 'میسکوٹ کی زبان',
    'This can match or differ from your learning language.': 'یہ آپ کی سیکھنے کی زبان جیسی یا اس سے مختلف ہو سکتی ہے۔',
    'Mascot Speech': 'میسکوٹ کی گفتگو',
    'Choose how your mascot will communicate with you.': 'منتخب کریں کہ میسکوٹ آپ سے کس طرح گفتگو کرے گا۔',
    'Mascot voice': 'میسکوٹ کی آواز',
    'Choose the language your mascot will speak.': 'وہ زبان منتخب کریں جس میں میسکوٹ بولے گا۔',
    'Flat': 'سادہ', 'Balanced': 'متوازن', 'Vivid': 'نمایاں', 'Focused': 'توجہ کے ساتھ', 'Open': 'کھلی', 'Subtle': 'ہلکی', 'Expressive': 'نمایاں', 'Still': 'بغیر حرکت', 'Gentle': 'نرم', 'Lively': 'زیادہ', 'Off': 'بند', 'On': 'چالو', 'Text': 'متن', 'Speech': 'آواز', 'Both': 'دونوں'
  };

  const localizeRenderedUi = () => {
    if (!courseUsesUrdu()) return;
    const walker = document.createTreeWalker(app, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const parent = node.parentElement;
      if (!parent || parent.closest('.typing-target, textarea, .typing-tester-overlay, #typing-reference')) return;
      const source = node.nodeValue.trim();
      if (!source) return;
      const localized = URDU_UI_COPY[source] || urduScriptTerms(source);
      node.nodeValue = node.nodeValue.replace(source, localized);
    });
    app.querySelectorAll('.course-module-list li').forEach((item, index) => {
      const step = COURSE_URDU.steps[index];
      const title = item.querySelector('strong');
      if (step && title) title.textContent = urduScriptTerms(step.title);
    });
    const stripSummary = app.querySelector('.course-module-strip-heading > span');
    if (stripSummary) stripSummary.textContent = COURSE.steps.length + ' مختصر ماڈیولز · ایک آخری امتحان';
    app.querySelectorAll('[aria-label]').forEach((element) => {
      const source = element.getAttribute('aria-label');
      if (URDU_UI_COPY[source]) element.setAttribute('aria-label', URDU_UI_COPY[source]);
    });
  };

  const render = () => {
    cancelNarrationAutoScroll();
    stopTaskNarration({ silent: true });
    syncAiChatContext();
    if (state.view !== 'course' || state.progress.phase !== 'type' || isReviewingModule()) stopVoiceInput();
    applyPreferences();
    syncAdaptiveLearningTelemetry();
    // Session-only authored partner support stays available when consent is
    // off. It never uploads or calls a model in that case.
    if (!adaptiveLearningIsActive()) syncBehaviourContext({ requestAi: false });
    let content = '';
    if (state.view === 'dashboard') content = renderDashboard();
    else if (state.view === 'browse') content = renderBrowse();
    else if (state.view === 'saved') content = renderSavedWithFinalExam();
    else content = renderCourseWithFinalExam();
    app.innerHTML = renderShell(content);
    enhanceRenderedCourse();
    localizeRenderedUi();
    syncCourseMascot();
    prepareModalAccessibility();
  };

  mascotViewportQuery?.addEventListener?.('change', () => {
    if (authenticatedUser) {
      syncAiChatViewportSurface();
      render();
    }
  });
  mascotMotionQuery?.addEventListener?.('change', () => {
    if (authenticatedUser) {
      syncAiChatViewportSurface();
      render();
    }
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
    if (['course', 'dashboard', 'browse', 'saved'].includes(view)) window.requestAnimationFrame(() => {
      window.scrollTo?.({ left: 0, top: 0, behavior: 'auto' });
      if (view === 'course') {
        (document.getElementById('course-course-title') || document.getElementById('course-task-heading'))?.focus?.({ preventScroll: true });
      }
    });
  };

  const typingAccuracy = (target, response) => {
    const expected = Array.from(normaliseText(target).toLocaleLowerCase());
    const actual = Array.from(normaliseText(response).toLocaleLowerCase());
    const comparedLength = Math.max(expected.length, actual.length, 1);
    const matches = expected.reduce((total, character, index) => total + (character === actual[index] ? 1 : 0), 0);
    return (matches / comparedLength) * 100;
  };
  const clearTypingAutoSubmit = () => {
    if (typingAutoSubmitTimer === null) return;
    window.clearTimeout(typingAutoSubmitTimer);
    typingAutoSubmitTimer = null;
  };

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
    if (state.preferences.readAloud) stopTaskNarration({ silent: true });
    reading.innerHTML = readingContentMarkup(false);
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
    state.progress.finalExam.checking = false;
    state.progress.finalExam.lastResult = '';
    state.modal = '';
    recordSupportMoment('task-entry', { result: 'exam-question' });
    save();
    render();
    focusCurrentTask('#exam-question-card');
  };

  const checkReviewedManifestFinalAnswer = async (selectedIndex) => {
    const exam = state.progress.finalExam;
    try {
      const result = await checkReviewedCourseAnswer({
        user: authenticatedUser,
        courseId: COURSE.id,
        version: COURSE.version,
        scope: 'final',
        questionIndex: exam.questionIndex,
        language: courseUsesUrdu() ? 'ur' : 'en',
        selectedIndex,
        signal: requestTimeoutSignal(10000)
      });
      const accepted = result?.result === 'complete';
      exam.checking = false;
      exam.lastResult = accepted ? 'complete' : 'try-again';
      // A choice that needs another look stays editable. The browser receives
      // only that bounded outcome, never the correct option or answer key.
      exam.submitted = accepted;
      if (accepted) recordSupportMoment('section-complete', { result: 'reviewed-final-answer' });
      save();
      render();
      window.requestAnimationFrame(() => app.querySelector(accepted ? '[data-action="next-exam-question"]' : '[data-exam-answer]')?.focus?.({ preventScroll: true }));
    } catch (error) {
      exam.checking = false;
      exam.lastResult = '';
      exam.submitted = false;
      save(courseUi(
        'This reviewed answer could not be checked right now. Your choice is still here—try again when you are ready.',
        'اس منظور شدہ جواب کی ابھی جانچ نہیں ہو سکی۔ آپ کا انتخاب موجود ہے—جب تیار ہوں دوبارہ کوشش کریں۔'
      ));
      render();
    }
  };

  const submitFinalExamAnswer = () => {
    if (state.progress.phase !== 'exam') return;
    const exam = state.progress.finalExam;
    const question = currentFinalExamQuestion();
    const selected = exam.answers[exam.questionIndex];
    if (!question || exam.submitted || exam.checking || !Number.isInteger(selected) || !question.options[selected]) return;
    if (usesReviewedManifest()) {
      exam.checking = true;
      exam.lastResult = '';
      save();
      render();
      void checkReviewedManifestFinalAnswer(selected);
      return;
    }
    exam.submitted = true;
    // The legacy offline review is intentionally non-scoring. A server-backed
    // understanding check provides the guarded evaluation when enabled; this
    // fallback records the choice locally and never exposes correctness.
    recordSupportMoment('section-complete', { result: 'final-review' });
    save();
    render();
    window.requestAnimationFrame(() => app.querySelector('.course-task-actions button')?.focus?.({ preventScroll: true }));
  };

  const nextFinalExamQuestion = () => {
    if (state.progress.phase !== 'exam' || !state.progress.finalExam.submitted) return;
    const exam = state.progress.finalExam;
    if (exam.questionIndex >= finalExamQuestionCount() - 1) {
      exam.completed = true;
      state.progress.phase = 'exam-results';
      recordSupportMoment('course-complete', { result: 'final-exam' });
      save();
      render();
      focusCurrentTask('#course-task-heading');
      return;
    }
    exam.questionIndex += 1;
    exam.submitted = false;
    exam.checking = false;
    exam.lastResult = '';
    recordSupportMoment('task-entry', { result: 'exam-question' });
    save();
    render();
    focusCurrentTask('#exam-question-card');
  };

  const retryQuestion = () => {
    if (state.progress.phase !== 'check' && state.progress.phase !== 'apply') return;
    state.progress.attempt.selectedAnswer = '';
    state.progress.attempt.submitted = false;
    state.progress.attempt.checkResult = '';
    state.progress.attempt.checking = false;
    state.progress.attempt.feedback = '';
    clearSupportMoment();
    save();
    render();
    const firstChoice = app.querySelector('[data-check-answer], [data-apply-answer]');
    firstChoice?.focus?.({ preventScroll: true });
  };

  const startNextStep = () => {
    storeActiveGuestModuleSnapshot();
    if (isLastStep()) {
      // The final route is the guarded, backend-only understanding check: up
      // to nine own-words prompts and twelve MCQs from a reviewed bank. The
      // old client-only exam must not provide a parallel score-like pathway.
      if (understandingChecksAvailable()) {
        void openUnderstandingCheck({ scope: 'final' });
      } else if (reviewedManifestFinalAvailable()) {
        // A reviewed manifest may still use its established final screen as
        // an offline publishing fallback. When the guarded assessment service
        // is configured, however, it is always the single final route.
        startFinalExam();
      } else {
        goTo('dashboard', courseUi('Your course modules are complete. Your learning overview is ready.', 'آپ کے کورس ماڈیول مکمل ہیں۔ آپ کا سیکھنے کا خلاصہ تیار ہے۔'));
      }
      return;
    }
    state.progress.lessonIndex += 1;
    state.progress.phase = 'preview';
    state.progress.attempt = blankAttempt();
    state.manualExampleVisible = false;
    state.showSimple = false;
    state.readingSectionIndex = 0;
    recordSupportMoment('task-entry', { result: 'module-entry' });
    save();
    render();
    if (adaptiveLearning.taskInitiation) recordUnifiedBehaviourAction('task-initiation-offered');
    showCurrentTaskFromStart();
  };

  const isGuestModuleNavigationAvailable = () => Boolean(
    authenticatedUser?.isGuest
    && state.view === 'course'
    && !isReviewingModule()
    && !isFinalExamPhase()
  );

  const storeActiveGuestModuleSnapshot = () => {
    if (!isGuestModuleNavigationAvailable()) return;
    state.progress.moduleSnapshots[state.progress.lessonIndex] = normaliseModuleSnapshot({
      phase: state.progress.phase,
      attempt: state.progress.attempt,
      manualExampleVisible: state.manualExampleVisible,
      showSimple: state.showSimple,
      readingSectionIndex: state.readingSectionIndex
    });
  };

  const restoreGuestModuleSnapshot = (moduleIndex) => {
    const snapshot = normaliseModuleSnapshot(state.progress.moduleSnapshots[moduleIndex]);
    state.progress.lessonIndex = moduleIndex;
    state.progress.phase = snapshot?.phase || 'preview';
    state.progress.attempt = snapshot?.attempt || blankAttempt();
    state.manualExampleVisible = Boolean(snapshot?.manualExampleVisible);
    state.showSimple = Boolean(snapshot?.showSimple);
    state.readingSectionIndex = snapshot?.readingSectionIndex || 0;
    state.reviewModuleIndex = null;
    state.coursePaused = false;
  };

  const moveGuestModule = (direction) => {
    if (!isGuestModuleNavigationAvailable()) return;
    const currentIndex = state.progress.lessonIndex;
    const nextIndex = currentIndex + direction;
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= COURSE.steps.length) return;
    const previousTitle = currentStep().title;
    storeActiveGuestModuleSnapshot();
    restoreGuestModuleSnapshot(nextIndex);
    recordSupportMoment('task-entry', { result: direction > 0 ? 'module-skipped' : 'module-returned' });
    const destinationTitle = currentStep().title;
    save(direction > 0
      ? previousTitle + ' was skipped for now. ' + destinationTitle + ' is ready.'
      : 'Back to ' + destinationTitle + '. Your place in that module is ready.');
    render();
    showCurrentTaskFromStart();
  };

  const skipGuestModule = () => {
    if (!isGuestModuleNavigationAvailable()) return;
    if (isLastStep()) {
      const skippedTitle = currentStep().title;
      storeActiveGuestModuleSnapshot();
      startNextStep();
      announce(skippedTitle + ' was skipped for now. Your learning overview is ready when you are.');
      return;
    }
    moveGuestModule(1);
  };

  const addGuestModuleNavigation = () => {
    app.querySelectorAll('[data-guest-module-navigation]').forEach((element) => element.remove());
    if (!isGuestModuleNavigationAvailable()) return;
    const actions = app.querySelector('.course-task-card .course-task-actions');
    if (!actions) return;
    const currentIndex = state.progress.lessonIndex;
    const moduleTitle = (index) => courseUsesUrdu()
      ? COURSE_URDU.steps[index]?.title || COURSE.steps[index]?.title || ''
      : COURSE.steps[index]?.title || '';
    const navigation = document.createElement('div');
    navigation.className = 'course-guest-module-navigation';
    navigation.dataset.guestModuleNavigation = '';
    if (currentIndex > 0) {
      const previous = document.createElement('button');
      previous.className = 'course-secondary-button';
      previous.type = 'button';
      previous.dataset.action = 'guest-previous-module';
      previous.setAttribute('aria-label', courseUi('Return to the previous module: ' + moduleTitle(currentIndex - 1), 'پچھلے ماڈیول پر واپس جائیں: ' + moduleTitle(currentIndex - 1)));
      previous.innerHTML = courseUi('<span aria-hidden="true">←</span> Previous module', 'پچھلا ماڈیول <span aria-hidden="true">←</span>');
      navigation.append(previous);
    }
    const skip = document.createElement('button');
    skip.className = 'course-secondary-button course-skip-module-button';
    skip.type = 'button';
    skip.dataset.action = 'guest-skip-module';
    const destination = isLastStep() ? courseUi('your learning overview', 'آپ کا سیکھنے کا خلاصہ') : moduleTitle(currentIndex + 1);
    skip.setAttribute('aria-label', courseUi('Skip this module: ' + moduleTitle(currentIndex) + '. ' + destination + ' will open next.', 'اس ماڈیول کو چھوڑ دیں: ' + moduleTitle(currentIndex) + '۔ اگلا ' + destination + ' کھلے گا۔'));
    skip.innerHTML = courseUi('Skip this module <span aria-hidden="true">→</span>', '<span aria-hidden="true">←</span> یہ ماڈیول چھوڑ دیں');
    navigation.append(skip);
    const primaryAction = actions.querySelector('.course-primary-button');
    actions.insertBefore(navigation, primaryAction || null);
  };

  const finishCheck = () => {
    const check = currentStep().check;
    const selectedIndex = Number(state.progress.attempt.selectedAnswer);
    if (state.progress.attempt.submitted || state.progress.attempt.selectedAnswer === '' || !Number.isInteger(selectedIndex) || !check.options[selectedIndex]) return;
    if (usesReviewedManifest()) {
      state.progress.attempt.checking = true;
      state.progress.attempt.feedback = '';
      save();
      render();
      void checkReviewedManifestModuleAnswer(selectedIndex);
      return;
    }
    state.progress.attempt.submitted = true;
    state.progress.attempt.checkResult = check.options[selectedIndex][1] ? 'complete' : 'try-again';
    const kind = check.options[selectedIndex][1] ? 'answer-correct' : 'answer-incorrect';
    state.progress.attempt.feedback = recordSupportMoment(kind, { result: 'quick-check' });
    save();
    render();
    window.requestAnimationFrame(() => app.querySelector('.course-task-actions button')?.focus?.({ preventScroll: true }));
  };

  const checkReviewedManifestModuleAnswer = async (selectedIndex) => {
    try {
      const result = await checkReviewedCourseAnswer({
        user: authenticatedUser,
        courseId: COURSE.id,
        version: COURSE.version,
        scope: 'module',
        moduleId: currentStep().manifestModuleId,
        language: courseUsesUrdu() ? 'ur' : 'en',
        selectedIndex,
        signal: requestTimeoutSignal(10000)
      });
      const accepted = result?.result === 'complete';
      state.progress.attempt.checking = false;
      state.progress.attempt.submitted = true;
      state.progress.attempt.checkResult = accepted ? 'complete' : 'try-again';
      state.progress.attempt.feedback = recordSupportMoment(accepted ? 'answer-correct' : 'answer-incorrect', { result: 'reviewed-quick-check' });
      save();
      render();
      window.requestAnimationFrame(() => app.querySelector('.course-task-actions button')?.focus?.({ preventScroll: true }));
    } catch (error) {
      state.progress.attempt.checking = false;
      state.progress.attempt.submitted = false;
      state.progress.attempt.checkResult = '';
      state.progress.attempt.feedback = courseUi(
        'This reviewed answer could not be checked right now. Your choice is still here—try again when you are ready.',
        'اس منظور شدہ جواب کی ابھی جانچ نہیں ہو سکی۔ آپ کا انتخاب موجود ہے—جب تیار ہوں دوبارہ کوشش کریں۔'
      );
      save();
      render();
    }
  };

  const completeReviewedModule = () => {
    if (!state.progress.completedSteps.includes(state.progress.lessonIndex)) state.progress.completedSteps.push(state.progress.lessonIndex);
    state.progress.phase = 'complete';
    state.progress.attempt = blankAttempt();
    recordSupportMoment('module-complete', { result: 'reviewed-module' });
    save();
    render();
    // A reviewed manifest has its own curriculum identity. The same compact
    // module aggregate therefore flows to its reviewed assessment bank using
    // courseId + courseVersion—never into the historical static bank.
    void finishAdaptiveModuleSummary();
  };

  const continueCheck = () => {
    const check = currentStep().check;
    const selectedIndex = Number(state.progress.attempt.selectedAnswer);
    const accepted = usesReviewedManifest()
      ? state.progress.attempt.checkResult === 'complete'
      : Boolean(check.options[selectedIndex]?.[1]);
    if (!state.progress.attempt.submitted || !Number.isInteger(selectedIndex) || !accepted) return;
    if (usesReviewedManifest()) {
      completeReviewedModule();
      return;
    }
    state.progress.phase = 'apply';
    state.progress.attempt = blankAttempt();
    recordSupportMoment('task-entry', { result: 'applied-practice' });
    save();
    render();
    showCurrentTaskFromStart('.course-question-card');
    announce(check.explanation);
  };

  const finishApply = () => {
    const selectedIndex = Number(state.progress.attempt.selectedAnswer);
    if (state.progress.attempt.submitted || state.progress.attempt.selectedAnswer === '' || !Number.isInteger(selectedIndex)) return;
    state.progress.attempt.submitted = true;
    state.progress.attempt.feedback = recordSupportMoment(selectedIndex === 0 ? 'answer-correct' : 'answer-incorrect', { result: 'applied-practice' });
    save();
    render();
    window.requestAnimationFrame(() => app.querySelector('.course-task-actions button')?.focus?.({ preventScroll: true }));
  };

  const continueApply = () => {
    const selectedIndex = Number(state.progress.attempt.selectedAnswer);
    if (!state.progress.attempt.submitted || selectedIndex !== 0) return;
    if (!state.progress.completedSteps.includes(state.progress.lessonIndex)) state.progress.completedSteps.push(state.progress.lessonIndex);
    state.progress.phase = 'complete';
    state.progress.attempt = blankAttempt();
    recordSupportMoment('module-complete', { result: 'module' });
    save();
    render();
    // ADAPTIVE LEARNING: the aggregate is sent only when a module finishes.
    // It is optional and cannot interrupt the completion screen or next step.
    void finishAdaptiveModuleSummary();
  };

  const checkTyping = () => {
    clearTypingAutoSubmit();
    const typing = currentStep().typing;
    const sectionTyping = usesLessonSectionTyping();
    const activeSection = sectionTyping ? activeLessonTypingSection() : null;
    const response = normaliseText(state.progress.attempt.response);
    if (!response) {
      state.progress.attempt.feedback = recordSupportMoment('response-needed', { result: 'typing' });
      save();
      render();
      return;
    }
    if (typing.level === 'Recall typing') {
      if (response.length < 24) {
        state.progress.attempt.feedback = recordSupportMoment('typing-incomplete', { result: 'recall' });
        save();
        render();
        return;
      }
      if (!adaptiveRecall.firstAttempt) {
        adaptiveRecall.firstAttempt = response;
        adaptiveRecall.revisionReviewed = false;
        void analyseAdaptiveRecall({ response });
        return;
      }
      if (!adaptiveRecall.revisionReviewed) {
        if (normaliseText(adaptiveRecall.firstAttempt) === response) {
          state.progress.attempt.feedback = courseUi('Add or adjust one idea, then choose Review my updated explanation.', 'ایک خیال شامل یا تبدیل کریں، پھر اپنی بہتر وضاحت کا جائزہ لیں منتخب کریں۔');
          save();
          render();
          return;
        }
        void analyseAdaptiveRecall({ response, previousResponse: adaptiveRecall.firstAttempt }).then(() => {
          adaptiveRecall.revisionReviewed = true;
          render();
        });
        return;
      }
      clearAdaptiveRecall();
      state.progress.phase = 'check';
      state.progress.attempt.feedback = '';
      recordSupportMoment('section-complete', { result: 'lesson-complete', phase: 'check' });
      save();
      render();
      showCurrentTaskFromStart();
      return;
    }
    const target = sectionTyping
      ? activeSection.section.text
      : typing.level === 'Guided typing'
        ? typing.phrases[Math.min(state.progress.attempt.guidedIndex, typing.phrases.length - 1)]
        : typing.target;
    const acceptedAccuracy = typingAccuracy(target, state.progress.attempt.response);
    if (normaliseTypingMatch(target) !== normaliseTypingMatch(response) && acceptedAccuracy < TYPING_AUTO_ACCEPT_ACCURACY) {
      // This is a task retry marker, not a judgement. It lets the local
      // support policy offer one smaller next step after a long pause/retry;
      // it is never a score and never includes the typed response.
      recordUnifiedBehaviourAction('typing-retry');
      state.progress.attempt.feedback = recordSupportMoment('typing-incomplete', { result: 'typing' });
      save();
      render();
      return;
    }
    const hasNextSection = sectionTyping
      ? activeSection.index < activeSection.total - 1
      : typing.level === 'Guided typing' && state.progress.attempt.guidedIndex < typing.phrases.length - 1;
    if (hasNextSection) {
      state.progress.attempt.guidedIndex += 1;
      state.progress.attempt.response = '';
      state.progress.attempt.feedback = sectionTyping
        ? recordSupportMoment('section-complete', { result: 'typing-section' })
        : recordSupportMoment('section-complete', { result: 'guided-phrase' });
      save();
      render();
      showCurrentTaskFromStart('#course-typing-input');
      return;
    }
    state.progress.phase = 'check';
    state.progress.attempt.feedback = '';
    recordSupportMoment('section-complete', { result: 'lesson-complete', phase: 'check' });
    save();
    render();
    showCurrentTaskFromStart();
  };

  const scheduleTypingAutoSubmit = (input) => {
    clearTypingAutoSubmit();
    if (state.view !== 'course' || state.progress.phase !== 'type' || currentStep().typing.level === 'Recall typing') return;
    const target = activeTypingReference();
    const response = input?.value || '';
    if (!target || Array.from(response).length < Array.from(target).length) return;
    const accuracy = typingAccuracy(target, response);
    const delay = accuracy >= TYPING_AUTO_ACCEPT_ACCURACY ? 300 : 5000;
    typingAutoSubmitTimer = window.setTimeout(() => {
      typingAutoSubmitTimer = null;
      if (state.view !== 'course' || state.progress.phase !== 'type') return;
      const currentInput = app.querySelector('[data-typing-input]');
      if (!currentInput || currentInput.value !== response) return;
      checkTyping();
    }, delay);
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

  const signOut = async (button) => {
    if (button) button.disabled = true;
    if (authenticatedUser?.isGuest) {
      clearType2LearnGuest();
      window.location.assign('/login/');
      return;
    }
    try {
      const { signOutType2LearnUser } = await import('/firebase-auth.js?v=20260807-google-popup2');
      await signOutType2LearnUser();
      window.location.assign('/');
    } catch (_) {
      if (button) button.disabled = false;
      announce('Unable to sign out right now. Please try again.');
    }
  };

  const openCoursePreferences = () => {
    const destination = new URL('/afterlogin/', window.location.origin);
    destination.searchParams.set('course', COURSE.id);
    if (usesReviewedManifest()) destination.searchParams.set('version', COURSE.version);
    window.location.assign(destination.pathname + destination.search);
  };

  const openReviewedCoursePreferences = (element) => {
    const courseId = String(element?.dataset?.courseId || '').trim();
    const version = String(element?.dataset?.courseVersion || '').trim();
    if (!/^[a-z0-9][a-z0-9-]{2,79}$/i.test(courseId) || !/^\d+\.\d+(?:\.\d+)?$/.test(version)) {
      announce(courseUi('This course link is not ready. Please choose it again from the course list.', 'اس کورس کا لنک تیار نہیں۔ براہِ کرم کورس فہرست سے دوبارہ منتخب کریں۔'));
      return;
    }
    const destination = new URL('/afterlogin/', window.location.origin);
    destination.searchParams.set('course', courseId);
    destination.searchParams.set('version', version);
    window.location.assign(destination.pathname + destination.search);
  };

  const refreshOfflineLearningStatus = async () => {
    offlineLearning.checking = true;
    try {
      const status = await getOfflineStatus();
      offlineLearning.supported = Boolean(status.supported && status.installed);
      offlineLearning.downloaded = Boolean(status.downloaded);
    } catch (_) {
      offlineLearning.supported = false;
    } finally {
      offlineLearning.checking = false;
    }
  };

  const downloadOfflineLearning = async () => {
    if (offlineLearning.downloading) return;
    offlineLearning.downloading = true;
    offlineLearning.status = 'Preparing the learning package for this browser…';
    render();
    try {
      const [result, persistent] = await Promise.all([
        downloadLearningForOffline(),
        requestOfflinePersistence()
      ]);
      offlineLearning.downloaded = true;
      offlineLearning.status = result.failures?.length
        ? 'Core learning is downloaded. A few optional files can refresh the next time you are online.'
        : persistent
          ? 'Learning is downloaded and this browser has been asked to keep it available offline.'
          : 'Learning is downloaded for offline use on this browser.';
      announce('Learning package downloaded for offline use.');
    } catch (error) {
      offlineLearning.status = error?.message || 'The learning package could not be downloaded. Your current work is unchanged.';
      announce(offlineLearning.status);
    } finally {
      offlineLearning.downloading = false;
      render();
    }
  };

  const saveCourseLearningChoice = (key, value) => {
    const choices = learningChoices();
    choices[key] = value;
    // Each explicit enable is a fresh consent to the sound option, not consent
    // to resume an earlier loudness. Start it at zero and let the learner
    // raise the slider only if they want to hear it.
    if (key === 'background-noise' && value === 'on') choices['background-noise-volume'] = '0';
    saveLearningChoices(choices);

    if (key === 'colours' && colorModes.includes(value)) window.Type2LearnColorMode?.set(value, false);
    if (key === 'website-scheme' && websiteSchemes.includes(value)) window.Type2LearnWebsiteScheme?.set(value);
    if (key === 'text-to-speech') setCourseSetting('readAloud', value === 'on');
    // READING ACCESS: these controls are immediate presentation changes. They
    // are not inferred by AI and remain available whether adaptive support is
    // on or off. The optional adaptive layer may only propose the allow-listed
    // course controls; the learner always applies them here.
    if (key === 'reading-text-size' && ['standard', 'large', 'extra-large'].includes(value)) setCourseSetting('textSize', value);
    if (key === 'reading-spacing' && ['standard', 'relaxed'].includes(value)) setCourseSetting('spacing', value);
    if (key === 'reading-width' && ['narrow', 'comfortable', 'wide'].includes(value)) setCourseSetting('readingWidth', value);
    if (key === 'reading-contrast') setCourseSetting('highContrast', value === 'on');

    const shouldPreviewSupportMode = state.view === 'course'
      && ['encouragement', 'animations'].includes(key);
    syncBackgroundNoisePreferences();
    // A settings change can rerender the companion but cannot replay the most
    // recent learning acknowledgement.
    if (activeSupportMoment) lastMascotSupportEventId = activeSupportMoment.id;
    syncMascotPreferences();
    if (['mascot-role', 'mascot-presence', 'learning-partner', 'mascot'].includes(key)) {
      // Make the companion choice observable immediately rather than waiting
      // for a later behavioural trigger. This is a preference preview, not an
      // AI inference and it never changes the learner's saved role by itself.
      refreshMascotRolePreview();
      behaviourPartner.directive = null;
      behaviourPartner.focusedOpen = false;
      lastMascotScene = '';
    }
    if (key === 'adaptive-learning') void updateAdaptiveLearningConsent(value === 'on');
    if (key === 'background-noise' || key === 'background-noise-type') {
      if (backgroundNoise.enabled) playBackgroundNoise({ announceChange: false });
      else pauseBackgroundNoise();
    }
    if (shouldPreviewSupportMode) recordSupportMoment('preference-preview', { result: key });
    save();
    render();

    if (key === 'urdu-mode') {
      announce(value === 'on'
        ? 'Urdu mode is on. This course and Course AI are now in Urdu; typing stays in English.'
        : 'Urdu mode is off.');
    } else {
      announce('Learning setting updated.');
    }
  };

  const handleAction = (action, element) => {
    switch (action) {
      case 'dashboard': goTo('dashboard'); break;
      case 'browse': goTo('browse'); break;
      case 'saved': goTo('saved'); break;
      case 'course-preferences':
        if (coursePreferencesAreSaved()) goTo('course', 'Your course choices are ready.');
        else openCoursePreferences();
        break;
      case 'open-reviewed-course': openReviewedCoursePreferences(element); break;
      case 'continue-course':
        state.coursePaused = false;
        goTo('course', 'You are back at your saved small step.');
        break;
      case 'guest-skip-module': skipGuestModule(); break;
      case 'guest-previous-module': moveGuestModule(-1); break;
      case 'toggle-settings-menu':
        state.settingsMenu = !state.settingsMenu;
        render();
        if (state.settingsMenu) window.requestAnimationFrame(() => app.querySelector('.course-settings-close')?.focus?.({ preventScroll: true }));
        break;
      case 'close-settings-menu':
        state.settingsMenu = false;
        render();
        window.requestAnimationFrame(() => app.querySelector('[data-action="toggle-settings-menu"]')?.focus?.({ preventScroll: true }));
        break;
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
      case 'signout': signOut(element); break;
      case 'listen': narrateCurrentTask(); break;
      case 'task-narration-toggle': startTaskNarration(); break;
      case 'narration-listen': startNarration(); break;
      case 'narration-pause': ensureNarrationService().pause(); break;
      case 'narration-stop': ensureNarrationService().stop(); break;
      case 'narration-restart': ensureNarrationService().restart(); break;
      case 'narration-jump': startNarration(Number(element.dataset.narrationIndex)); break;
      case 'pause': openCourseModal('pause', element, '[data-action="pause"]'); break;
      case 'call-ai': openCourseAi(element); break;
      case 'mascot-speak': speakMascotDialogue(); break;
      case 'close-ai-chat': closeCourseAi(); break;
      case 'ai-send': void sendAiMessage(); break;
      case 'ai-speak-message': void speakAiMessage(Number(element.dataset.aiMessageIndex)); break;
      case 'ai-dictation-toggle':
        if (aiChat.status === 'recording') stopAiDictation();
        else void startAiDictation();
        break;
      case 'companion-open':
        behaviourPartner.focusedOpen = true;
        render();
        break;
      case 'companion-dismiss':
        if (behaviourPartner.directive?.trigger) behaviourPartner.context.dismiss(behaviourPartner.directive.trigger);
        behaviourPartner.directive = null;
        behaviourPartner.focusedOpen = false;
        render();
        announce(courseUi('Learning partner support is quiet for this task.', 'سیکھنے کے ساتھی کی مدد اس مرحلے کے لیے خاموش ہے۔'));
        break;
      case 'companion-why':
        announce(courseUi('This appeared after at least two neutral task signals, such as returning, rereading, or taking a longer pause. It is not a diagnosis or a score.', 'یہ کم از کم دو غیر جانبدار تعلیمی اشاروں کے بعد ظاہر ہوا، جیسے واپس آنا، دوبارہ پڑھنا یا طویل وقفہ۔ یہ تشخیص یا اسکور نہیں ہے۔'));
        break;
      case 'companion-use': {
        const partnerAction = String(element.dataset.companionAction || '');
        behaviourPartner.context.accept(partnerAction);
        if (partnerAction === 'open-visual') {
          adaptiveLearning.visualOpen = true;
          recordUnifiedBehaviourAction('visual-offered');
          recordUnifiedBehaviourAction('visual-open');
          recordUnifiedBehaviourAction('return');
        } else if (partnerAction === 'smaller-step') {
          state.showSimple = true;
          behaviourPartner.directive = null;
          recordSupportMoment('task-entry', { result: 'simple-reading' });
        } else if (partnerAction === 'teach-partner') {
          const input = app.querySelector('[data-companion-input]');
          if (input) input.focus();
          else openCourseAi(element);
        } else if (partnerAction === 'process-support') {
          behaviourPartner.context.action('assessment-help');
          openCourseModal('help', element, '[data-action="stuck"]');
        } else if (partnerAction === 'optional-mission') {
          behaviourPartner.directive = { ...behaviourPartner.directive, message: courseUi('You chose a meaningful mission. Connect one idea to a real situation when you are ready.', 'آپ نے ایک بامعنی مشن منتخب کیا ہے۔ جب تیار ہوں ایک خیال کو کسی حقیقی صورتحال سے جوڑیں۔'), trigger: 'mission-active', action: 'teach-partner' };
        } else {
          const focusTarget = app.querySelector('[data-typing-input], .course-reading-copy h3, #course-task-heading');
          focusTarget?.focus?.({ preventScroll: true });
        }
        render();
        break;
      }
      case 'companion-send': void sendCompanionMessage(); break;
      case 'companion-dictation':
        startCompanionDictation();
        break;
      case 'companion-open-chat':
        openCompanionChat(element);
        break;
      case 'export-behaviour-data': void exportBehaviourData(); break;
      case 'delete-behaviour-data': void deleteBehaviourData(); break;
      case 'stuck':
        state.helpOption = '';
        clearAdaptiveRecall();
        openCourseModal('help', element, '[data-action="stuck"]');
        break;
      case 'adaptive-barrier':
        void analyseAdaptiveRecall({
          barrier: String(element.dataset.barrier || ''),
          response: typingIsConceptResponse() ? String(state.progress.attempt.response || '') : ''
        });
        break;
      case 'help-open-ai':
        openCourseAi(element);
        break;
      case 'accept-adaptive-proposal':
        void decideAdaptiveLearningProposal(true);
        break;
      case 'decline-adaptive-proposal':
        void decideAdaptiveLearningProposal(false);
        break;
      case 'dismiss-task-initiation':
        adaptiveLearning.taskInitiation = false;
        recordUnifiedBehaviourAction('task-initiation-used');
        render();
        break;
      case 'toggle-visual-explanation':
        adaptiveLearning.visualOpen = !adaptiveLearning.visualOpen;
        if (adaptiveLearning.visualOpen) {
          recordUnifiedBehaviourAction('visual-offered');
          recordUnifiedBehaviourAction('visual-open');
        }
        render();
        break;
      case 'close-visual-explanation':
        adaptiveLearning.visualOpen = false;
        render();
        break;
      case 'close-modal': state.modal === 'ai-chat' ? closeCourseAi() : closeCourseModal(); break;
      case 'save-exit':
        window.requestAnimationFrame(() => window.scrollTo?.({ left: 0, top: 0, behavior: 'auto' }));
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
        recordUnifiedBehaviourAction('reread');
        save('The previous small reading section is ready.');
        retainReadingSectionPosition('[data-action="previous-reading-section"], [data-action="next-reading-section"], [data-action="read-complete"]');
        break;
      case 'next-reading-section':
        if (!smallerSectionsAreActive()) break;
        state.readingSectionIndex = Math.min(readingSections().length - 1, currentReadingSectionIndex() + 1);
        recordUnifiedBehaviourAction('reread');
        save('The next small reading section is ready.');
        retainReadingSectionPosition('[data-action="next-reading-section"], [data-action="read-complete"]');
        break;
      case 'read-complete':
        state.progress.phase = 'type';
        state.progress.attempt = blankAttempt();
        state.showSimple = false;
        state.readingSectionIndex = 0;
        recordSupportMoment('task-entry', { result: 'typing' });
        recordUnifiedBehaviourAction('return');
        save();
        render();
        showCurrentTaskFromStart('#course-typing-input');
        break;
      case 'preview-complete':
        // The first-step prompt belongs only to this preview. Once the learner
        // starts, it must not follow them through reading or silently appear
        // in the next module.
        adaptiveLearning.taskInitiation = false;
        window.clearTimeout(adaptiveLearning.taskInitiationTimer);
        adaptiveLearning.taskInitiationTimer = null;
        state.progress.phase = 'read';
        state.progress.attempt = blankAttempt();
        state.readingSectionIndex = 0;
        recordSupportMoment('task-entry', { result: 'reading' });
        recordUnifiedBehaviourAction('return');
        save();
        render();
        showCurrentTaskFromStart();
        break;
      case 'start-voice-input': void startVoiceInput(); break;
      case 'toggle-voice-input-pause': toggleVoiceInputPause(); break;
      case 'stop-voice-input':
        if (voiceInput.recorder?.state === 'recording') stopSpeechmaticsTypingInput();
        else stopVoiceInput('Microphone input stopped. Your response is still here.');
        break;
      case 'check-typing': checkTyping(); break;
      case 'submit-check': finishCheck(); break;
      case 'continue-check': continueCheck(); break;
      case 'submit-apply': finishApply(); break;
      case 'continue-apply': continueApply(); break;
      case 'start-understanding-check': void openUnderstandingCheck({ scope: 'module' }); break;
      case 'resume-understanding-check': void openUnderstandingCheck({ resume: true, scope: state.progress.assessmentScope }); break;
      case 'start-final-understanding-check': void openUnderstandingCheck({ scope: 'final' }); break;
      case 'submit-understanding-check': void submitUnderstandingCheck(); break;
      case 'assessment-dictation':
        if (understandingCheck.listening) {
          stopAssessmentDictation();
          // Store only the completed input mode, never the recognised text.
          recordUnifiedBehaviourAction('speech-complete');
          renderUnderstandingCheck('[data-assessment-response]');
        }
        else startAssessmentDictation();
        break;
      case 'return-from-understanding-check': leaveUnderstandingCheck(); break;
      case 'review-understanding-module': reviewUnderstandingModule(); break;
      case 'return-to-understanding-check': void returnToUnderstandingCheck(); break;
      case 'restart-understanding-check': restartUnderstandingCheck(); break;
      case 'finish-understanding-check': finishUnderstandingCheck(); break;
      case 'start-final-exam':
        // A reviewed manifest retains the established exam screen but checks
        // each response through the protected reviewed-course endpoint.
        if (understandingChecksAvailable()) void openUnderstandingCheck({ scope: 'final' });
        else if (reviewedManifestFinalAvailable()) startFinalExam();
        else goTo('dashboard', courseUi('Your course modules are complete.', 'آپ کے کورس ماڈیول مکمل ہیں۔'));
        break;
      case 'submit-exam-answer': submitFinalExamAnswer(); break;
      case 'next-exam-question': nextFinalExamQuestion(); break;
      case 'return-course': goTo('dashboard', 'Your final exam results are saved locally.'); break;
      case 'return-to-read':
        state.progress.phase = 'read';
        state.progress.attempt = blankAttempt();
        state.readingSectionIndex = 0;
        recordSupportMoment('task-entry', { result: 'reread' });
        save();
        render();
        showCurrentTaskFromStart();
        break;
      case 'simple-read':
        state.progress.phase = 'read';
        state.progress.attempt = blankAttempt();
        state.showSimple = true;
        state.readingSectionIndex = 0;
        recordSupportMoment('task-entry', { result: 'simple-reading' });
        save();
        render();
        showCurrentTaskFromStart();
        break;
      case 'retry-question': retryQuestion(); break;
      case 'next-step': startNextStep(); break;
      case 'help':
        state.helpOption = element.dataset.helpOption || '';
        render();
        break;
      default: break;
    }
  };

  app.addEventListener('click', (event) => {
    const motionControl = event.target.closest('button, summary, .course-check-option, .exam-option');
    if (motionControl) launchCourseControlMotion(motionControl, event);
    const settingsMenuToggle = event.target.closest('[data-action="toggle-settings-menu"]');
    const clickedInsideSettings = Boolean(event.target.closest('.course-settings-menu'));
    if (state.settingsMenu && !clickedInsideSettings && !settingsMenuToggle) {
      // The settings dialog always closes when its backdrop is chosen, while
      // still allowing that same click to use another page control.
      state.settingsMenu = false;
      if (!event.target.closest('[data-action]')) {
        render();
        return;
      }
    }

    const settingsTab = event.target.closest('[data-settings-tab]');
    if (settingsTab) {
      state.settingsTab = settingsTab.dataset.settingsTab || 'general';
      render();
      return;
    }
    const settingsChoice = event.target.closest('[data-settings-choice]');
    if (settingsChoice) {
      saveCourseLearningChoice(settingsChoice.dataset.settingsChoice, settingsChoice.dataset.value);
      return;
    }
    const settingsToggle = event.target.closest('[data-settings-toggle]');
    if (settingsToggle && !settingsToggle.disabled) {
      const key = settingsToggle.dataset.settingsToggle;
      const current = learningChoices()[key] === 'on';
      saveCourseLearningChoice(key, current ? 'off' : 'on');
      return;
    }
    const offlineDownload = event.target.closest('[data-offline-download]');
    if (offlineDownload && !offlineDownload.disabled) {
      void downloadOfflineLearning();
      return;
    }
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
    if (state.settingsMenu && event.key === 'Escape') {
      event.preventDefault();
      state.settingsMenu = false;
      render();
      window.requestAnimationFrame(() => app.querySelector('[data-action="toggle-settings-menu"]')?.focus?.({ preventScroll: true }));
      return;
    }
    if (event.target.matches?.('[data-ai-chat-input]')) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void sendAiMessage();
      }
      return;
    }
    const narrationText = event.target.closest?.('[data-narration-text][data-narration-index]');
    if (narrationText && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')) {
      event.preventDefault();
      startNarrationFromChunkPoint(Number(narrationText.dataset.narrationIndex), 0);
      return;
    }
    if (!event.target.matches?.('[data-typing-input]')) return;
    const typingField = event.target.closest('.typing-tester');
    const guidedTyping = !typingField?.classList.contains('is-free-response');
    if (guidedTyping && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      keepGuidedTypingCursorAtEnd(event.target);
      return;
    }
    if (state.progress.phase !== 'type' || event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    event.preventDefault();
    checkTyping();
  });

  app.addEventListener('change', (event) => {
    if (event.target.matches('[data-settings-noise-type]')) {
      saveCourseLearningChoice('background-noise-type', event.target.value);
      return;
    }
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
      if (state.progress.phase !== 'exam' || state.progress.finalExam.submitted || state.progress.finalExam.checking) return;
      const answer = Number(event.target.value);
      if (!Number.isInteger(answer) || answer < 0 || answer > 3) return;
      state.progress.finalExam.answers[state.progress.finalExam.questionIndex] = answer;
      state.progress.finalExam.lastResult = '';
      clearSupportMoment();
      save('Answer selected. Submit when you are ready.');
      render();
      window.requestAnimationFrame(() => app.querySelector('[data-exam-answer][value="' + answer + '"]')?.focus?.());
      return;
    }
    if (event.target.matches('[data-assessment-option]')) {
      if (state.progress.phase !== 'assessment' || understandingCheck.loading) return;
      understandingCheck.selectedOption = event.target.value;
      understandingCheck.feedback = '';
      understandingCheck.error = '';
      renderUnderstandingCheck('[data-assessment-option][value="' + event.target.value + '"]');
      return;
    }
    if (event.target.matches('[data-check-answer], [data-apply-answer]')) {
      if (state.progress.attempt.submitted) return;
      state.progress.attempt.selectedAnswer = event.target.value;
      state.progress.attempt.submitted = false;
      state.progress.attempt.checkResult = '';
      state.progress.attempt.checking = false;
      state.progress.attempt.feedback = '';
      clearSupportMoment();
      save();
      render();
      const answerSelector = event.target.matches('[data-check-answer]') ? '[data-check-answer]' : '[data-apply-answer]';
      window.requestAnimationFrame(() => app.querySelector(answerSelector + '[value="' + state.progress.attempt.selectedAnswer + '"]')?.focus?.());
    }
  });

  app.addEventListener('input', (event) => {
    if (event.target.matches('[data-settings-noise-volume]')) {
      const value = String(Math.min(BACKGROUND_NOISE_MAX_VOLUME * 100, Math.max(0, Number(event.target.value) || 0)));
      const choices = learningChoices();
      choices['background-noise-volume'] = value;
      saveLearningChoices(choices);
      backgroundNoise.volume = clampBackgroundNoiseVolume(value);
      if (backgroundNoise.audio) backgroundNoise.audio.volume = backgroundNoise.volume;
      const output = app.querySelector('[data-settings-noise-volume-output]');
      if (output) output.textContent = value + '%';
      return;
    }
    if (event.target.matches('[data-ai-chat-input]')) {
      aiChat.draft = event.target.value.slice(0, 900);
      syncAiComposerState();
      return;
    }
    if (event.target.matches('[data-companion-input]')) {
      behaviourPartner.draft = event.target.value.slice(0, 900);
      return;
    }
    if (event.target.matches('[data-assessment-response]')) {
      // Assessment prose remains only in this ephemeral input state until the
      // learner submits it to the explicitly consented assessment endpoint.
      // The unified Behaviour Context receives only bounded interaction
      // aggregates; it never receives the answer, words, or a transcript.
      const nextResponse = event.target.value.slice(0, 1400);
      const previousLength = understandingCheck.response.length;
      const insertedLength = Math.max(0, nextResponse.length - previousLength);
      const removedLength = Math.max(0, previousLength - nextResponse.length);
      const inputAt = performance.now();
      const pauseMs = understandingCheck.lastInputAt > 0 ? inputAt - understandingCheck.lastInputAt : 0;
      understandingCheck.lastInputAt = inputAt;
      const aggregate = {
        characters: insertedLength,
        // An own-words assessment has no canonical target, so no character
        // is labelled correct or incorrect at input time.
        correctCharacters: 0,
        incorrectCharacters: 0,
        backspaces: removedLength,
        pauseMs
      };
      recordUnifiedBehaviourAction('typing', aggregate);
      understandingCheck.response = nextResponse;
      understandingCheck.error = '';
      return;
    }
    if (!event.target.matches('[data-typing-input]')) return;
    const input = event.target;
    const previousCharacters = Array.from(state.progress.attempt.response || '');
    const nextValue = input.value;
    const nextCharacters = Array.from(nextValue || '');
    const insertedLength = Math.max(0, nextCharacters.length - previousCharacters.length);
    const removedLength = Math.max(0, previousCharacters.length - nextCharacters.length);
    const usesAlternativeInput = usingAlternativeInput();
    const isComposition = Boolean(event.isComposing) || /composition/i.test(event.inputType || '');
    const isUnexpectedInsertion = event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop';
    if (!usesAlternativeInput && !isComposition && (insertedLength > 24 || isUnexpectedInsertion)) state.progress.attempt.integrityNotice = true;
    // ADAPTIVE LEARNING: retain only bounded aggregate typing behaviour. The
    // actual characters and their order stay in the course response only.
    const typingNow = performance.now();
    const typingPauseMs = adaptiveLearning.lastTypingAt > 0 ? typingNow - adaptiveLearning.lastTypingAt : 0;
    adaptiveLearning.lastTypingAt = typingNow;
    const referenceCharacters = Array.from(activeTypingReference() || '');
    // `input` may contain multiple characters from a fast keyboard, IME, or
    // accessibility input. Count every inserted character immediately using
    // Unicode-safe indexes, instead of treating the whole burst as a failure
    // and leaving the guided overlay behind.
    const insertedCharacters = nextCharacters.slice(previousCharacters.length);
    const newlyCorrect = insertedCharacters.reduce((total, character, offset) => (
      total + (character === referenceCharacters[previousCharacters.length + offset] ? 1 : 0)
    ), 0);
    recordUnifiedBehaviourAction('typing', {
      characters: insertedLength,
      correctCharacters: newlyCorrect,
      incorrectCharacters: Math.max(0, insertedLength - newlyCorrect),
      backspaces: removedLength,
      pauseMs: typingPauseMs
    });
    state.progress.attempt.response = nextValue;
    state.progress.attempt.feedback = '';
    handleTypingGuidanceInput(nextValue);
    if (activeSupportMoment && ['response-needed', 'typing-incomplete'].includes(activeSupportMoment.kind)) {
      clearSupportMoment();
      app.querySelector('[data-support-moment]')?.remove();
    }
    const isSingleTypedCharacter = insertedLength === 1
      && (event.inputType === 'insertText' || event.inputType === 'insertCompositionText');
    syncTypingTester(input, isSingleTypedCharacter);
    keepGuidedTypingCursorAtEnd(input);
    scheduleTypingAutoSubmit(input);
    save();
  });

  app.addEventListener('focusin', (event) => {
    if (!event.target.matches?.('[data-typing-input]')) return;
    syncTypingFocusCurtain(event.target);
    window.requestAnimationFrame(() => keepGuidedTypingCursorAtEnd(event.target));
    if (typingGuidance.active && !typingGuidance.paused && typingGuidance.phase !== 'intro') {
      window.requestAnimationFrame(() => promptExpectedTypingCharacter(Array.from(state.progress.attempt.response || '').length));
    }
  });

  app.addEventListener('focusout', (event) => {
    if (!event.target.matches?.('[data-typing-input]')) return;
    window.requestAnimationFrame(() => syncTypingFocusCurtain(event.target));
  });

  app.addEventListener('click', (event) => {
    const focusCurtain = event.target.closest?.('[data-typing-focus-curtain]');
    if (focusCurtain) {
      event.preventDefault();
      const input = focusCurtain.closest('.typing-tester-surface')?.querySelector('[data-typing-input]');
      input?.focus?.();
      return;
    }
    const input = event.target.closest?.('[data-typing-input]');
    if (!input) return;
    window.requestAnimationFrame(() => keepGuidedTypingCursorAtEnd(input));
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
    if (state.settingsMenu && event.key === 'Escape') {
      event.preventDefault();
      state.settingsMenu = false;
      render();
      window.requestAnimationFrame(() => app.querySelector('[data-action="toggle-settings-menu"]')?.focus?.({ preventScroll: true }));
      return;
    }
    if (aiChat.open && event.key === 'Escape') {
      event.preventDefault();
      closeCourseAi();
      return;
    }
    if (state.modal) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (state.modal === 'ai-chat') closeCourseAi();
        else closeCourseModal();
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

  // Capture the next genuine learner interaction before task handlers run.
  // This means a previous acknowledgement never covers the next button,
  // choice, or typed character, while a newly-created acknowledgement from
  // that interaction remains visible.
  document.addEventListener('pointerdown', (event) => {
    if (!event.isTrusted) return;
    dismissActiveSupportPopup();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (!event.isTrusted) return;
    dismissActiveSupportPopup();
  }, true);

  window.addEventListener('resize', () => {
    const popup = app.querySelector('.course-support-popup');
    if (!popup) return;
    window.requestAnimationFrame(() => positionSupportPopupInTask(popup));
  }, { passive: true });

  const beginAuthenticatedCourse = async () => {
    app.innerHTML = renderAuthChecking();
    let user = getType2LearnGuest();
    if (!user) {
      user = await import('/firebase-auth.js?v=20260807-google-popup2')
        .then(({ waitForType2LearnUser }) => waitForType2LearnUser())
        .catch(() => null);
    }
    if (!user) {
      window.location.replace('/login/?next=' + encodeURIComponent(window.location.pathname + window.location.search));
      return;
    }
    authenticatedUser = user;
    try {
      await hydrateReviewedCourseForRoute(user);
    } catch (error) {
      renderReviewedManifestFailure(error?.message || 'The reviewed course could not be opened.');
      return;
    }
    const rawLearnerId = user.uid || user.email || 'learner';
    const learnerId = encodeURIComponent(rawLearnerId);
    storageKeys = {
      preferences: 'type2learn-learner-preferences-v1:' + learnerId,
      course: STORAGE_NAMESPACE + ':' + learnerId + ':' + progressCourseKey(),
      learnerId: rawLearnerId
    };
    state = loadState();
    await restoreCloudProgress();
    beginPeriodicSave();
    queueCloudProgressSave();
    const entry = new URL(window.location.href).searchParams;
    const startSelectedCourse = entry.get('start') === 'course'
      && (usesReviewedManifest()
        ? entry.get('courseId') === COURSE.id && entry.get('version') === COURSE.version
        : entry.get('course') === COURSE.id);
    if (startSelectedCourse) {
      // The course-specific preferences page always leads to a clear preview
      // before the learner begins or resumes a learning task.
      state.view = 'course';
      state.previousView = 'dashboard';
      state.progress.phase = 'preview';
      state.reviewModuleIndex = null;
      state.manualExampleVisible = false;
      state.showSimple = false;
      state.readingSectionIndex = 0;
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('course');
      cleanUrl.searchParams.delete('courseId');
      cleanUrl.searchParams.delete('version');
      cleanUrl.searchParams.delete('start');
      window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      recordSupportMoment('task-entry', { result: 'course-entry' });
      save();
    }
    syncBackgroundNoisePreferences();
    syncMascotPreferences();
    void registerOffline().then(refreshOfflineLearningStatus).then(() => {
      if (state.settingsMenu) render();
    });
    if (upgradeLegacyNarrationVoice()) save();
    render();
    // Published platform/assigned courses belong in this same selection
    // screen. Fetching happens after the normal render so catalogue trouble
    // can never delay the existing course or the learner's saved progress.
    if (!usesReviewedManifest()) void refreshReviewedCourseCatalogue();
    // Adaptive support is loaded after the normal course renders. A failed or
    // disabled optional feature must never delay the learner's first task.
    void hydrateAdaptiveLearning();
    // Preferences are saved immediately before the learner enters the course.
    // The preview audio belongs to that previous document, so rebuild and
    // resume the selected loop here instead of leaving a silent handoff.
    // A browser that blocks cross-page autoplay still leaves the visible
    // Start control available without producing an unnecessary alert.
    if (backgroundNoise.enabled) {
      window.requestAnimationFrame(() => playBackgroundNoise({ announceChange: false }));
    }
  };

  window.addEventListener('pagehide', () => {
    clearTypingAutoSubmit();
    if (cloudProgress.timer !== null) {
      window.clearTimeout(cloudProgress.timer);
      cloudProgress.timer = null;
    }
    if (periodicSaveTimer !== null) {
      window.clearInterval(periodicSaveTimer);
      periodicSaveTimer = null;
    }
    if (authenticatedUser) {
      save();
      void flushCloudProgress();
    }
    cancelNarrationAutoScroll();
    stopTaskNarration({ silent: true });
    narration.service?.destroy();
    stopVoiceInput();
    resetAiChat();
    stopMascotSpeech();
    pauseBackgroundNoise();
    courseMascot?.destroy();
  });
  beginAuthenticatedCourse();
})();
