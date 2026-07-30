import { signOutType2LearnUser, waitForType2LearnUser } from '/firebase-auth.js?v=20260721-2';
import { BALANCED_START_PRESET_ID, BUILT_IN_PROTECTION_KEYS, PRESETS, applyPresetConflictResolution, clearQuestionnaireAnswers, clearTemporaryOverrides, clearUserOverride, createSettingsState, getAvailableInputMethods, getLearnerSettingsSaveStatus, getLearnerVisibleSettingKeys, getPreset, getPresetSelectionAnalysis, hasCompletedLearnerSetup, loadLearnerSettings, markSetupComplete, resetAllLearnerSettings, resetPresetSettingsOnly, resetRecommendation, resolveSettings, saveLearnerSettings, selectSupportProfiles, setActiveInputMethod, setUserOverride, settingSource } from '/learner-settings.js?v=20260728-multipreset';
import { getMascotSettings, mountType2LearnMascot, notifyMascot, setMascotSettings } from '/mascot.js?v=20260723-bunny-web';

const app = document.getElementById('learner-app');
const view = document.body.dataset.learnerView || 'profile';
const LOCAL_AVA_VOICE_URI = 'type2learn-local-edge-ava';
const SYSTEM_NARRATION_VOICE_URI = 'type2learn-system-default';
const courseId = 'course-1-neurodivergent-conditions-v2';
const NARRATION_DEMO_URL = '/assets/audio/edge-ava/neurodivergent/01-adhd/read-ava-timed.mp3';
const NARRATION_DEMO_MAX_SECONDS = 5.5;
const NARRATION_DEMO_TEXT = 'This is a short narration-speed example. Choose the pace that feels comfortable for you.';
const narrationDemo = { audio: null, utterance: null, active: false };
const SETTINGS_SAVE_ERROR = 'We could not save this change in your browser. It is active for now, but it may be lost if you leave or reload. Check that browser storage is available, then retry saving.';
let pendingSettingsSave = null;
let pendingProfileIds = null;
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const learnerId = (user) => user?.uid || user?.email || 'learner';
const initials = (user) => (user.displayName?.trim() || user.email?.split('@')[0] || 'Learner').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const learnerNavLink = (href, label, key, active) => '<a href="' + href + '"' + (active === key ? ' class="is-active" aria-current="page"' : '') + '>' + label + '</a>';
const learnerBackControl = (href = '/learn/') => '<a class="learner-back-control" href="' + href + '" aria-label="Go back"><svg class="learner-back-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H5M11 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9"/></svg></a>';
const header = () => '<header class="learner-topbar"><div class="learner-topbar-inner"><div class="learner-brand-area">' + learnerBackControl() + '<a class="learner-brand" href="/learn/" aria-label="Type2Learn learning dashboard"><img src="/assets/type2learn-logo-nav.webp" alt=""><span>TYPE2LEARN</span></a></div><nav class="learner-top-actions" aria-label="Learner navigation">' + learnerNavLink('/learn/', 'Learning', 'learning', view) + learnerNavLink('/course/', 'Current lesson', 'course', view) + learnerNavLink('/settings/', 'Settings', 'settings', view) + learnerNavLink('/profile/', 'Profile', 'profile', view) + '<button type="button" data-signout>Sign out</button></nav></div></header>';
const narrationDemoStatus = () => document.querySelector('[data-narration-demo-status]');
const updateNarrationDemoUi = (message, active = narrationDemo.active) => {
  const status = narrationDemoStatus();
  if (status && message) status.textContent = message;
  const play = document.querySelector('[data-play-narration-demo]');
  const stop = document.querySelector('[data-stop-narration-demo]');
  if (play) {
    play.disabled = active;
    play.textContent = active ? 'Playing example…' : 'Play a short example';
  }
  if (stop) stop.hidden = !active;
};
const stopNarrationDemo = (message = '') => {
  const audio = narrationDemo.audio;
  const utterance = narrationDemo.utterance;
  narrationDemo.audio = null;
  narrationDemo.utterance = null;
  narrationDemo.active = false;
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
    audio.ontimeupdate = null;
    try { audio.pause(); } catch (_) { /* Demo cleanup is best-effort. */ }
    try { audio.removeAttribute('src'); } catch (_) { /* Demo cleanup is best-effort. */ }
    try { audio.load?.(); } catch (_) { /* Demo cleanup is best-effort. */ }
  }
  if (typeof window !== 'undefined' && utterance && window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch (_) { /* Demo cleanup is best-effort. */ }
  }
  updateNarrationDemoUi(message || 'No audio will play until you choose the example.', false);
};
const finishNarrationDemo = (message, expected = null) => {
  if (expected && narrationDemo.audio !== expected && narrationDemo.utterance !== expected) return;
  narrationDemo.audio = null;
  narrationDemo.utterance = null;
  narrationDemo.active = false;
  updateNarrationDemoUi(message, false);
};
const playNarrationDemo = (settings) => {
  stopNarrationDemo();
  const preferences = resolveSettings(settings);
  const rate = Math.min(1.5, Math.max(0.75, Number(preferences.narrationSpeed) || 1));
  const volume = Math.min(1, Math.max(0, Number(preferences.narrationVolume) || 1));
  if (preferences.narrationVoice === SYSTEM_NARRATION_VOICE_URI) {
    if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') {
      updateNarrationDemoUi('A device voice is not available in this browser. You can still use the included Ava voice in the course.', false);
      return;
    }
    const utterance = new window.SpeechSynthesisUtterance(NARRATION_DEMO_TEXT);
    narrationDemo.utterance = utterance;
    narrationDemo.active = true;
    utterance.rate = rate;
    utterance.volume = volume;
    utterance.onend = () => finishNarrationDemo('The short example finished.', utterance);
    utterance.onerror = (event) => {
      if (event?.error === 'canceled' || event?.error === 'interrupted') return;
      finishNarrationDemo('The device voice example could not play. You can still choose another speed.', utterance);
    };
    updateNarrationDemoUi('Playing a short device-voice example at ' + rate + '×.', true);
    try {
      window.speechSynthesis.speak(utterance);
    } catch (_) {
      finishNarrationDemo('The device voice example could not start. You can still choose another speed.', utterance);
    }
    return;
  }
  if (typeof window === 'undefined' || typeof window.Audio !== 'function') {
    updateNarrationDemoUi('Audio preview is not available in this browser. The included Ava voice remains available in the course.', false);
    return;
  }
  const audio = new window.Audio(NARRATION_DEMO_URL);
  narrationDemo.audio = audio;
  narrationDemo.active = true;
  try { audio.preload = 'auto'; } catch (_) { /* Loading the optional demo is best-effort. */ }
  try { audio.playbackRate = rate; } catch (_) { /* Playback rate support is browser-dependent. */ }
  try { audio.volume = volume; } catch (_) { /* Volume support is browser-dependent. */ }
  audio.ontimeupdate = () => {
    if (audio.currentTime >= NARRATION_DEMO_MAX_SECONDS) {
      stopNarrationDemo('The short example finished.');
    }
  };
  audio.onended = () => finishNarrationDemo('The short example finished.', audio);
  audio.onerror = () => finishNarrationDemo('The included Ava example could not play. You can still choose another speed.', audio);
  updateNarrationDemoUi('Playing a short Ava example at ' + rate + '×.', true);
  try {
    const playback = audio.play();
    if (playback && typeof playback.catch === 'function') {
      playback.catch(() => finishNarrationDemo('The included Ava example could not start. Check your browser audio settings, then try again.', audio));
    }
  } catch (_) {
    finishNarrationDemo('The included Ava example could not start. Check your browser audio settings, then try again.', audio);
  }
};
const progress = (id) => {
  try {
    const saved = JSON.parse(localStorage.getItem('type2learn-course-prototype-v1:' + encodeURIComponent(id) + ':' + courseId) || 'null') || {};
    const finalExamComplete = Boolean(saved.progress?.finalExam?.completed || saved.progress?.phase === 'exam-results');
    return { complete: finalExamComplete ? 11 : (Array.isArray(saved.progress?.completedSteps) ? saved.progress.completedSteps.length : 0), step: (Number(saved.progress?.lessonIndex) || 0) + 1, finalExamComplete };
  } catch (_) { return { complete: 0, step: 1, finalExamComplete: false }; }
};
const source = (settings, key) => '<small class="setting-source">' + escapeHtml(settingSource(settings, key)) + '</small>';
const profilesFor = (settings) => (settings.selectedPresetIds || []).map((id) => getPreset(id)).filter((preset) => preset && preset.id !== BALANCED_START_PRESET_ID);
const setupName = (settings) => {
  const names = profilesFor(settings).map((preset) => preset.name);
  return names.length ? names[0] + (names.length > 1 ? ' + ' + (names.length - 1) + ' more' : '') : 'Balanced Starting Setup';
};
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const SETTING_DETAILS = {
  smallerSections: ['Smaller content sections', 'Show one reading section at a time, with a clear Next section control.'],
  visibleNextSteps: ['Visible next steps', 'Keep Now, Next, and Done clear.'],
  visibleProgress: ['Visible progress', 'Use calm step-by-step progress language.'],
  gentleReminders: ['Gentle reminders', 'Optional, with no streak or penalty.'],
  fewerDistractions: ['Fewer distractions', 'Keep module navigation while hiding non-essential decoration.'],
  textSize: ['Text size', 'Choose a comfortable reading size.'],
  spacing: ['Text spacing', 'Switch between standard and extra spacing.'],
  readingWidth: ['Reading width', 'Keep text at a comfortable line length.'],
  extraExamples: ['More examples', 'Show additional authored examples where available. Applies when the current activity supports this option.'],
  simplerExplanations: ['Simpler explanations', 'Show an authored plain-language explanation where available. Applies when the current activity supports this option.'],
  literalInstructions: ['Literal instructions', 'Make the action and completion condition explicit.'],
  recap: ['Recap and repetition', 'Show a recap where the lesson provides one. Applies when the current activity supports this option.'],
  readAloud: ['Text to speech mode', 'Turn on optional text-to-speech controls.'],
  narrationSpeed: ['Narration speed', 'Choose a comfortable playback speed.'],
  narrationVoice: ['Narration voice', 'Microsoft Edge Ava is included for this course. You can switch to a device voice from the course text-to-speech controls.'],
  narrationVolume: ['Narration volume', 'Choose a comfortable volume for optional narration.'],
  narrationAutoScroll: ['Auto-scroll while listening', 'Keep the current section in view only when you choose it.'],
  narrationHighlight: ['Narration highlighting', 'Mark the text currently being read aloud.'],
  alternativeInput: ['Alternative input', 'Change how you submit the answer, such as typing, speaking, or using another input method. Applies when the current activity supports this option.'],
  speechToText: ['Voice input and speech-to-text', 'Show a microphone option for eligible activities when your browser or device supports speech recognition.'],
  alternativeResponses: ['Alternative response formats', 'Use another valid answer format when the learning objective allows it. Applies when the current activity supports this option.'],
  oneHandedInput: ['One-handed input', 'Keep key controls left-aligned and comfortably sized.'],
  switchInput: ['Switch input', 'Use Tab to move, then Space or Enter to activate a focused control.'],
  keyboardShortcuts: ['Keyboard shortcuts', 'Alt+P opens Pause and save. Alt+H opens I’m stuck.'],
  largerControls: ['Larger controls', 'Increase button, answer, and input target size.'],
  reducedRepeatedMovement: ['Reduced repeated movement', 'Keep primary task actions available while you read.'],
  restBreaks: ['Rest breaks', 'Keep Take a short break available in I’m stuck without losing progress.'],
  reducedMotion: ['Reduce motion', 'Remove non-essential animation and smooth scrolling.'],
  contentTransitions: ['Animate content changes', 'Gently fade a new small reading section into place. This stays off when your device or settings request reduced motion.'],
  quietDisplay: ['Quiet display', 'Use fewer non-essential visual details.'],
  stableLayout: ['Stable layout', 'Keep controls and content in consistent places with minimal transition.'],
  advanceNotice: ['Advance notice', 'Show what is next before the learning task changes.'],
  highContrast: ['High contrast', 'Increase visual distinction without forcing one colour scheme.'],
  extraHints: ['Extra hints', 'Show an authored hint where one exists. Applies when the current activity supports this option.'],
  numericProgress: ['Numeric progress', 'Choose how much number-based progress detail to show.'],
  automaticSaving: ['Automatic saving', 'Always on to protect your work.'],
  noTimers: ['No countdown timers', 'Use estimates without pressure.'],
  pauseResume: ['Pause and resume', 'Leave and return without losing your place.'],
  easyReturn: ['Easy return', 'Keep the saved return point clear after a pause.'],
  writtenInstructions: ['Written instructions', 'Keep essential directions visible in writing.'],
  captionsTranscripts: ['Captions and transcripts', 'Keep a written equivalent available where media uses audio.'],
  noAutoplay: ['No autoplay', 'Audio and narration only start when you choose them.'],
  noUnexpectedSound: ['No unexpected sound', 'Keep audio quiet until you deliberately start it.'],
  flexibleTiming: ['Flexible timing', 'Keep the pace in your control.'],
  noTimedTyping: ['No timed typing requirement', 'Typing speed is not required for learning progress.'],
  spellingExemption: ['Flexible spelling and handwriting scoring', 'Only assess spelling or handwriting when it is the learning objective.'],
  oneTask: ['One task at a time', 'Reveal one clear learning action before the next.']
};
const settingDetail = (key) => SETTING_DETAILS[key] || [String(key).replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()), 'This is a shared learning control.'];
const settingLabel = (key) => settingDetail(key)[0];
const formatSettingValue = (key, value) => {
  if (key === 'narrationAutoScroll') return value ? 'Auto-scroll while listening' : 'Manual scrolling while listening';
  if (key === 'narrationVolume') return Math.round(Number(value) * 100) + '%';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (key === 'narrationSpeed') return String(value) + '×';
  if (key === 'narrationVoice') return value === SYSTEM_NARRATION_VOICE_URI ? 'Device voice' : 'Microsoft Edge Ava (included)';
  if (key === 'numericProgress') return value === 'reduced' ? 'Reduced numbers' : 'Full numbers';
  if (key === 'textSize') return value === 'extra-large' ? 'Extra large' : String(value).replace(/^./, (letter) => letter.toUpperCase());
  if (key === 'spacing') return value === 'relaxed' ? 'Extra spacing' : 'Standard';
  if (key === 'readingWidth') return String(value || 'comfortable').replace(/^./, (letter) => letter.toUpperCase());
  return String(value || 'System default').replace(/-/g, ' ');
};
const hasSetting = (settings, key) => hasOwn(resolveSettings(settings), key);
const clearOverrideLabel = (settings, key) => {
  const nextSource = settingSource(clearUserOverride(settings, key), key);
  if (nextSource === 'Platform default') return 'Use platform default';
  if (nextSource === 'Always on to protect your work') return 'Use required protection';
  if (nextSource.startsWith('Recommended by ')) return 'Use ' + nextSource.slice('Recommended by '.length) + ' recommendation';
  if (nextSource.startsWith('Provided by ')) return 'Use ' + nextSource.slice('Provided by '.length) + ' setting';
  return 'Use saved lesson setting';
};
const overrideResetControl = (settings, key) => hasOwn(settings.userOverrides, key)
  ? '<button class="setting-reset" type="button" data-clear-setting="' + escapeHtml(key) + '">' + escapeHtml(clearOverrideLabel(settings, key)) + '</button>'
  : '';
