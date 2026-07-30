import { waitForType2LearnUser, signOutType2LearnUser } from '/firebase-auth.js?v=20260721-2';
import { mountType2LearnMascot, notifyMascot } from '/mascot.js?v=20260723-bunny-web';
import {
  BALANCED_START_PRESET_ID,
  PRESETS,
  SUPPORT_QUESTIONNAIRE,
  applyRecommendation,
  applyPresetConflictResolution,
  createSettingsState,
  getPresetSelectionAnalysis,
  getLearnerVisibleSettingKeys,
  getPreset,
  loadLearnerSettings,
  markSetupComplete,
  recommendSupportProfiles,
  resolveSettings,
  saveLearnerSettings,
  selectSupportProfiles,
  useBalancedStartingSetup
} from '/learner-settings.js';

const app = document.getElementById('learner-app');
const courseId = 'course-1-neurodivergent-conditions-v2';
const DRAFT_PREFIX = 'type2learn-support-setup-draft-v1:';
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const learnerId = (user) => user?.uid || user?.email || 'learner';
const pageParams = () => new URLSearchParams(window.location.search);
const forcedSetupMode = () => {
  const mode = pageParams().get('setup');
  return ['questionnaire', 'manual'].includes(mode) ? mode : '';
};
const safeNext = () => {
  const next = pageParams().get('next');
  try {
    const destination = new URL(next || '/learn/', window.location.origin);
    return destination.origin === window.location.origin && new Set(['/course/', '/learn/', '/profile/', '/settings/']).has(destination.pathname) ? destination.pathname : '/learn/';
  } catch (_) { return '/learn/'; }
};
const learnerNavLink = (href, label, key, active) => '<a href="' + href + '"' + (active === key ? ' class="is-active" aria-current="page"' : '') + '>' + label + '</a>';
const learnerBackControl = (href = '', action = '') => action
  ? '<button class="learner-back-control" type="button" data-setup-action="' + action + '" aria-label="Go back"><svg class="learner-back-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H5M11 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9"/></svg></button>'
  : href ? '<a class="learner-back-control" href="' + href + '" aria-label="Go back"><svg class="learner-back-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H5M11 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9"/></svg></a>' : '';
const header = (active = 'learning', backHref = forcedSetupMode() ? safeNext() : '', backAction = '') => '<header class="learner-topbar"><div class="learner-topbar-inner"><div class="learner-brand-area">' + learnerBackControl(backHref, backAction) + '<a class="learner-brand" href="/learn/" aria-label="Type2Learn learning dashboard"><img src="/assets/type2learn-logo-nav.webp" alt=""><span>TYPE2LEARN</span></a></div><nav class="learner-top-actions" aria-label="Learner navigation">' + learnerNavLink('/learn/', 'Learning', 'learning', active) + learnerNavLink('/course/', 'Current lesson', 'course', active) + learnerNavLink('/settings/', 'Settings', 'settings', active) + learnerNavLink('/profile/', 'Profile', 'profile', active) + '<button type="button" data-signout>Sign out</button></nav></div></header>';
const draftKey = (user) => DRAFT_PREFIX + encodeURIComponent(learnerId(user));
const allQuestionOptionIds = new Set(SUPPORT_QUESTIONNAIRE.flatMap((question) => question.options.map((option) => option.id)));
const cleanAnswers = (answers) => Array.from(new Set(Array.isArray(answers) ? answers.filter((id) => allQuestionOptionIds.has(id)) : []));
const loadDraft = (user) => {
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey(user)) || 'null');
    if (!draft || typeof draft !== 'object') return null;
    return {
      screen: ['start', 'questions', 'recommendation', 'manual'].includes(draft.screen) ? draft.screen : 'start',
      questionIndex: Math.max(0, Math.min(SUPPORT_QUESTIONNAIRE.length - 1, Number(draft.questionIndex) || 0)),
       selectedAnswers: cleanAnswers(draft.selectedAnswers),
       manualProfileIds: Array.isArray(draft.manualProfileIds) ? draft.manualProfileIds.filter((id) => getPreset(id)) : [],
       manualProfilesInitialized: Boolean(draft.manualProfilesInitialized),
       primaryProfileId: getPreset(draft.primaryProfileId) ? draft.primaryProfileId : '',
      secondaryProfileIds: Array.isArray(draft.secondaryProfileIds) ? draft.secondaryProfileIds.filter((id) => getPreset(id)) : [],
      returnScreen: draft.returnScreen === 'recommendation' ? 'recommendation' : ''
    };
  } catch (_) { return null; }
};
const saveDraft = (user, flow) => {
  if (flow.screen === 'confirmation') return;
  try {
    sessionStorage.setItem(draftKey(user), JSON.stringify({
      screen: flow.screen,
       questionIndex: flow.questionIndex,
       selectedAnswers: cleanAnswers(flow.selectedAnswers),
       manualProfileIds: flow.manualProfileIds,
       manualProfilesInitialized: Boolean(flow.manualProfilesInitialized),
       primaryProfileId: flow.primaryProfileId,
      secondaryProfileIds: flow.secondaryProfileIds,
      returnScreen: flow.returnScreen
    }));
  } catch (_) { /* A session draft is optional; no learner is blocked if storage is unavailable. */ }
};
const clearDraft = (user) => {
  try { sessionStorage.removeItem(draftKey(user)); } catch (_) { /* no-op */ }
};
const courseProgress = (id) => {
  try {
    const saved = JSON.parse(localStorage.getItem('type2learn-course-prototype-v1:' + encodeURIComponent(id) + ':' + courseId) || 'null') || {};
    const finalExamComplete = Boolean(saved.progress?.finalExam?.completed || saved.progress?.phase === 'exam-results');
    const complete = finalExamComplete ? 11 : (Array.isArray(saved.progress?.completedSteps) ? saved.progress.completedSteps.length : 0);
    const step = Math.min((Number(saved.progress?.lessonIndex) || 0) + 1, 11);
    return { complete, step, phase: saved.progress?.phase || 'read', finalExamComplete };
  } catch (_) { return { complete: 0, step: 1, phase: 'read', finalExamComplete: false }; }
};

const settingLabels = {
  smallerSections: 'Smaller content sections',
  visibleNextSteps: 'Clear next steps',
  visibleProgress: 'Visible progress',
  gentleReminders: 'Gentle reminders',
  fewerDistractions: 'Fewer distractions',
  textSize: 'Text size',
  spacing: 'Text spacing',
  readingWidth: 'Reading width',
  extraExamples: 'More examples',
  simplerExplanations: 'Simpler explanations',
  literalInstructions: 'Literal instructions',
  recap: 'Quick recap',
  readAloud: 'Text to speech available',
  narrationSpeed: 'Narration speed',
  narrationVoice: 'Narration voice',
  narrationAutoScroll: 'Narration auto-scroll',
  narrationHighlight: 'Text highlighting while listening',
  alternativeInput: 'Alternative input',
  speechToText: 'Voice input and speech-to-text',
  alternativeResponses: 'Alternative responses where suitable',
  oneHandedInput: 'One-handed input',
  switchInput: 'Switch input',
  keyboardShortcuts: 'Keyboard shortcuts',
  largerControls: 'Larger controls',
  reducedRepeatedMovement: 'Reduced repeated movement',
  restBreaks: 'Rest breaks',
  reducedMotion: 'Reduced motion',
  contentTransitions: 'Animated content changes',
  quietDisplay: 'Quiet display',
  stableLayout: 'Stable layout',
  advanceNotice: 'Advance notice of next steps',
  highContrast: 'High contrast',
  extraHints: 'Extra hints',
  numericProgress: 'Numeric progress'
};
const formatSetting = (key, value) => {
  if (key === 'narrationAutoScroll') return value ? 'Auto-scroll while listening' : 'Manual scrolling while listening';
  if (value === true) return 'On';
  if (value === false) return 'Off';
  if (key === 'spacing') return value === 'relaxed' ? 'Extra spacing' : 'Standard';
  if (key === 'textSize') return value === 'extra-large' ? 'Extra large' : String(value).replace(/^./, (letter) => letter.toUpperCase());
  if (key === 'readingWidth') return String(value).replace(/^./, (letter) => letter.toUpperCase());
  if (key === 'narrationSpeed') return String(value) + '×';
  if (key === 'numericProgress') return value === 'reduced' ? 'Reduced numbers' : 'Full numbers';
  return String(value).replace(/-/g, ' ');
};
const profileIdsFromFlow = (flow) => [flow.primaryProfileId, ...(flow.secondaryProfileIds || [])]
  .filter((id, index, ids) => id && id !== BALANCED_START_PRESET_ID && getPreset(id) && ids.indexOf(id) === index);
const profileNames = (ids) => ids.map((id) => getPreset(id)?.name).filter(Boolean);
const joinWords = (items) => {
  if (items.length < 2) return items[0] || '';
  if (items.length === 2) return items[0] + ' and ' + items[1];
  return items.slice(0, -1).join(', ') + ', and ' + items.at(-1);
};
const balancedProfile = { id: BALANCED_START_PRESET_ID, name: 'Balanced Starting Setup', description: 'A calm standard course setup with visible written content, autosave, and no countdown pressure.' };
const profileFor = (id) => getPreset(id) || (id === BALANCED_START_PRESET_ID ? balancedProfile : null);
const settingLabel = (key) => settingLabels[key] || String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
const settingPreviewItems = (resolved, presetOrKeys, limit = Number.POSITIVE_INFINITY) => getLearnerVisibleSettingKeys(presetOrKeys)
  .slice(0, limit)
  .map((key) => '<li><strong>' + escapeHtml(settingLabel(key)) + '</strong><span>' + escapeHtml(formatSetting(key, resolved[key])) + '</span></li>')
  .join('');