const wrapSharedControl = (settings, key, content) => '<div class="setting-control" data-setting-control="' + escapeHtml(key) + '">' + content + overrideResetControl(settings, key) + '</div>';
const sharedToggle = (settings, key, title, copy) => {
  const value = resolveSettings(settings)[key];
  return wrapSharedControl(settings, key, '<label class="support-toggle"><input type="checkbox" data-setting="' + escapeHtml(key) + '"' + (value ? ' checked' : '') + '><span><strong>' + escapeHtml(title) + '</strong><small>' + escapeHtml(copy) + '</small>' + source(settings, key) + '</span></label>');
};
const contentTransitionsToggle = (settings) => {
  const preferences = resolveSettings(settings);
  const [title, copy] = settingDetail('contentTransitions');
  const locked = Boolean(preferences.reducedMotion);
  const lockMessage = 'Turn off Reduce motion to unlock this control. Your device’s reduced-motion preference will also keep transitions off.';
  return '<div class="setting-control" data-setting-control="contentTransitions"><label class="support-toggle' + (locked ? ' is-locked' : '') + '"' + (locked ? ' aria-disabled="true"' : '') + '><input type="checkbox" data-setting="contentTransitions"' + (preferences.contentTransitions ? ' checked' : '') + (locked ? ' disabled' : '') + '><span><strong>' + escapeHtml(title) + '</strong><small>' + escapeHtml(copy) + '</small>' + (locked ? '<small class="setting-lock-note">' + escapeHtml(lockMessage) + '</small>' : '') + source(settings, 'contentTransitions') + '</span></label></div>';
};
const sharedSelect = (settings, key, title, options, after = '') => {
  const value = resolveSettings(settings)[key];
  return wrapSharedControl(settings, key, '<label class="select-setting"><strong>' + escapeHtml(title) + '</strong><select data-setting="' + escapeHtml(key) + '">' + options.map(([item, label]) => '<option value="' + escapeHtml(item) + '"' + (value === item ? ' selected' : '') + '>' + escapeHtml(label) + '</option>').join('') + '</select>' + source(settings, key) + '</label>' + after);
};
const narrationSpeedDemo = (settings) => {
  const speed = formatSettingValue('narrationSpeed', resolveSettings(settings).narrationSpeed);
  return '<div data-narration-speed-demo><div class="learner-actions"><button class="learner-button is-secondary" type="button" data-play-narration-demo aria-describedby="narration-demo-status">Play a short example</button><button class="learner-button is-secondary" type="button" data-stop-narration-demo hidden>Stop example</button></div><small id="narration-demo-status" data-narration-demo-status role="status" aria-live="polite">Hear the selected ' + escapeHtml(speed) + ' pace. Audio plays only when you choose the example.</small></div>';
};
const controlForSharedSetting = (settings, key) => {
  if (!hasSetting(settings, key)) return '';
  const [title, copy] = settingDetail(key);
  if (key === 'textSize') return sharedSelect(settings, key, title, [['standard', 'Standard'], ['large', 'Large'], ['extra-large', 'Extra large']]);
  if (key === 'spacing') return sharedSelect(settings, key, title, [['standard', 'Standard'], ['relaxed', 'Extra spacing']]);
  if (key === 'readingWidth') return sharedSelect(settings, key, title, [['narrow', 'Narrow'], ['comfortable', 'Comfortable'], ['wide', 'Wide']]);
  if (key === 'narrationSpeed') return sharedSelect(settings, key, title, [['0.75', '0.75×'], ['1', '1×'], ['1.25', '1.25×'], ['1.5', '1.5×']], narrationSpeedDemo(settings));
  if (key === 'narrationVolume') return sharedSelect(settings, key, title, [['0.5', '50%'], ['0.75', '75%'], ['1', '100%']]);
  if (key === 'numericProgress') return sharedSelect(settings, key, title, [['full', 'Full numbers'], ['reduced', 'Reduced numbers']]);
  if (key === 'narrationVoice') {
    return sharedSelect(settings, key, title, [[LOCAL_AVA_VOICE_URI, 'Microsoft Edge Ava (included)'], [SYSTEM_NARRATION_VOICE_URI, 'Device voice']]);
  }
  if (key === 'contentTransitions') return contentTransitionsToggle(settings);
  return sharedToggle(settings, key, title, copy);
};
const ALL_SETTING_GROUPS = [
  { id: 'focus-settings', label: 'Focus and pacing', title: 'Keep the next action visible.', keys: ['smallerSections', 'visibleNextSteps', 'visibleProgress', 'gentleReminders', 'fewerDistractions'] },
  { id: 'text-display', label: 'Reading and explanations', title: 'Make the material easier to take in.', keys: ['textSize', 'spacing', 'readingWidth', 'extraExamples', 'simplerExplanations', 'literalInstructions', 'recap'] },
  { id: 'audio-access', label: 'Audio and access', title: 'Keep written information available alongside optional audio.', keys: ['readAloud', 'narrationSpeed', 'narrationVoice', 'narrationAutoScroll', 'narrationHighlight'] },
  { id: 'input-expression', label: 'Input and expression', title: 'Choose how you show your thinking.', keys: ['alternativeInput', 'speechToText', 'alternativeResponses', 'oneHandedInput', 'switchInput', 'keyboardShortcuts'] },
  { id: 'motor-comfort', label: 'Motor comfort and fatigue', title: 'Reduce unnecessary effort and keep breaks available.', keys: ['largerControls', 'reducedRepeatedMovement', 'restBreaks'] },
  { id: 'sensory-comfort', label: 'Sensory and visual comfort', title: 'Control the environment around the task.', keys: ['reducedMotion', 'contentTransitions', 'quietDisplay', 'stableLayout', 'advanceNotice', 'highContrast'] },
  { id: 'progress-feedback', label: 'Progress and feedback', title: 'Motivation without pressure.', keys: ['extraHints', 'numericProgress'] }
];
const NARRATION_SUBSETTING_KEYS = new Set(['narrationSpeed', 'narrationVoice', 'narrationVolume', 'narrationAutoScroll', 'narrationHighlight']);
const profileSettingKeys = (preset) => getLearnerVisibleSettingKeys(preset);
const profileSettingItems = (preset, limit = 0) => profileSettingKeys(preset).slice(0, limit || undefined).map((key) => '<li><strong>' + escapeHtml(settingLabel(key)) + '</strong><span>' + escapeHtml(formatSettingValue(key, preset.settings[key])) + '</span></li>').join('');
const profileCoreSettingItems = (preset) => profileSettingItems(preset, 4);
const profileAdditionalSettingItems = (preset) => profileSettingKeys(preset).slice(4).map((key) => '<li><strong>' + escapeHtml(settingLabel(key)) + '</strong><span>' + escapeHtml(formatSettingValue(key, preset.settings[key])) + '</span></li>').join('');
const previewStateForProfiles = (settings, ids) => {
  const profileIds = Array.from(new Set(ids || [])).filter((id) => getPreset(id));
  if (!getPresetSelectionAnalysis(settings, profileIds).canApply) return createSettingsState(settings);
  const primary = profileIds.includes(settings.primaryPresetId) ? settings.primaryPresetId : (profileIds[0] || BALANCED_START_PRESET_ID);
  return selectSupportProfiles(settings, profileIds, { primaryProfileId: primary, method: 'manual', completed: true });
};
const presetConflictSummary = (analysis) => {
  if (!analysis.conflicts.length) return '<p class="preset-summary-status is-compatible">Compatible. This combination is ready to review.</p>';
  return '<div class="preset-conflict-summary" role="status" aria-live="polite"><strong>' + (analysis.blockingConflicts.length ? 'Needs a preference choice' : 'Compatibility reviewed') + '</strong><ul>' + analysis.conflicts.map((conflict) => '<li>' + escapeHtml(conflict.message) + (conflict.key ? '<span class="preset-conflict-actions"><button class="learner-button is-secondary" type="button" data-preset-conflict="' + escapeHtml(conflict.id) + '" data-preset-conflict-choice="keep-first">Keep first value</button><button class="learner-button is-secondary" type="button" data-preset-conflict="' + escapeHtml(conflict.id) + '" data-preset-conflict-choice="use-second">Use second value</button><button class="learner-button is-secondary" type="button" data-preset-conflict="' + escapeHtml(conflict.id) + '" data-preset-conflict-choice="disable">Disable this setting</button></span>' : '') + '</li>').join('') + '</ul></div>';
};
const combinedPreview = (settings, ids = settings.selectedPresetIds || [], pending = false) => {
  const analysis = getPresetSelectionAnalysis(settings, ids);
  const previewState = previewStateForProfiles(settings, ids);
  // When a pending combination needs a decision, show the bundles the learner
  // actually selected rather than falling back to the previously saved setup.
  // This keeps the summary and its conflict message about the same choice.
  const profiles = analysis.canApply ? profilesFor(previewState) : analysis.profiles;
  const profileKeys = Array.from(new Set(profiles.flatMap((preset) => profileSettingKeys(preset))));
  const fallbackKeys = getLearnerVisibleSettingKeys(['visibleNextSteps', 'visibleProgress', 'textSize', 'spacing', 'readingWidth']).filter((key) => hasSetting(previewState, key));
  const keys = profileKeys.length ? profileKeys : fallbackKeys;
  const name = profiles.length ? profiles.map((preset) => preset.name).join(' + ') : 'Balanced Starting Setup';
  const customLabel = previewState.customSetup ? '<span class="preset-custom-state">Custom setup</span>' : '';
  return '<section class="combined-settings-preview"' + (pending ? ' data-pending-profile-preview' : '') + ' aria-live="polite"><p class="learner-eyebrow">Selected-preset summary</p><h3>' + escapeHtml(name) + ' ' + customLabel + '</h3><p>Selected support bundles: ' + profiles.length + ' · Combined settings: ' + analysis.combinedSettingKeys.length + ' · Duplicate settings merged: ' + analysis.duplicateSettingKeys.length + ' · Conflicts: ' + analysis.blockingConflicts.length + '</p>' + presetConflictSummary(analysis) + (analysis.canApply ? '<ul class="combined-settings-list">' + keys.map((key) => '<li><div><strong>' + escapeHtml(settingLabel(key)) + '</strong><span>' + escapeHtml(formatSettingValue(key, resolveSettings(previewState)[key])) + '</span></div>' + source(previewState, key) + '</li>').join('') + '</ul>' : '') + '</section>';
};
const selectedSupportCards = (settings) => {
  const profiles = profilesFor(settings);
  if (!profiles.length) return '<article class="selected-support-card is-balanced"><p class="learner-eyebrow">Current starting point</p><h3>Balanced Starting Setup</h3><p>A calm standard learning space with written instructions, autosave, and no countdown pressure.</p><p class="settings-note">You can add one or more support approaches below. These are support suggestions, not diagnoses.</p></article>';
  return profiles.map((preset) => '<article class="selected-support-card"><p class="learner-eyebrow">Selected support · ' + escapeHtml(preset.category) + '</p><h3>' + escapeHtml(preset.name) + '</h3><p>' + escapeHtml(preset.description) + '</p><p class="profile-settings-heading">Core settings</p><ul class="profile-setting-highlights selected-support-highlights">' + profileCoreSettingItems(preset) + '</ul>' + (profileAdditionalSettingItems(preset) ? '<details class="selected-support-details"><summary>Additional settings applied</summary><ul class="profile-setting-list">' + profileAdditionalSettingItems(preset) + '</ul></details>' : '') + '<button class="learner-button is-secondary selected-support-remove" type="button" data-remove-selected-profile="' + escapeHtml(preset.id) + '">Remove ' + escapeHtml(preset.name) + '</button></article>').join('');
};
const supportProfileCards = (settings, pendingIds = settings.selectedPresetIds || []) => {
  const selected = new Set(pendingIds);
  return PRESETS.map((preset) => {
    const selectedNow = selected.has(preset.id);
    const candidate = selectedNow ? getPresetSelectionAnalysis(settings, pendingIds) : getPresetSelectionAnalysis(settings, [...pendingIds, preset.id]);
    const relevantConflict = candidate.blockingConflicts.find((conflict) => !conflict.profileIds || conflict.profileIds.includes(preset.id));
    const status = selectedNow
      ? 'Already included'
      : relevantConflict
        ? 'Conflicts with current setup'
        : candidate.duplicateSettingKeys.length
          ? 'Compatible · duplicate settings merge'
          : 'Compatible';
    return '<article class="manual-profile' + (selectedNow ? ' is-selected' : '') + (relevantConflict && !selectedNow ? ' has-conflict' : '') + '"><label><input type="checkbox" data-settings-profile value="' + escapeHtml(preset.id) + '"' + (selectedNow ? ' checked' : '') + '><span><strong>' + escapeHtml(preset.name) + '</strong><p>' + escapeHtml(preset.description) + '</p><small>' + escapeHtml(status) + '</small></span></label><p class="profile-category">' + escapeHtml(preset.category) + '</p><p class="profile-settings-heading">Core settings</p><ul class="profile-setting-highlights">' + profileCoreSettingItems(preset) + '</ul>' + (profileAdditionalSettingItems(preset) ? '<details><summary>Additional settings applied</summary><ul class="profile-setting-list">' + profileAdditionalSettingItems(preset) + '</ul></details>' : '') + (relevantConflict && !selectedNow ? '<p class="preset-card-conflict">' + escapeHtml(relevantConflict.message) + '</p>' : '') + '</article>';
  }).join('');
};
const settingsTabsFor = (groups) => [{ id: 'support-setup', label: 'Support setup' }, ...groups.map((group) => ({ id: group.id, label: group.label })), { id: 'bunny-companion', label: 'Bunny companion' }, { id: 'built-in-protections', label: 'Built-in protections' }, { id: 'saved-choices', label: 'Saved choices' }];
const currentSettingsTab = (groups) => {
  const requested = (window.location.hash || '').replace(/^#/, '');
  const aliases = { 'selected-supports': 'support-setup', 'support-profiles': 'support-setup', presets: 'support-setup' };
  const id = aliases[requested] || requested;
  return settingsTabsFor(groups).some((tab) => tab.id === id) ? id : 'support-setup';
};
const settingsTabButton = (tab, active) => '<button class="settings-tab-button" type="button" role="tab" id="settings-tab-' + escapeHtml(tab.id) + '" aria-controls="settings-panel-' + escapeHtml(tab.id) + '" aria-selected="' + String(active) + '" tabindex="' + (active ? '0' : '-1') + '" data-settings-tab="' + escapeHtml(tab.id) + '"><span>' + escapeHtml(tab.label) + '</span></button>';
const settingsTabPanel = (id, active, content) => '<section class="settings-tab-panel" id="settings-panel-' + escapeHtml(id) + '" role="tabpanel" aria-labelledby="settings-tab-' + escapeHtml(id) + '" data-settings-panel="' + escapeHtml(id) + '"' + (active ? '' : ' hidden') + '>' + content + '</section>';
const temporarySettingsNotice = (settings) => {
  const keys = Object.keys(settings.temporaryOverrides || {});
  if (!keys.length) return '<p class="settings-temporary-note">There are no temporary lesson changes waiting to be cleared.</p>';
  const labels = keys.map((key) => settingLabel(key)).join(', ');
  return '<aside class="settings-temporary-notice"><strong>A lesson change is active.</strong><p>' + escapeHtml(labels) + ' currently takes priority while you are in this lesson. Clearing it restores your saved setting without changing course progress.</p><button class="learner-button is-secondary" type="button" data-clear-temporary>Clear temporary lesson changes</button></aside>';
};
const supportSetupPanel = (settings) => {
  const pendingIds = pendingProfileIds || settings.selectedPresetIds || [];
  return '<section class="learner-card settings-section selected-support-recommendations"><p class="learner-eyebrow">Selected support recommendations</p><h2>Support approaches you are using now.</h2><p>These are support suggestions, not diagnoses. You can combine approaches, replace them, or remove them. Your own setting changes always take priority.</p><div class="selected-support-card-grid">' + selectedSupportCards(settings) + '</div>' + combinedPreview(settings, pendingIds, true) + '<div class="learner-actions"><a class="learner-button is-secondary" href="/learn/?setup=manual&amp;next=%2Fsettings%2F">Replace support approaches</a><a class="learner-button is-secondary" href="/learn/?setup=questionnaire&amp;next=%2Fsettings%2F">Review my starting setup</a><button class="learner-button is-secondary" type="button" data-reset-preset>Reset to selected presets</button><button class="learner-button is-secondary" type="button" data-reset-recommendation>Use balanced starting setup</button></div></section><section class="learner-card settings-section support-profile-browser"><p class="learner-eyebrow">Support profile browser</p><h2>Add compatible support approaches.</h2><p>Choose up to three compatible support bundles. Each card shows every setting it can add. Your individual setting changes still take priority.</p><div class="manual-profile-list">' + supportProfileCards(settings, pendingIds) + '</div><div class="learner-actions"><button class="learner-button is-primary" type="button" data-apply-profiles>Review final setup</button><button class="learner-button is-secondary" type="button" data-clear-questionnaire>Clear saved support-check answers</button></div><p class="settings-note">Profiles are private support bundles, not diagnoses. A conflicting combination is explained before it can be applied.</p></section>';
};
const builtInProtectionsPanel = () => {
  const rows = Array.from(BUILT_IN_PROTECTION_KEYS).map((key) => {
    const [title, copy] = settingDetail(key);
    return '<li class="protection-row"><div><strong>' + escapeHtml(title) + '</strong><small>' + escapeHtml(copy) + '</small></div><span class="protection-state">Always on</span></li>';
  }).join('');
  return '<section class="learner-card settings-section built-in-protections"><p class="learner-eyebrow">Learning safety</p><h2>Built-in learner protections</h2><p>These protections are always enabled to keep learning safe, flexible, and pressure-free.</p><ul class="protection-list">' + rows + '</ul></section>';
};
const savedChoicesPanel = (settings) => '<section class="learner-card settings-section settings-maintenance"><p class="learner-eyebrow">Saved choices</p><h2>Keep or clear the changes you made.</h2><p>' + (settings.customSetup ? 'Custom setup is active. Your manual choices and any resolved preset preference stay in control.' : 'You are using the selected preset values and platform defaults.') + ' Your course progress stays intact when you update these controls.</p>' + temporarySettingsNotice(settings) + '<div class="learner-actions"><button class="learner-button is-secondary" type="button" data-keep-custom>Save custom setup</button><button class="learner-button is-secondary" type="button" data-reset-preset>Reset to selected presets</button><button class="learner-button is-secondary" type="button" data-reset-all-settings>Reset all settings</button></div></section><section class="learner-card settings-section"><p class="learner-eyebrow">Privacy</p><h2>These are learner controls, not a profile of you.</h2><p>Type2Learn does not use these choices to diagnose, rank, score, or infer anything about a learner. This prototype stores the settings in this browser for the signed-in account.</p><button class="learner-button is-secondary" type="button" data-signout>Sign out</button></section>';
const bunnyCompanionPanel = () => {
  const preferences = getMascotSettings();
  const toggle = (key, title, copy) => '<label class="support-toggle"><input type="checkbox" role="switch" data-mascot-setting="' + key + '"' + (preferences[key] ? ' checked' : '') + '><span><strong>' + title + '</strong><small>' + copy + '</small><small class="setting-source">Saved in this browser</small></span></label>';
  return '<section class="learner-card settings-section bunny-companion-settings"><p class="learner-eyebrow">Optional companion</p><h2>Choose how the bunny companion appears.</h2><p>The companion is an optional page helper. Its choices stay in this browser and do not change your course progress or support profile.</p><div class="control-grid">' + toggle('enabled', 'Show bunny companion', 'Keep a small bunny companion in the lower-right corner on supported pages. It is not shown during active course tasks.') + toggle('easyReading', 'Easy reading font', 'Use a clearer system text style across supported pages. Logo artwork is unchanged.') + toggle('voiceEnabled', 'Voice on hover', 'Read its current message only when you hover or choose the companion. It never starts by itself.') + '</div><p class="learner-status" data-mascot-settings-status role="status" aria-live="polite">Changes apply right away and stay saved in this browser.</p></section>';
};
const readingPreview = () => '<aside class="settings-reading-preview" aria-label="Reading setting preview"><strong>Preview</strong><p>This short paragraph uses your current text size, spacing, and reading width. It should feel clear without changing the lesson itself.</p></aside>';
const inputMethodLabels = {
  keyboard: 'Keyboard typing',
  voice: 'Voice input',
  alternative: 'Alternative response when the activity supports it',
  switch: 'Switch-friendly keyboard controls',
  'one-handed': 'One-handed keyboard layout'
};
const activeInputMethodControl = (settings) => {
  const available = getAvailableInputMethods(settings);
  const active = available.includes(settings.activeInputMethod) ? settings.activeInputMethod : 'keyboard';
  return '<div class="setting-control active-input-method-control"><label class="select-setting"><strong>Active input method</strong><select data-active-input-method aria-describedby="active-input-method-help">' + available.map((method) => '<option value="' + escapeHtml(method) + '"' + (method === active ? ' selected' : '') + '>' + escapeHtml(inputMethodLabels[method] || method) + '</option>').join('') + '</select><small id="active-input-method-help">Only one input method is active at a time, so controls do not compete for keyboard focus. Other selected methods remain available when a task supports them.</small><small class="setting-source">Saved in this browser</small></label></div>';
};
const settingsControls = (settings) => {
  const narrationEnabled = Boolean(resolveSettings(settings).readAloud);
  const groups = ALL_SETTING_GROUPS.map((group) => ({
    ...group,
    keys: group.keys.filter((key) => hasSetting(settings, key) && (narrationEnabled || !NARRATION_SUBSETTING_KEYS.has(key)))
  })).filter((group) => group.keys.length);
  const tabs = settingsTabsFor(groups);
  const active = currentSettingsTab(groups);
  const categoryPanels = groups.map((group) => {
    const narrationNote = group.id === 'audio-access' && !narrationEnabled
      ? '<p class="settings-dependent-note">Turn on Text-to-speech mode to adjust narration speed, voice, auto-scroll, and highlighting.</p>'
      : '';
    const content = '<section class="learner-card settings-section"><header><div><p class="learner-eyebrow">' + escapeHtml(group.label) + '</p><h2>' + escapeHtml(group.title) + '</h2></div></header><p class="settings-category-copy">Every change is saved in this browser for this signed-in learner. The course applies it when you return.</p>' + narrationNote + (group.id === 'text-display' ? readingPreview() : '') + '<div class="control-grid">' + group.keys.map((key) => controlForSharedSetting(settings, key)).join('') + (group.id === 'audio-access' && narrationEnabled ? controlForSharedSetting(settings, 'narrationVolume') : '') + '</div>' + (group.id === 'input-expression' ? activeInputMethodControl(settings) : '') + '</section>';
    return settingsTabPanel(group.id, active === group.id, content);
  }).join('');
  return '<div class="settings-workbench"><nav class="settings-tab-list" role="tablist" aria-label="Learning settings sections"><p class="settings-tab-list-label">Settings sections</p>' + tabs.map((tab) => settingsTabButton(tab, tab.id === active)).join('') + '</nav><div class="settings-tab-content">' + settingsTabPanel('support-setup', active === 'support-setup', supportSetupPanel(settings)) + categoryPanels + settingsTabPanel('bunny-companion', active === 'bunny-companion', bunnyCompanionPanel()) + settingsTabPanel('built-in-protections', active === 'built-in-protections', builtInProtectionsPanel()) + settingsTabPanel('saved-choices', active === 'saved-choices', savedChoicesPanel(settings)) + '</div></div>';
};
const settingsPersistenceStatus = (message = '') => {
  const failed = Boolean(pendingSettingsSave);
  return '<div class="settings-persistence-feedback"><p class="learner-status settings-page-status" data-settings-save-status role="' + (failed ? 'alert' : 'status') + '" aria-live="' + (failed ? 'assertive' : 'polite') + '">' + escapeHtml(message) + '</p>' + (failed ? '<button class="learner-button is-secondary" type="button" data-retry-settings-save>Retry saving</button>' : '') + '</div>';
};
const enhancedSettingsPage = (user, settings, message = '') => header() + '<main class="learner-shell" id="learner-main"><p class="learner-eyebrow">Learning settings</p><h1 class="learner-title">Choose what helps today.</h1><p class="learner-lead">Start with support approaches that feel useful. You never need to declare a diagnosis, and your own changes always take priority.</p>' + settingsPersistenceStatus(message) + '<div class="settings-main">' + settingsControls(settings) + '</div></main>';

const applyLearnerPagePreferences = (settings) => {
  const preferences = resolveSettings(settings);
  document.body.dataset.learnerTextSize = preferences.textSize;
  document.body.dataset.learnerSpacing = preferences.spacing;
  document.body.dataset.learnerReadingWidth = preferences.readingWidth;
  document.body.classList.toggle('learner-high-contrast', Boolean(preferences.highContrast));
  document.body.classList.toggle('learner-large-controls', Boolean(preferences.largerControls));
  document.body.classList.toggle('learner-reduced-motion', Boolean(preferences.reducedMotion));
  document.body.classList.toggle('learner-quiet-display', Boolean(preferences.quietDisplay));
  document.body.classList.toggle('learner-one-handed-input', Boolean(preferences.oneHandedInput));
  document.body.classList.toggle('learner-switch-input', Boolean(preferences.switchInput));
};

const activateSettingsTab = (id, { focus = false, updateHash = false } = {}) => {
  const selected = document.querySelector('[data-settings-tab="' + id + '"]');
  if (!selected) return;
  document.querySelectorAll('[data-settings-tab]').forEach((tab) => {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    tab.classList.toggle('is-active', active);
  });
  document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
    const active = panel.dataset.settingsPanel === id;
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
  });
  if (updateHash && window.history?.replaceState) window.history.replaceState(null, '', window.location.pathname + window.location.search + '#' + id);
  if (focus) selected.focus();
};