const previewStateForProfiles = (settings, profileIds) => {
  const ids = profileIds.filter((id) => getPreset(id));
  return selectSupportProfiles(settings, ids, {
    method: 'manual',
    primaryProfileId: ids[0] || BALANCED_START_PRESET_ID,
    completed: false
  });
};
const profileOverlayPreview = (preset, limit) => {
  const previewState = previewStateForProfiles(createSettingsState(null), [preset.id]);
  return settingPreviewItems(resolveSettings(previewState), preset, limit);
};
const settingPreview = (settings, profileIds, limit = 12) => {
  const previewState = previewStateForProfiles(settings, profileIds);
  const resolved = resolveSettings(previewState);
  const keys = profileIds.length
    ? Array.from(new Set(profileIds.flatMap((id) => Object.keys(getPreset(id)?.settings || {}))))
    : ['visibleNextSteps', 'visibleProgress', 'textSize', 'spacing', 'readingWidth'];
  return settingPreviewItems(resolved, keys, limit);
};
const setupSummary = (settings) => {
  const names = profileNames(settings.selectedPresetIds || []);
  return names.length ? names[0] + (names.length > 1 ? ' + ' + (names.length - 1) + ' more' : '') : balancedProfile.name;
};

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

const setupStart = () => header() + '<main class="learner-shell" id="learner-main"><section class="learner-card setup-card"><p class="learner-eyebrow">Choose your learning supports</p><h1 class="learner-title" id="setup-heading" tabindex="-1">How would you like to set up your learning space?</h1><p class="learner-lead">Choose a quick starting point based on the support you prefer. You do not need to share a diagnosis, and you can change everything later.</p><div class="setup-paths"><button class="setup-path" type="button" data-setup-action="questionnaire"><strong>Find my starting setup</strong><span>Answer a few questions about what helps you learn.</span><small>Optional support check</small></button><button class="setup-path" type="button" data-setup-action="manual"><strong>Choose supports myself</strong><span>Browse support approaches and combine the ones that feel useful today.</span><small>Private and changeable</small></button><button class="setup-path is-standard" type="button" data-setup-action="standard"><strong>Use standard setup</strong><span>Start with a calm, balanced course experience and adjust it later.</span><small>Continue now</small></button></div><button class="setup-text-link" type="button" data-setup-action="manual">Browse all support profiles</button><p class="settings-note">Your choices are used to set learning preferences. They do not diagnose you, and you can change or clear them anytime.</p><div class="learner-actions"><button class="learner-button is-secondary" type="button" data-setup-action="standard">Skip for now</button></div></section></main>';

const questionScreen = (flow) => {
  const question = SUPPORT_QUESTIONNAIRE[flow.questionIndex];
  const selected = new Set(flow.selectedAnswers);
  const questionIds = new Set(question.options.map((option) => option.id));
  const selectedCount = flow.selectedAnswers.filter((id) => questionIds.has(id)).length;
  const optionMarkup = question.options.map((option) => {
    const isUncertain = /_unsure$/.test(option.id);
    return '<li><label class="support-option"><input type="checkbox" data-question-answer data-question-id="' + escapeHtml(question.id) + '" data-unsure="' + isUncertain + '" value="' + escapeHtml(option.id) + '"' + (selected.has(option.id) ? ' checked' : '') + '><span><strong>' + escapeHtml(option.label) + '</strong><em aria-hidden="true">Selected</em></span></label></li>';
  }).join('');
  return header('learning', '', 'setup-back') + '<main class="learner-shell" id="learner-main"><section class="learner-card setup-card"><p class="learner-eyebrow">Find a starting setup</p><div class="setup-progress" role="status" aria-live="polite"><span>Support check · ' + (flow.questionIndex + 1) + ' of ' + SUPPORT_QUESTIONNAIRE.length + '</span><progress value="' + (flow.questionIndex + 1) + '" max="' + SUPPORT_QUESTIONNAIRE.length + '" aria-label="Support check ' + (flow.questionIndex + 1) + ' of ' + SUPPORT_QUESTIONNAIRE.length + '"></progress></div><form data-question-form><fieldset class="setup-question"><legend id="setup-heading" tabindex="-1">' + escapeHtml(question.prompt) + '</legend><p class="setup-question-help">Choose any options that could help. You can change your answers, skip this question, or leave the support check at any time.</p><ul class="support-option-list">' + optionMarkup + '</ul></fieldset><div class="setup-step-actions"><button class="learner-button is-secondary" type="button" data-setup-action="question-back"' + (flow.questionIndex === 0 ? ' disabled' : '') + '>Back</button><button class="learner-button is-primary" type="submit">' + (flow.questionIndex === SUPPORT_QUESTIONNAIRE.length - 1 ? 'See my starting setup' : 'Continue') + '</button><button class="learner-button is-secondary" type="button" data-setup-action="skip-question">Skip this question</button><button class="setup-skip" type="button" data-setup-action="skip-questionnaire">Skip questionnaire</button></div><p class="learner-status" aria-live="polite">' + (selectedCount ? selectedCount + ' option' + (selectedCount === 1 ? '' : 's') + ' selected.' : 'No option selected yet.') + '</p></form></section></main>';
};

const recommendationScreen = (settings, flow) => {
  const recommendation = flow.recommendation || recommendSupportProfiles(flow.selectedAnswers);
  const primaryId = flow.primaryProfileId || recommendation.primaryProfileId || BALANCED_START_PRESET_ID;
  const secondaryIds = (flow.secondaryProfileIds?.length ? flow.secondaryProfileIds : (recommendation.secondaryProfileIds || [])).filter((id) => id !== primaryId && getPreset(id)).slice(0, 2);
  flow.recommendation = recommendation;
  flow.primaryProfileId = primaryId;
  flow.secondaryProfileIds = secondaryIds;
  const primary = profileFor(primaryId) || balancedProfile;
  const reasons = (recommendation.reasonLabels || []).slice(0, 4);
  const equalIds = (recommendation.equallyStrongProfileIds || []).filter((id) => id !== primaryId && getPreset(id));
  const ids = profileIdsFromFlow(flow);
  const overlays = secondaryIds.length ? '<section class="recommendation-overlays" aria-labelledby="additional-supports"><h3 id="additional-supports">Additional supports to try</h3>' + secondaryIds.map((id) => {
    const profile = getPreset(id);
    return '<article class="recommendation-overlay"><div><strong>' + escapeHtml(profile.name) + '</strong><p>' + escapeHtml(profile.description) + '</p></div><button class="learner-button is-secondary" type="button" data-remove-overlay="' + escapeHtml(id) + '">Remove</button></article>';
  }).join('') + '</section>' : '';
  const equallyStrong = equalIds.length ? '<section class="settings-note"><strong>These are equally strong starting points.</strong><p>You can choose the one that feels most useful today. These settings are suggestions, not labels.</p><div class="equally-strong-options">' + equalIds.map((id) => '<button class="learner-button is-secondary" type="button" data-make-primary="' + escapeHtml(id) + '">Try ' + escapeHtml(getPreset(id)?.name) + '</button>').join('') + '</div></section>' : '';
  const explanation = reasons.length ? 'We suggested this because you selected ' + escapeHtml(joinWords(reasons)) + '.' : 'This balanced setup keeps the standard course experience calm and adjustable.';
  return header('learning', '', 'setup-back') + '<main class="learner-shell" id="learner-main"><section class="learner-card setup-card"><p class="learner-eyebrow">Suggested starting point</p><h1 class="learner-title" id="setup-heading" tabindex="-1">Here is a starting setup you can try.</h1><p class="learner-lead">Based on the supports you selected. You can change this anytime.</p><article class="recommendation-panel"><p class="learner-eyebrow">Primary support</p><h2>' + escapeHtml(primary.name) + '</h2><p>' + escapeHtml(primary.description) + '</p><p class="recommendation-reasons">' + explanation + '</p>' + overlays + '</article>' + equallyStrong + '<section class="learner-card settings-section"><p class="learner-eyebrow">Settings preview</p><h2>What this setup will change</h2><p>These are the final settings after combining the selected supports. Your own changes will always take priority.</p><ul class="settings-preview">' + settingPreview(settings, ids) + '</ul></section><div class="learner-actions"><button class="learner-button is-primary" type="button" data-setup-action="use-recommendation">Use this setup</button><button class="learner-button is-secondary" type="button" data-setup-action="review-recommendation">Review settings</button><button class="learner-button is-secondary" type="button" data-setup-action="manual">Choose a different setup</button><button class="learner-button is-secondary" type="button" data-setup-action="standard">Start with standard settings</button></div><p class="settings-note">You do not need to prove, declare, or explain a diagnosis.</p></section></main>';
};