const bindSettingsTabs = () => {
  if (view !== 'settings') return;
  const tabs = Array.from(document.querySelectorAll('[data-settings-tab]'));
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateSettingsTab(tab.dataset.settingsTab, { updateHash: true }));
    tab.addEventListener('keydown', (event) => {
      const keys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabs.length - 1;
      else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      else nextIndex = (index - 1 + tabs.length) % tabs.length;
      const next = tabs[nextIndex];
      activateSettingsTab(next.dataset.settingsTab, { focus: true, updateHash: true });
    });
  });
};

const profileResolvedSettingsSummary = (settings) => {
  const preferences = resolveSettings(settings);
  const items = [
    ['Text size', formatSettingValue('textSize', preferences.textSize)],
    ['Text spacing', formatSettingValue('spacing', preferences.spacing)],
    ['Reading width', formatSettingValue('readingWidth', preferences.readingWidth)],
    ['High contrast', formatSettingValue('highContrast', preferences.highContrast)],
    ['Reduce motion', formatSettingValue('reducedMotion', preferences.reducedMotion)],
    ['Larger controls', formatSettingValue('largerControls', preferences.largerControls)]
  ];
  return '<ul class="profile-resolved-settings" aria-label="Current resolved display settings">' + items.map(([label, value]) => '<li><strong>' + escapeHtml(label) + '</strong><span>' + escapeHtml(value) + '</span></li>').join('') + '</ul>';
};