const manualProfileCard = (settings, selectedIds, preset, selected) => {
  const candidateIds = selected ? selectedIds : [...selectedIds, preset.id];
  const candidate = getPresetSelectionAnalysis(settings, candidateIds);
  const conflict = candidate.blockingConflicts.find((item) => !item.profileIds || item.profileIds.includes(preset.id));
  const status = selected
    ? 'Already included'
    : conflict
      ? 'Conflicts with current setup'
      : candidate.duplicateSettingKeys.length
        ? 'Compatible · duplicate settings merge'
        : 'Compatible';
  const keys = getLearnerVisibleSettingKeys(preset);
  const core = settingPreviewItems(resolveSettings(previewStateForProfiles(createSettingsState(null), [preset.id])), keys.slice(0, 4));
  const additional = settingPreviewItems(resolveSettings(previewStateForProfiles(createSettingsState(null), [preset.id])), keys.slice(4));
  return '<article class="manual-profile' + (selected ? ' is-selected' : '') + (conflict && !selected ? ' has-conflict' : '') + '"><label><input type="checkbox" data-manual-profile value="' + escapeHtml(preset.id) + '"' + (selected ? ' checked' : '') + '><span><strong>' + escapeHtml(preset.name) + '</strong><p>' + escapeHtml(preset.description) + '</p><small>' + escapeHtml(status) + '</small></span></label><p class="profile-category">' + escapeHtml(preset.category) + '</p><p class="profile-settings-heading">Core settings</p><ul aria-label="Core settings from ' + escapeHtml(preset.name) + '">' + core + '</ul>' + (additional ? '<details><summary>Additional settings applied</summary><ul>' + additional + '</ul></details>' : '') + (conflict && !selected ? '<p class="preset-card-conflict">' + escapeHtml(conflict.message) + '</p>' : '') + '</article>';
};
const combinedManualPreview = (settings, profileIds) => {
  const ids = profileIds.filter((id) => getPreset(id));
  const names = profileNames(ids);
  const analysis = getPresetSelectionAnalysis(settings, ids);
  const title = names.length ? names.join(' + ') : balancedProfile.name;
  const status = names.length
    ? names.length + ' support ' + (names.length === 1 ? 'profile is' : 'profiles are') + ' selected. Combined settings: ' + analysis.combinedSettingKeys.length + '. Duplicate settings merged: ' + analysis.duplicateSettingKeys.length + '. Conflicts: ' + analysis.blockingConflicts.length + '.'
    : 'No support profiles are selected. The balanced setup will be used unless you choose one.';
  const conflicts = analysis.conflicts.length
    ? '<div class="preset-conflict-summary" role="status" aria-live="polite"><strong>Needs a preference choice</strong><ul>' + analysis.conflicts.map((conflict) => '<li>' + escapeHtml(conflict.message) + (conflict.key ? '<span class="preset-conflict-actions"><button class="learner-button is-secondary" type="button" data-setup-conflict="' + escapeHtml(conflict.id) + '" data-setup-conflict-choice="keep-first">Keep first value</button><button class="learner-button is-secondary" type="button" data-setup-conflict="' + escapeHtml(conflict.id) + '" data-setup-conflict-choice="use-second">Use second value</button><button class="learner-button is-secondary" type="button" data-setup-conflict="' + escapeHtml(conflict.id) + '" data-setup-conflict-choice="disable">Disable this setting</button></span>' : '') + '</li>').join('') + '</ul></div>'
    : '<p class="preset-summary-status is-compatible">Compatible. This combination is ready to review.</p>';
  return '<section class="learner-card selected-preset-summary" data-manual-combined-preview><p class="learner-eyebrow">Selected-preset summary</p><h2>' + escapeHtml(title) + '</h2><p>Your own saved changes still take priority over support-profile recommendations.</p><p class="learner-status" aria-live="polite">' + escapeHtml(status) + '</p>' + conflicts + (analysis.canApply ? '<ul class="settings-preview">' + settingPreview(settings, ids, Number.POSITIVE_INFINITY) + '</ul>' : '') + '</section>';
};
const manualScreen = (settings, flow) => {
  if (!flow.manualProfilesInitialized) {
    flow.manualProfileIds = flow.manualProfileIds?.length ? flow.manualProfileIds : (profileIdsFromFlow(flow).length ? profileIdsFromFlow(flow) : [...(settings.selectedPresetIds || [])]);
    flow.manualProfilesInitialized = true;
  }
  const workingSettings = flow.workingSettings || settings;
  const selected = new Set(flow.manualProfileIds);
  const analysis = getPresetSelectionAnalysis(workingSettings, flow.manualProfileIds);
  const cards = PRESETS.map((preset) => manualProfileCard(workingSettings, flow.manualProfileIds, preset, selected.has(preset.id))).join('');
  return header('learning', '', 'setup-back') + '<main class="learner-shell" id="learner-main"><section class="learner-card"><p class="learner-eyebrow">Choose your learning supports</p><h1 class="learner-title" id="setup-heading" tabindex="-1">Build a setup that works for you.</h1><p class="manual-support-intro">Choose up to three compatible support bundles. Select only what feels useful today, then adjust individual settings whenever you need to.</p>' + combinedManualPreview(workingSettings, flow.manualProfileIds) + '<fieldset class="setup-question"><legend>Available support profiles</legend><div class="manual-profile-list">' + cards + '</div></fieldset><div class="setup-step-actions"><button class="learner-button is-primary" type="button" data-setup-action="apply-manual"' + (analysis.canApply ? '' : ' disabled') + '>Review final setup</button><button class="learner-button is-secondary" type="button" data-setup-action="standard">Reset to standard</button><button class="learner-button is-secondary" type="button" data-setup-action="cancel-manual">Cancel</button></div><p class="settings-note">Support profiles are private starting points, not diagnoses. A conflicting combination is explained before it can be applied.</p></section></main>';
};

const confirmationScreen = (flow, settings) => {
  const names = profileNames(settings.selectedPresetIds || []);
  const setupName = names.length ? joinWords(names) : balancedProfile.name;
  return header('learning', safeNext()) + '<main class="learner-shell" id="learner-main"><section class="setup-confirmation"><div class="learner-card"><p class="learner-eyebrow">Learning setup saved</p><h1 class="learner-title" id="setup-heading" tabindex="-1">Your learning space is ready.</h1><p class="learner-lead"><strong>' + escapeHtml(setupName) + '</strong> is ready to use. Your progress is saved, and you can change or clear these choices anytime.</p><ul class="learner-support-list"><li>Your choices set learning preferences. They do not diagnose you.</li><li>Written course content stays available, and text to speech never starts by itself.</li><li>Independent setting changes continue to take priority over support profiles.</li></ul><div class="learner-actions"><button class="learner-button is-primary" type="button" data-setup-action="continue-learning">Continue to my learning space</button><a class="learner-button is-secondary" href="/settings/">Review settings</a></div></div></section></main>';
};

const completedDashboard = (settings) => {
  const setup = setupSummary(settings);
  return header() + '<main class="learner-shell" id="learner-main"><p class="learner-eyebrow">Your learning space</p><h1 class="learner-title">One small step at a time.</h1><p class="learner-lead">There are no timers, speed scores, streaks, or public rankings here. Your next action and saved progress stay clear.</p><div class="learner-grid"><section class="learner-card"><p class="learner-eyebrow">Course completed</p><h2>Introduction to Neurodivergent Conditions</h2><p><strong>Completed.</strong> You finished all 11 modules and the final exam.</p><div class="learner-progress"><span>Course status: Completed</span><div class="learner-progress-meter" aria-label="Course progress 100 percent, completed"><i style="width:100%"></i></div></div><div class="learner-actions"><a class="learner-button is-primary" href="/course/">Review final exam</a><a class="learner-button is-secondary" href="/profile/">View my profile</a></div></section><aside class="learner-card"><p class="learner-eyebrow">Your setup</p><h2>' + escapeHtml(setup) + '</h2><p>Private supports can be adjusted anytime without changing what you are learning.</p><ul class="learner-support-list"><li>Support choices are private</li><li>Autosave protects your current work</li><li>Settings can change anytime</li></ul><div class="learner-actions"><a class="learner-button is-secondary" href="/settings/">Change settings</a></div></aside></div></main>';
};
const dashboard = (user, settings) => {
  const progress = courseProgress(learnerId(user));
  if (progress.finalExamComplete) return completedDashboard(settings);
  const percentage = Math.round((progress.complete / 11) * 100);
  return header() + '<main class="learner-shell" id="learner-main"><p class="learner-eyebrow">Your learning space</p><h1 class="learner-title">One small step at a time.</h1><p class="learner-lead">There are no timers, speed scores, streaks, or public rankings here. Your next action and saved progress stay clear.</p><div class="learner-grid"><section class="learner-card"><p class="learner-eyebrow">Continue learning</p><h2>Introduction to Neurodivergent Conditions</h2><p>Step ' + progress.step + ' of 11 · ' + escapeHtml(progress.phase === 'type' ? 'Guided typing' : progress.phase === 'check' ? 'Concept check' : 'Read this short explanation') + '</p><div class="learner-progress"><span>' + progress.complete + ' of 11 steps completed</span><div class="learner-progress-meter" aria-label="Course progress ' + percentage + ' percent"><i style="width:' + percentage + '%"></i></div></div><div class="learner-actions"><a class="learner-button is-primary" href="/course/">Continue</a><a class="learner-button is-secondary" href="/profile/">View my profile</a></div></section><aside class="learner-card"><p class="learner-eyebrow">Your setup</p><h2>' + escapeHtml(setupSummary(settings)) + '</h2><p>Support choices are private and can be adjusted at any time.</p><ul class="learner-support-list"><li>Support choices are private</li><li>Autosave protects your current work</li><li>Settings can change anytime</li></ul><div class="learner-actions"><a class="learner-button is-secondary" href="/settings/">Change settings</a></div></aside></div></main>';
};

const focusSetupHeading = () => window.requestAnimationFrame(() => document.getElementById('setup-heading')?.focus());
const standardRecommendation = () => ({ primaryProfileId: BALANCED_START_PRESET_ID, secondaryProfileIds: [], equallyStrongProfileIds: [], selectedOptionIds: [], reasonLabels: [], isBalanced: true });
const commitSettings = (user, settings, flow, nextSettings) => {
  const saved = saveLearnerSettings(learnerId(user), markSetupComplete(nextSettings));
  clearDraft(user);
  flow.screen = 'confirmation';
  flow.saved = true;
  renderSetup(user, saved, flow);
};
const applyStandard = (user, settings, flow, method = 'standard') => commitSettings(user, settings, flow, useBalancedStartingSetup(settings, method));
const applySelectedRecommendation = (user, settings, flow) => {
  const base = flow.recommendation || recommendSupportProfiles(flow.selectedAnswers);
  const recommendation = {
    ...base,
    primaryProfileId: flow.primaryProfileId || base.primaryProfileId || BALANCED_START_PRESET_ID,
    secondaryProfileIds: (flow.secondaryProfileIds || base.secondaryProfileIds || []).slice(0, 2),
    selectedOptionIds: cleanAnswers(flow.selectedAnswers)
  };
  commitSettings(user, settings, flow, applyRecommendation(settings, recommendation, 'questionnaire'));
};
const applyManualProfiles = (user, settings, flow) => {
  const profileIds = Array.from(new Set(flow.manualProfileIds || [])).filter((id) => getPreset(id));
  const workingSettings = flow.workingSettings || settings;
  const analysis = getPresetSelectionAnalysis(workingSettings, profileIds);
  if (!analysis.canApply) {
    flow.manualConflictMessage = analysis.blockingConflicts[0]?.message || 'Review this support combination before applying it.';
    return renderSetup(user, settings, flow);
  }
  if (!profileIds.length) return applyStandard(user, workingSettings, flow, 'manual');
  const next = selectSupportProfiles(workingSettings, profileIds, { method: 'manual', selectedAnswers: cleanAnswers(flow.selectedAnswers) });
  commitSettings(user, settings, flow, next);
};
const moveQuestion = (user, settings, flow, target) => {
  flow.questionIndex = Math.max(0, Math.min(SUPPORT_QUESTIONNAIRE.length - 1, target));
  flow.screen = 'questions';
  renderSetup(user, settings, flow);
};