const profilePage = (user, settings) => {
  const saved = progress(learnerId(user));
  const name = user.displayName?.trim() || user.email?.split('@')[0] || 'Type2Learn learner';
  const avatar = user.photoURL ? '<img src="' + escapeHtml(user.photoURL) + '" alt="">' : escapeHtml(initials(user));
  return header() + '<main class="learner-shell" id="learner-main"><p class="learner-eyebrow">Your profile</p><h1 class="learner-title">Your controls, progress, and privacy.</h1><div class="learner-grid"><section class="learner-card"><div class="profile-identity"><span class="profile-avatar">' + avatar + '</span><div><h2>' + escapeHtml(name) + '</h2><p>' + escapeHtml(user.email || 'Signed in account') + '</p></div></div><ul class="learner-meta-list"><li><strong>Current setup:</strong> ' + escapeHtml(setupName(settings)) + '</li><li><strong>Course progress:</strong> Step ' + saved.step + ' of 11 · ' + saved.complete + ' completed</li><li><strong>Data boundary:</strong> Support choices and course progress are saved locally for this signed-in learner in this prototype.</li></ul><div class="learner-actions"><a class="learner-button is-primary" href="/settings/">Change learning settings</a><a class="learner-button is-secondary" href="/course/">Continue course</a></div></section><aside class="learner-card"><p class="learner-eyebrow">Learning supports</p><h2>Private, changeable support.</h2><p>These settings are suggestions, not labels. No choice asks you to declare or prove a diagnosis.</p>' + profileResolvedSettingsSummary(settings) + '<div class="learner-actions"><a class="learner-button is-secondary" href="/learn/?setup=questionnaire&amp;next=%2Fprofile%2F">Review my starting setup</a><a class="learner-button is-secondary" href="/learn/?setup=manual&amp;next=%2Fprofile%2F">Browse support profiles</a></div></aside></div></main>';
};
const applyCourseCompletionStatus = (user) => {
  if (!progress(learnerId(user)).finalExamComplete) return;
  const progressItem = app.querySelector('.learner-meta-list li:nth-child(2)');
  if (progressItem) {
    progressItem.replaceChildren();
    const label = document.createElement('strong');
    label.textContent = 'Course status:';
    progressItem.append(label, ' Completed · 11 modules and final exam finished');
  }
  const courseLink = app.querySelector('.learner-actions a[href="/course/"]');
  if (courseLink) courseLink.textContent = 'Review completed course';
};
const showActionFeedback = (message) => {
  const feedback = document.querySelector('[data-settings-action-status]');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.hidden = false;
  feedback.classList.remove('is-visible');
  window.requestAnimationFrame(() => feedback.classList.add('is-visible'));
};
const updatePendingProfilePreview = (settings) => {
  const preview = document.querySelector('[data-pending-profile-preview]');
  if (!preview) return;
  const ids = pendingProfileIds || Array.from(document.querySelectorAll('[data-settings-profile]:checked')).map((control) => control.value);
  preview.outerHTML = combinedPreview(settings, ids, true);
};
const restoreSettingsControlPosition = (settingKey, previousTop) => {
  const updated = document.querySelector('[data-setting="' + settingKey + '"]');
  if (!updated) return;
  if (Number.isFinite(previousTop)) {
    const offset = updated.getBoundingClientRect().top - previousTop;
    if (Math.abs(offset) > 0.5) window.scrollBy({ top: offset, left: 0, behavior: 'auto' });
  }
  try {
    updated.focus({ preventScroll: true });
  } catch (_) {
    updated.focus();
  }
  updated.closest('.select-setting')?.classList.add('is-updated');
};
const persistSettingsAndRender = (user, candidate, {
  successMessage = '',
  actionMessage = '',
  restore = {}
} = {}) => {
  const next = saveLearnerSettings(learnerId(user), candidate);
  const saveStatus = getLearnerSettingsSaveStatus(next);
  if (saveStatus.ok !== true) {
    pendingSettingsSave = next;
    render(user, next, SETTINGS_SAVE_ERROR, restore);
    return next;
  }
  pendingSettingsSave = null;
  render(user, next, successMessage, restore);
  if (actionMessage) showActionFeedback(actionMessage);
  return next;
};
const render = (user, settings, message = '', restore = {}) => {
  const settingKey = typeof restore.settingKey === 'string' ? restore.settingKey : '';
  const previousTop = settingKey ? document.querySelector('[data-setting="' + settingKey + '"]')?.getBoundingClientRect().top : null;
  if (view === 'settings') stopNarrationDemo();
  applyLearnerPagePreferences(settings);
  app.innerHTML = view === 'settings' ? enhancedSettingsPage(user, settings, message) : profilePage(user, settings);
  mountType2LearnMascot();
  if (view === 'settings') {
    bindSettingsTabs();
    const groups = ALL_SETTING_GROUPS.map((group) => ({ ...group, keys: group.keys.filter((key) => hasSetting(settings, key)) })).filter((group) => group.keys.length);
    activateSettingsTab(currentSettingsTab(groups));
  }
  if (view !== 'settings') applyCourseCompletionStatus(user);
  if (settingKey) window.requestAnimationFrame(() => restoreSettingsControlPosition(settingKey, previousTop));
  const actionRow = document.querySelector('[data-apply-profiles]')?.parentElement;
  if (actionRow) {
    const feedback = document.createElement('p');
    feedback.className = 'settings-action-status';
    feedback.dataset.settingsActionStatus = '';
    feedback.hidden = true;
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    actionRow.insertAdjacentElement('afterend', feedback);
  }
  document.querySelectorAll('[data-signout]').forEach((button) => button.addEventListener('click', async () => { button.disabled = true; await signOutType2LearnUser(); window.location.assign('/'); }));
  document.querySelector('[data-retry-settings-save]')?.addEventListener('click', () => {
    persistSettingsAndRender(user, pendingSettingsSave || settings, { successMessage: 'Settings saved.' });
  });
  document.querySelector('[data-play-narration-demo]')?.addEventListener('click', () => playNarrationDemo(settings));
  document.querySelector('[data-stop-narration-demo]')?.addEventListener('click', () => stopNarrationDemo('The short example stopped.'));
  document.querySelectorAll('[data-mascot-setting]').forEach((control) => control.addEventListener('change', () => {
    const key = control.dataset.mascotSetting;
    const preferences = setMascotSettings({ [key]: control.checked });
    control.checked = Boolean(preferences[key]);
    control.setAttribute('aria-checked', String(Boolean(preferences[key])));
    const status = document.querySelector('[data-mascot-settings-status]');
    if (status) status.textContent = 'Bunny companion preference saved and applied.';
    notifyMascot({ event: 'settings-updated' });
  }));
  document.querySelectorAll('[data-settings-profile]').forEach((control) => control.addEventListener('change', () => {
    const pending = new Set(pendingProfileIds || settings.selectedPresetIds || []);
    if (control.checked) pending.add(control.value);
    else pending.delete(control.value);
    pendingProfileIds = Array.from(pending);
    const analysis = getPresetSelectionAnalysis(settings, pendingProfileIds);
    const status = control.closest('.manual-profile')?.querySelector('small');
    const conflict = analysis.blockingConflicts.find((item) => !item.profileIds || item.profileIds.includes(control.value));
    if (status) status.textContent = control.checked ? (conflict ? 'Conflicts with current setup' : 'Already included') : 'Compatible';
    updatePendingProfilePreview(settings);
    if (conflict) showActionFeedback(conflict.message);
  }));
  document.querySelectorAll('[data-preset-conflict]').forEach((button) => button.addEventListener('click', () => {
    const ids = pendingProfileIds || Array.from(document.querySelectorAll('[data-settings-profile]:checked')).map((control) => control.value);
    const conflict = getPresetSelectionAnalysis(settings, ids).conflicts.find((item) => item.id === button.dataset.presetConflict);
    if (!conflict?.key) return;
    const next = applyPresetConflictResolution(settings, conflict, button.dataset.presetConflictChoice);
    pendingProfileIds = ids;
    persistSettingsAndRender(user, next, {
      successMessage: 'Your preference choice was saved. Review the final setup when you are ready.'
    });
  }));
  document.querySelectorAll('[data-remove-selected-profile]').forEach((button) => button.addEventListener('click', () => {
    const ids = (settings.selectedPresetIds || []).filter((id) => id !== button.dataset.removeSelectedProfile);
    const primary = ids.includes(settings.primaryPresetId) ? settings.primaryPresetId : (ids[0] || BALANCED_START_PRESET_ID);
    const next = markSetupComplete(selectSupportProfiles(settings, ids, {
      primaryProfileId: primary,
      method: 'manual',
      selectedAnswers: settings.onboarding?.selectedAnswers || [],
      completed: true
    }));
    pendingProfileIds = null;
    persistSettingsAndRender(user, next, {
      successMessage: ids.length ? 'The selected support was removed. Your individual setting changes were kept.' : 'Balanced Starting Setup is active. Your individual setting changes were kept.'
    });
  }));
  document.querySelector('[data-apply-profiles]')?.addEventListener('click', () => {
    const ids = pendingProfileIds || Array.from(document.querySelectorAll('[data-settings-profile]:checked')).map((control) => control.value);
    const analysis = getPresetSelectionAnalysis(settings, ids);
    if (!analysis.canApply) {
      showActionFeedback(analysis.blockingConflicts[0]?.message || 'Review the support combination before applying it.');
      return;
    }
    const primary = ids.includes(settings.primaryPresetId) ? settings.primaryPresetId : (ids[0] || BALANCED_START_PRESET_ID);
    const next = markSetupComplete(selectSupportProfiles(settings, ids, { primaryProfileId: primary, method: 'manual', completed: true }));
    pendingProfileIds = null;
    persistSettingsAndRender(user, next, {
      successMessage: ids.length ? 'Selected support profiles were applied. Your custom setting changes were kept.' : 'Balanced Starting Setup is active. Your custom setting changes were kept.'
    });
  });
  document.querySelector('[data-reset-recommendation]')?.addEventListener('click', () => {
    pendingProfileIds = null;
    persistSettingsAndRender(user, resetRecommendation(settings), {
      successMessage: 'Your recommendation was reset to the balanced setup. Individual setting changes were kept.'
    });
  });
  document.querySelector('[data-clear-questionnaire]')?.addEventListener('click', () => {
    const hadAnswers = Boolean(settings.onboarding?.selectedAnswers?.length);
    persistSettingsAndRender(user, clearQuestionnaireAnswers(settings), {
      successMessage: hadAnswers ? 'Saved support-check answers were cleared. Your settings were kept.' : 'There are no saved support-check answers to clear.'
    });
  });
  document.querySelectorAll('[data-reset-preset]').forEach((button) => button.addEventListener('click', () => {
    const profileKeys = new Set((settings.selectedPresetIds || []).flatMap((id) => Object.keys(getPreset(id)?.settings || {})));
    const hadPresetSpecificOverride = Object.keys(settings.userOverrides || {}).some((key) => profileKeys.has(key));
    persistSettingsAndRender(user, resetPresetSettingsOnly(settings), {
      actionMessage: hadPresetSpecificOverride ? 'Selected-support setting changes were reset. Other custom settings were kept.' : 'There were no selected-support changes to reset.'
    });
  }));
  document.querySelector('[data-keep-custom]')?.addEventListener('click', () => {
    persistSettingsAndRender(user, markSetupComplete(settings), {
      actionMessage: 'Your custom settings were saved and kept.'
    });
  });
  document.querySelector('[data-reset-all-settings]')?.addEventListener('click', () => {
    if (!window.confirm('Reset all learning settings to the balanced starting setup? Your course progress will stay saved.')) return;
    pendingProfileIds = null;
    persistSettingsAndRender(user, resetAllLearnerSettings(settings), {
      successMessage: 'All learning settings were reset to the balanced starting setup. Your course progress was kept.'
    });
  });
  document.querySelector('[data-clear-temporary]')?.addEventListener('click', () => {
    const hadTemporaryChanges = Object.keys(settings.temporaryOverrides || {}).length > 0;
    persistSettingsAndRender(user, clearTemporaryOverrides(settings), {
      actionMessage: hadTemporaryChanges ? 'Temporary lesson changes were cleared.' : 'There are no temporary lesson changes to clear.'
    });
  });
  document.querySelectorAll('[data-clear-setting]').forEach((button) => button.addEventListener('click', () => {
    const settingKey = button.dataset.clearSetting;
    persistSettingsAndRender(user, clearUserOverride(settings, settingKey), {
      successMessage: 'Your individual change was cleared. The selected support or platform default is active again.',
      restore: { settingKey }
    });
  }));
  document.querySelectorAll('[data-setting]').forEach((control) => control.addEventListener('change', () => {
    const value = control.type === 'checkbox' ? control.checked : control.value;
    const settingKey = control.dataset.setting;
    if (settingKey === 'narrationSpeed' || settingKey === 'narrationVoice') stopNarrationDemo();
    persistSettingsAndRender(user, setUserOverride(settings, settingKey, value), {
      successMessage: 'Setting saved.',
      restore: { settingKey }
    });
  }));
  document.querySelector('[data-active-input-method]')?.addEventListener('change', (event) => {
    persistSettingsAndRender(user, setActiveInputMethod(settings, event.target.value), {
      successMessage: 'Active input method saved.'
    });
  });
};

window.addEventListener('hashchange', () => {
  if (view !== 'settings') return;
  const tabs = Array.from(document.querySelectorAll('[data-settings-tab]'));
  const requested = (window.location.hash || '').replace(/^#/, '');
  const aliases = { 'selected-supports': 'support-setup', 'support-profiles': 'support-setup', presets: 'support-setup' };
  const id = aliases[requested] || requested;
  if (tabs.some((tab) => tab.dataset.settingsTab === id)) activateSettingsTab(id);
});

app.innerHTML = '<main class="learner-loading" id="learner-main">Checking your private learner space…</main>';
window.addEventListener('pagehide', () => stopNarrationDemo());

const user = await waitForType2LearnUser();
if (!user) window.location.replace('/login/?next=' + encodeURIComponent(view === 'settings' ? '/settings/' : '/profile/'));
else if (!hasCompletedLearnerSetup(learnerId(user))) window.location.replace('/learn/?next=' + encodeURIComponent(view === 'settings' ? '/settings/' : '/profile/'));
else render(user, createSettingsState(loadLearnerSettings(learnerId(user))));