const bindSetup = (user, settings, flow) => {
  document.querySelectorAll('[data-signout]').forEach((button) => button.addEventListener('click', async () => { button.disabled = true; await signOutType2LearnUser(); window.location.assign('/'); }));
  document.querySelectorAll('[data-question-answer]').forEach((input) => input.addEventListener('change', () => {
    const question = SUPPORT_QUESTIONNAIRE.find((item) => item.id === input.dataset.questionId);
    if (!question) return;
    const questionIds = question.options.map((option) => option.id);
    const selected = new Set(flow.selectedAnswers);
    if (input.checked && input.dataset.unsure === 'true') {
      questionIds.forEach((id) => selected.delete(id));
      selected.add(input.value);
    } else if (input.checked) {
      question.options.filter((option) => /_unsure$/.test(option.id)).forEach((option) => selected.delete(option.id));
      selected.add(input.value);
    } else selected.delete(input.value);
    flow.selectedAnswers = Array.from(selected);
    document.querySelectorAll('[data-question-answer]').forEach((control) => { control.checked = selected.has(control.value); });
    const status = document.querySelector('[data-question-form] .learner-status');
    const count = flow.selectedAnswers.filter((id) => questionIds.includes(id)).length;
    if (status) status.textContent = count ? count + ' option' + (count === 1 ? '' : 's') + ' selected.' : 'No option selected yet.';
    saveDraft(user, flow);
  }));
  document.querySelector('[data-question-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (flow.questionIndex === SUPPORT_QUESTIONNAIRE.length - 1) {
      flow.recommendation = recommendSupportProfiles(flow.selectedAnswers);
      flow.primaryProfileId = flow.recommendation.primaryProfileId;
      flow.secondaryProfileIds = [...(flow.recommendation.secondaryProfileIds || [])];
      flow.screen = 'recommendation';
      renderSetup(user, settings, flow);
    } else moveQuestion(user, settings, flow, flow.questionIndex + 1);
  });
  document.querySelectorAll('[data-manual-profile]').forEach((input) => input.addEventListener('change', () => {
    const next = new Set(flow.manualProfileIds || []);
    if (input.checked) next.add(input.value); else next.delete(input.value);
    flow.manualProfileIds = Array.from(next);
    flow.manualProfilesInitialized = true;
    saveDraft(user, flow);
    const changedProfileId = input.value;
    renderSetup(user, settings, flow);
    window.requestAnimationFrame(() => {
      Array.from(document.querySelectorAll('[data-manual-profile]'))
        .find((control) => control.value === changedProfileId)
        ?.focus();
    });
  }));
  document.querySelectorAll('[data-setup-conflict]').forEach((button) => button.addEventListener('click', () => {
    const workingSettings = flow.workingSettings || settings;
    const conflict = getPresetSelectionAnalysis(workingSettings, flow.manualProfileIds || []).conflicts.find((item) => item.id === button.dataset.setupConflict);
    if (!conflict?.key) return;
    flow.workingSettings = applyPresetConflictResolution(workingSettings, conflict, button.dataset.setupConflictChoice);
    flow.manualConflictMessage = '';
    renderSetup(user, settings, flow);
  }));
  document.querySelectorAll('[data-remove-overlay]').forEach((button) => button.addEventListener('click', () => {
    flow.secondaryProfileIds = (flow.secondaryProfileIds || []).filter((id) => id !== button.dataset.removeOverlay);
    renderSetup(user, settings, flow);
  }));
  document.querySelectorAll('[data-make-primary]').forEach((button) => button.addEventListener('click', () => {
    const nextPrimary = button.dataset.makePrimary;
    const previousPrimary = flow.primaryProfileId;
    flow.primaryProfileId = nextPrimary;
    flow.secondaryProfileIds = Array.from(new Set([previousPrimary, ...(flow.secondaryProfileIds || [])])).filter((id) => id !== nextPrimary && getPreset(id)).slice(0, 2);
    renderSetup(user, settings, flow);
  }));
  document.querySelectorAll('[data-setup-action]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.setupAction;
    if (action === 'questionnaire') { flow.screen = 'questions'; flow.questionIndex = 0; renderSetup(user, settings, flow); }
    if (action === 'manual') { flow.returnScreen = flow.screen === 'recommendation' ? 'recommendation' : ''; flow.manualProfilesInitialized = false; flow.screen = 'manual'; renderSetup(user, settings, flow); }
    if (action === 'standard') applyStandard(user, settings, flow, flow.screen === 'questions' ? 'skipped' : 'standard');
    if (action === 'question-back') moveQuestion(user, settings, flow, flow.questionIndex - 1);
    if (action === 'setup-back') {
      if (flow.screen === 'questions' && flow.questionIndex > 0) moveQuestion(user, settings, flow, flow.questionIndex - 1);
      else if (flow.screen === 'questions') { flow.screen = 'start'; renderSetup(user, settings, flow); }
      else if (flow.screen === 'recommendation') { flow.questionIndex = SUPPORT_QUESTIONNAIRE.length - 1; flow.screen = 'questions'; renderSetup(user, settings, flow); }
      else if (flow.screen === 'manual') { flow.screen = flow.returnScreen || 'start'; renderSetup(user, settings, flow); }
    }
    if (action === 'skip-question') {
      const question = SUPPORT_QUESTIONNAIRE[flow.questionIndex];
      const questionIds = new Set(question.options.map((option) => option.id));
      flow.selectedAnswers = flow.selectedAnswers.filter((id) => !questionIds.has(id));
      if (flow.questionIndex === SUPPORT_QUESTIONNAIRE.length - 1) {
        flow.recommendation = recommendSupportProfiles(flow.selectedAnswers);
        flow.primaryProfileId = flow.recommendation.primaryProfileId;
        flow.secondaryProfileIds = [...(flow.recommendation.secondaryProfileIds || [])];
        flow.screen = 'recommendation';
        renderSetup(user, settings, flow);
      } else moveQuestion(user, settings, flow, flow.questionIndex + 1);
    }
    if (action === 'skip-questionnaire') applyStandard(user, settings, flow, 'skipped');
    if (action === 'use-recommendation') applySelectedRecommendation(user, settings, flow);
    if (action === 'review-recommendation') { flow.returnScreen = 'recommendation'; flow.manualProfileIds = profileIdsFromFlow(flow); flow.manualProfilesInitialized = false; flow.screen = 'manual'; renderSetup(user, settings, flow); }
    if (action === 'apply-manual') applyManualProfiles(user, settings, flow);
    if (action === 'cancel-manual') { flow.screen = flow.returnScreen || 'start'; renderSetup(user, settings, flow); }
    if (action === 'continue-learning') window.location.assign(safeNext());
  }));
};
const renderSetup = (user, settings, flow) => {
  const views = { start: setupStart, questions: () => questionScreen(flow), recommendation: () => recommendationScreen(settings, flow), manual: () => manualScreen(settings, flow), confirmation: () => confirmationScreen(flow, settings) };
  applyLearnerPagePreferences(settings);
  app.innerHTML = (views[flow.screen] || views.start)();
  if (flow.screen !== 'confirmation') saveDraft(user, flow);
  bindSetup(user, settings, flow);
  focusSetupHeading();
};
const bindDashboard = () => document.querySelectorAll('[data-signout]').forEach((button) => button.addEventListener('click', async () => { button.disabled = true; await signOutType2LearnUser(); window.location.assign('/'); }));
const createFlow = (user, settings) => {
  const mode = forcedSetupMode();
  const draft = mode ? null : loadDraft(user);
  if (mode === 'questionnaire') return { screen: 'questions', questionIndex: 0, selectedAnswers: [], manualProfileIds: [], manualProfilesInitialized: false, primaryProfileId: '', secondaryProfileIds: [], returnScreen: '' };
  if (mode === 'manual') return { screen: 'manual', questionIndex: 0, selectedAnswers: [], manualProfileIds: [...(settings.selectedPresetIds || [])], manualProfilesInitialized: true, primaryProfileId: '', secondaryProfileIds: [], returnScreen: '' };
  return draft || { screen: 'start', questionIndex: 0, selectedAnswers: [], manualProfileIds: [], manualProfilesInitialized: false, primaryProfileId: '', secondaryProfileIds: [], returnScreen: '' };
};

app.innerHTML = '<main class="learner-loading" id="learner-main">Checking your private learning space…</main>';
const user = await waitForType2LearnUser();
if (!user) window.location.replace('/login/?next=' + encodeURIComponent('/learn/' + window.location.search));
else {
  const settings = createSettingsState(loadLearnerSettings(learnerId(user)));
  applyLearnerPagePreferences(settings);
  if (!settings.setupComplete || forcedSetupMode()) renderSetup(user, settings, createFlow(user, settings));
  else {
    app.innerHTML = dashboard(user, settings);
    bindDashboard();
    mountType2LearnMascot();
    notifyMascot({ event: courseProgress(learnerId(user)).finalExamComplete ? 'course-complete' : 'dashboard' });
  }
}
