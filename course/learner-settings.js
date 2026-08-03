/*
 * Private, local learner-support settings.
 *
 * This client-side schema is deliberately support-based and non-diagnostic.
 * It stores local learning preferences only; it does not infer a condition,
 * collect response telemetry, or send questionnaire answers anywhere.
 */

export const SETTINGS_VERSION = 7;
export const SETTINGS_STORAGE_PREFIX = 'type2learn-learner-settings-v2:';
export const RECOMMENDATION_VERSION = 1;
export const BALANCED_START_PRESET_ID = 'balanced-start';
export const PRESET_SELECTION_LIMIT = 3;

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
};

export const INPUT_METHOD_IDS = deepFreeze(['keyboard', 'voice', 'alternative', 'switch', 'one-handed']);

export const SUPPORT_DIMENSIONS = deepFreeze({
  focus: 'Help with starting, sustaining, and switching tasks.',
  reading_access: 'Help with reading presentation and written access.',
  predictability: 'Stable layouts, clear wording, and advance notice.',
  flexible_expression: 'Alternative ways to demonstrate understanding.',
  motor_support: 'Larger targets, reduced repeated movement, and flexible control.',
  flexible_input: 'Alternative input methods and comfortable response entry.',
  progress_access: 'Less pressure from numeric or speed-based progress.',
  auditory_support: 'Written support, captions, transcripts, and optional narration.',
  visual_access: 'Zoom, contrast, spacing, semantics, and readable presentation.',
  step_by_step: 'One instruction at a time, examples, repetition, and scaffolding.',
  sensory_comfort: 'Reduced animation, sound, clutter, and unexpected changes.',
  fatigue_support: 'Pause, resume, rest, flexible timing, and reduced repeated effort.'
});

export const SUPPORT_DIMENSION_IDS = deepFreeze(Object.keys(SUPPORT_DIMENSIONS));
const validDimensionIds = new Set(SUPPORT_DIMENSION_IDS);

export const SUPPORT_QUESTIONNAIRE = deepFreeze([
  {
    id: 'start-and-continue',
    prompt: 'What would make it easier to start and continue a learning task?',
    allowMultiple: true,
    options: [
      { id: 'short_sections', label: 'Shorter content sections', effects: { focus: 3, step_by_step: 1 } },
      { id: 'one_task', label: 'One clear task at a time', effects: { focus: 3, step_by_step: 2 } },
      { id: 'reminders_autosave', label: 'Gentle reminders and saved progress', effects: { focus: 2, predictability: 1 } },
      { id: 'fewer_distractions', label: 'Fewer distractions on the page', effects: { focus: 2, sensory_comfort: 2 } },
      { id: 'pause_resume', label: 'Easy pause and resume', effects: { focus: 2, fatigue_support: 1 } },
      { id: 'q1_unsure', label: "I'm not sure", effects: {} }
    ]
  },
  {
    id: 'reading-access',
    prompt: 'Which options could make written content easier to access?',
    allowMultiple: true,
    options: [
      { id: 'read_aloud', label: 'Read-aloud support', effects: { reading_access: 3, auditory_support: 1 } },
      { id: 'larger_spacing', label: 'Larger text or more spacing', effects: { reading_access: 2, visual_access: 2 } },
      { id: 'shorter_lines', label: 'Shorter lines and less visual clutter', effects: { reading_access: 3, sensory_comfort: 1 } },
      { id: 'clearer_wording', label: 'Clearer or simpler wording', effects: { step_by_step: 2, reading_access: 1 } },
      { id: 'written_with_audio', label: 'Written content alongside audio', effects: { auditory_support: 3, reading_access: 1 } },
      { id: 'q2_unsure', label: "I'm not sure", effects: {} }
    ]
  },
  {
    id: 'instruction-preferences',
    prompt: 'How do you prefer instructions to be presented?',
    allowMultiple: true,
    options: [
      { id: 'instruction_one_at_time', label: 'One instruction at a time', effects: { step_by_step: 3, focus: 1 } },
      { id: 'written_instructions', label: 'Written instructions I can reread', effects: { auditory_support: 2, step_by_step: 1 } },
      { id: 'visual_examples', label: 'Visual examples or demonstrations', effects: { step_by_step: 2, predictability: 1 } },
      { id: 'predictable_layout', label: 'A predictable layout that stays the same', effects: { predictability: 3, sensory_comfort: 1 } },
      { id: 'extra_response_time', label: 'Extra time to think before responding', effects: { fatigue_support: 1, step_by_step: 2 } },
      { id: 'q3_unsure', label: "I'm not sure", effects: {} }
    ]
  },
  {
    id: 'input-preferences',
    prompt: 'Which ways of responding would feel more comfortable?',
    allowMultiple: true,
    options: [
      { id: 'voice_input', label: 'Voice input or speaking an answer', effects: { flexible_expression: 3, flexible_input: 2 } },
      { id: 'alternative_expression', label: 'Choices instead of always writing a long answer', effects: { flexible_expression: 3, step_by_step: 1 } },
      { id: 'larger_targets', label: 'Larger buttons and click targets', effects: { motor_support: 3, flexible_input: 1 } },
      { id: 'keyboard_alternatives', label: 'Keyboard shortcuts or one-handed options', effects: { motor_support: 2, flexible_input: 3 } },
      { id: 'no_speed_pressure', label: 'No speed pressure while entering an answer', effects: { fatigue_support: 2, motor_support: 1, focus: 1 } },
      { id: 'q4_unsure', label: "I'm not sure", effects: {} }
    ]
  },
  {
    id: 'sensory-comfort',
    prompt: 'What would make the page more comfortable to use?',
    allowMultiple: true,
    options: [
      { id: 'reduced_animation', label: 'Fewer animations and visual effects', effects: { sensory_comfort: 3, predictability: 1 } },
      { id: 'no_unexpected_sound', label: 'No unexpected sounds or autoplay', effects: { sensory_comfort: 3, auditory_support: 1 } },
      { id: 'quiet_page', label: 'A quiet, uncluttered page', effects: { sensory_comfort: 3, focus: 1 } },
      { id: 'stable_layout_notice', label: 'A stable layout with advance notice before changes', effects: { predictability: 3, sensory_comfort: 1 } },
      { id: 'display_control', label: 'Control over brightness, contrast, or display settings', effects: { visual_access: 2, sensory_comfort: 1 } },
      { id: 'q5_unsure', label: "I'm not sure", effects: {} }
    ]
  },
  {
    id: 'progress-preferences',
    prompt: 'How would you prefer to see your progress?',
    allowMultiple: true,
    options: [
      { id: 'visual_progress', label: 'A visual progress path', effects: { progress_access: 3, predictability: 1 } },
      { id: 'small_progress_steps', label: 'Small completion steps instead of one large goal', effects: { progress_access: 2, step_by_step: 2 } },
      { id: 'less_numeric_pressure', label: 'Less emphasis on scores, rankings, or speed', effects: { progress_access: 3, focus: 1 } },
      { id: 'clear_feedback', label: 'Clear feedback after each activity', effects: { predictability: 2, step_by_step: 1 } },
      { id: 'numeric_progress_ok', label: 'Numbers and scores are fine for me', effects: {} },
      { id: 'q6_unsure', label: "I'm not sure", effects: {} }
    ]
  },
  {
    id: 'environment-and-energy',
    prompt: 'Which situation can make learning more difficult for you?',
    helpText: 'This is about optional support preferences, not a diagnosis.',
    allowMultiple: true,
    options: [
      { id: 'variable_energy', label: 'My energy, pain, or stamina can change', effects: { fatigue_support: 3, flexible_input: 1 } },
      { id: 'noise_affects_listening', label: 'Noise can make spoken instructions difficult to follow', effects: { auditory_support: 3, reading_access: 1 } },
      { id: 'small_text_difficult', label: 'Small text or low contrast can be difficult to see', effects: { visual_access: 4 } },
      { id: 'too_many_changes', label: 'Too many choices or changes can be overwhelming', effects: { predictability: 3, sensory_comfort: 1 } },
      { id: 'physical_input_tiring', label: 'Physical input can become tiring', effects: { motor_support: 3, fatigue_support: 2 } },
      { id: 'q7_unsure', label: "I'm not sure", effects: {} }
    ]
  }
]);

const optionById = new Map(
  SUPPORT_QUESTIONNAIRE.flatMap((question) => question.options.map((option) => [option.id, option]))
);

/*
 * Only these settings are learner-editable. Keeping this allowlist beside the
 * shared schema prevents a removed, internal, or safety setting from
 * reappearing merely because an older record or profile still mentions it.
 */
export const EDITABLE_SETTING_KEYS = deepFreeze([
  'smallerSections',
  'visibleNextSteps',
  'visibleProgress',
  'gentleReminders',
  'fewerDistractions',
  'textSize',
  'spacing',
  'readingWidth',
  'extraExamples',
  'simplerExplanations',
  'literalInstructions',
  'recap',
  'readAloud',
  'narrationSpeed',
  'narrationVoice',
  'narrationVolume',
  'narrationAutoScroll',
  'narrationHighlight',
  'alternativeInput',
  'speechToText',
  'alternativeResponses',
  'oneHandedInput',
  'switchInput',
  'keyboardShortcuts',
  'largerControls',
  'reducedRepeatedMovement',
  'restBreaks',
  'reducedMotion',
  'contentTransitions',
  'quietDisplay',
  'stableLayout',
  'advanceNotice',
  'highContrast',
  'extraHints',
  'numericProgress'
]);

/* These protections are intentionally suitable for the read-only learner
   protections section. Gentle/immediate feedback remain internal course
   behaviour and are enforced separately below. */
export const BUILT_IN_PROTECTION_KEYS = deepFreeze([
  'automaticSaving',
  'noTimers',
  'pauseResume',
  'easyReturn',
  'writtenInstructions',
  'captionsTranscripts',
  'noAutoplay',
  'noUnexpectedSound',
  'flexibleTiming',
  'noTimedTyping',
  'spellingExemption',
  'oneTask'
]);

const INTERNAL_PROTECTION_KEYS = deepFreeze(['gentleFeedback', 'immediateFeedback']);
const PROTECTION_KEYS = deepFreeze([...BUILT_IN_PROTECTION_KEYS, ...INTERNAL_PROTECTION_KEYS]);
const PROTECTION_VALUES = deepFreeze(Object.fromEntries(PROTECTION_KEYS.map((key) => [key, true])));

export const PLATFORM_DEFAULTS = deepFreeze({
  smallerSections: false,
  oneTask: true,
  visibleNextSteps: true,
  visibleProgress: true,
  automaticSaving: true,
  noTimers: true,
  pauseResume: true,
  easyReturn: true,
  focusMode: false,
  fewerDistractions: false,
  gentleReminders: false,
  writtenInstructions: true,
  captionsTranscripts: true,
  noAutoplay: true,
  noUnexpectedSound: true,
  stableLayout: true,
  advanceNotice: true,
  readAloud: false,
  narrationSpeed: '1',
  narrationVoice: '',
  narrationVolume: '1',
  narrationAutoScroll: false,
  narrationHighlight: true,
  extraExamples: false,
  simplerExplanations: false,
  literalInstructions: false,
  textSize: 'standard',
  spacing: 'standard',
  readingWidth: 'comfortable',
  alternativeInput: false,
  speechToText: false,
  alternativeResponses: false,
  oneHandedInput: false,
  switchInput: false,
  keyboardShortcuts: false,
  reducedRepeatedMovement: false,
  restBreaks: true,
  flexibleTiming: true,
  noTimedTyping: true,
  spellingExemption: true,
  highContrast: false,
  largerControls: false,
  reducedMotion: false,
  contentTransitions: false,
  quietDisplay: false,
  gentleFeedback: true,
  immediateFeedback: true,
  extraHints: false,
  numericProgress: 'full',
  recap: false
});

const createProfile = (definition) => deepFreeze({
  ...definition,
  category: definition.category || 'Learning support',
  compatibleWith: Array.from(new Set(definition.compatibleWith || [])),
  conflictsWith: Array.from(new Set(definition.conflictsWith || [])),
  conflictMetadata: Array.isArray(definition.conflictMetadata) ? definition.conflictMetadata : [],
  allowedSettingKeys: Object.keys(definition.settings),
  exampleSettings: definition.exampleSettings || []
});

/*
 * These are support profiles, not condition labels. The optional internal
 * inspiration field is intentionally not used in learner-facing copy.
 */
export const PRESETS = deepFreeze([
  createProfile({
    id: 'focus-flow',
    name: 'Focus & Flow',
    category: 'Structure and focus',
    compatibleWith: ['readable-view', 'flexible-input', 'clear-progress'],
    conflictsWith: [],
    conditionLabel: 'Focus and pacing support',
    description: 'Smaller sections, clear next steps, and less pressure.',
    longDescription: 'A calmer task structure that makes it easier to start, pause, and return.',
    primaryDimensions: ['focus', 'step_by_step', 'predictability', 'fatigue_support'],
    matchWeights: { focus: 1, step_by_step: 0.8, predictability: 0.4, fatigue_support: 0.4 },
    settings: { smallerSections: true, visibleNextSteps: true, visibleProgress: true, fewerDistractions: true, gentleReminders: true },
    exampleSettings: ['Smaller sections', 'Clear next steps', 'Visible progress', 'Fewer distractions', 'Gentle reminders'],
    internalInspiration: 'attention-and-pacing'
  }),
  createProfile({
    id: 'reading-support',
    name: 'Reading Support',
    category: 'Reading and listening',
    compatibleWith: ['readable-view', 'read-listen'],
    conflictsWith: [],
    conditionLabel: 'Reading access support',
    description: 'Helpful structure for reading, scanning, and following written content.',
    longDescription: 'Makes written content easier to take in while keeping course ideas and expectations intact.',
    primaryDimensions: ['reading_access', 'visual_access', 'step_by_step'],
    matchWeights: { reading_access: 1, visual_access: 0.8, step_by_step: 0.4 },
    settings: { smallerSections: true, readAloud: true, narrationSpeed: '1', narrationAutoScroll: false, narrationHighlight: true, extraExamples: true, simplerExplanations: true, textSize: 'large', spacing: 'relaxed', readingWidth: 'narrow', fewerDistractions: true },
    exampleSettings: ['Read-aloud controls', 'Larger text', 'Extra spacing', 'Shorter line length'],
    internalInspiration: 'reading-presentation'
  }),
  createProfile({
    id: 'clear-predictable',
    name: 'Clear & Predictable',
    category: 'Progress and predictability',
    compatibleWith: ['low-stimulation', 'step-by-step'],
    conflictsWith: [],
    conditionLabel: 'Predictable learning support',
    description: 'A steady presentation with direct next steps and less surprise.',
    longDescription: 'Keeps navigation, instructions, and transitions clear and stable.',
    primaryDimensions: ['predictability', 'sensory_comfort', 'step_by_step'],
    matchWeights: { predictability: 1, sensory_comfort: 0.7, step_by_step: 0.6 },
    settings: { visibleNextSteps: true, literalInstructions: true, fewerDistractions: true, stableLayout: true, advanceNotice: true, reducedMotion: true },
    exampleSettings: ['Direct instructions', 'Stable layout', 'Advance notice', 'Reduced motion'],
    internalInspiration: 'predictable-learning'
  }),
  createProfile({
    id: 'flexible-expression',
    name: 'Flexible Expression',
    category: 'Input and motor control',
    compatibleWith: ['flexible-input', 'comfortable-control'],
    conflictsWith: [],
    conditionLabel: 'Flexible response support',
    description: 'More than one way to make thinking visible.',
    longDescription: 'Keeps alternative response routes available when they fit the learning objective.',
    primaryDimensions: ['flexible_expression', 'flexible_input'],
    matchWeights: { flexible_expression: 1, flexible_input: 0.8 },
    settings: { alternativeInput: true, speechToText: true, alternativeResponses: true, extraHints: true },
    exampleSettings: ['Alternative input', 'Voice input and speech-to-text', 'Alternative response formats', 'Extra hints'],
    internalInspiration: 'expression-support'
  }),
  createProfile({
    id: 'comfortable-control',
    name: 'Comfortable Control',
    category: 'Input and motor control',
    compatibleWith: ['flexible-input', 'flexible-expression'],
    conflictsWith: [],
    conditionLabel: 'Comfortable control support',
    description: 'Controls that reduce physical effort and increase choice.',
    longDescription: 'Offers a more comfortable way to operate the interface and take a break when needed.',
    primaryDimensions: ['motor_support', 'flexible_input', 'fatigue_support'],
    matchWeights: { motor_support: 1, flexible_input: 0.8, fatigue_support: 0.6 },
    settings: { largerControls: true, oneHandedInput: true, alternativeInput: true, keyboardShortcuts: true, reducedRepeatedMovement: true, restBreaks: true, spacing: 'relaxed' },
    exampleSettings: ['Larger controls', 'One-handed input', 'Reduced repeated movement', 'Rest breaks', 'Extra spacing'],
    internalInspiration: 'motor-access'
  }),
  createProfile({
    id: 'clear-progress',
    name: 'Clear Progress',
    category: 'Progress and predictability',
    compatibleWith: ['focus-flow', 'step-by-step'],
    conflictsWith: [],
    conditionLabel: 'Progress presentation support',
    description: 'A visible, calm path through one step at a time.',
    longDescription: 'Makes progress and completion clear without adding speed, rank, or comparison pressure.',
    primaryDimensions: ['progress_access', 'predictability'],
    matchWeights: { progress_access: 1, predictability: 0.65 },
    settings: { visibleProgress: true, visibleNextSteps: true, smallerSections: true, extraExamples: true, numericProgress: 'reduced' },
    exampleSettings: ['Visible progress', 'Small completion steps', 'Clear next actions', 'Reduced numeric progress'],
    internalInspiration: 'calm-progress'
  }),
  createProfile({
    id: 'read-listen',
    name: 'Read & Listen',
    category: 'Reading and listening',
    compatibleWith: ['reading-support', 'readable-view'],
    conflictsWith: [],
    conditionLabel: 'Written and audio support',
    description: 'Keep written information and optional listening close together.',
    longDescription: 'Keeps visible text available alongside optional narration, captions, and highlighting.',
    primaryDimensions: ['auditory_support', 'reading_access'],
    matchWeights: { auditory_support: 1, reading_access: 0.9 },
    settings: { readAloud: true, narrationSpeed: '1', narrationAutoScroll: false, narrationHighlight: true, smallerSections: true, spacing: 'relaxed' },
    exampleSettings: ['Optional narration', 'Narration speed', 'Narration highlighting', 'Smaller sections', 'Extra spacing'],
    internalInspiration: 'audio-and-written-access'
  }),
  createProfile({
    id: 'readable-view',
    name: 'Readable View',
    category: 'Visual comfort',
    compatibleWith: ['focus-flow', 'reading-support', 'read-listen'],
    conflictsWith: ['low-stimulation'],
    conflictMetadata: [{ type: 'high-contrast-and-low-stimulation', message: 'Readable View includes high contrast, while Low Stimulation asks for a calmer visual presentation.' }],
    conditionLabel: 'Visual reading support',
    description: 'A clearer reading surface with adjustable visual comfort.',
    longDescription: 'Improves visual access to text, controls, and feedback without forcing one colour theme.',
    primaryDimensions: ['visual_access'],
    matchWeights: { visual_access: 1 },
    settings: { textSize: 'large', spacing: 'relaxed', readingWidth: 'narrow', highContrast: true, largerControls: true },
    exampleSettings: ['Larger text', 'Extra spacing', 'High contrast', 'Larger controls'],
    internalInspiration: 'visual-access'
  }),
  createProfile({
    id: 'step-by-step',
    name: 'Step by Step',
    category: 'Structure and focus',
    compatibleWith: ['clear-progress', 'clear-predictable'],
    conflictsWith: [],
    conditionLabel: 'Step-by-step learning support',
    description: 'Short, explicit actions with helpful repetition.',
    longDescription: 'Breaks a learning action into clear, respectful, repeatable steps.',
    primaryDimensions: ['step_by_step', 'predictability', 'focus'],
    matchWeights: { step_by_step: 1, predictability: 0.8, focus: 0.35 },
    settings: { smallerSections: true, literalInstructions: true, simplerExplanations: true, extraExamples: true, extraHints: true, recap: true, visibleNextSteps: true, visibleProgress: true },
    exampleSettings: ['Smaller sections', 'Literal instructions', 'Examples before practice', 'Clear next steps', 'Recap and repetition'],
    internalInspiration: 'scaffolded-learning'
  }),
  createProfile({
    id: 'flexible-input',
    name: 'Flexible Input',
    category: 'Input and motor control',
    compatibleWith: ['focus-flow', 'comfortable-control', 'flexible-expression'],
    conflictsWith: [],
    conditionLabel: 'Flexible input support',
    description: 'Keep assistive and alternative input routes available.',
    longDescription: 'Offers more comfortable ways to operate the interface and enter a response.',
    primaryDimensions: ['flexible_input', 'motor_support', 'flexible_expression'],
    matchWeights: { flexible_input: 1, motor_support: 0.9, flexible_expression: 0.6 },
    settings: { alternativeInput: true, speechToText: true, alternativeResponses: true, oneHandedInput: true, switchInput: true, keyboardShortcuts: true, largerControls: true, restBreaks: true },
    exampleSettings: ['Alternative input', 'Voice input and speech-to-text', 'One-handed input', 'Switch input', 'Larger controls'],
    internalInspiration: 'physical-and-motor-access'
  }),
  createProfile({
    id: 'low-stimulation',
    name: 'Low Stimulation',
    category: 'Sensory environment',
    compatibleWith: ['clear-predictable'],
    conflictsWith: ['readable-view'],
    conflictMetadata: [{ type: 'high-contrast-and-low-stimulation', message: 'Low Stimulation keeps visual detail low, while Readable View includes high contrast.' }],
    conditionLabel: 'Calmer display support',
    description: 'A quieter display with reduced motion and fewer distractions.',
    longDescription: 'Reduces non-essential visual, audio, and motion load while keeping the task clear.',
    primaryDimensions: ['sensory_comfort', 'predictability', 'focus'],
    matchWeights: { sensory_comfort: 1, predictability: 0.75, focus: 0.4 },
    settings: { fewerDistractions: true, reducedMotion: true, quietDisplay: true, stableLayout: true, narrationAutoScroll: false },
    exampleSettings: ['Reduced motion', 'Quiet display', 'Fewer distractions', 'Stable layout'],
    internalInspiration: 'sensory-comfort'
  })
]);

export const BALANCED_START_PRESET = deepFreeze({
  id: BALANCED_START_PRESET_ID,
  name: 'Balanced Starting Setup',
  conditionLabel: 'Standard learning setup',
  description: 'A calm, standard course experience that you can customise anytime.',
  longDescription: 'Keeps written content visible, narration available on request, automatic saving on, and countdown pressure off.',
  primaryDimensions: [],
  matchWeights: {},
  settings: {},
  allowedSettingKeys: [],
  exampleSettings: []
});

const validKeys = new Set(Object.keys(PLATFORM_DEFAULTS));
const editableKeySet = new Set(EDITABLE_SETTING_KEYS);
const protectionKeySet = new Set(PROTECTION_KEYS);
const temporaryOverrideKeys = new Set(['focusMode']);
const presetById = new Map(PRESETS.map((preset) => [preset.id, preset]));
const presetOrder = new Map(PRESETS.map((preset, index) => [preset.id, index]));
const validTextSizes = new Set(['standard', 'large', 'extra-large']);
const validSpacing = new Set(['standard', 'relaxed']);
const validWidths = new Set(['narrow', 'comfortable', 'wide']);
const validNarrationSpeeds = new Set(['0.75', '1', '1.25', '1.5']);
const validNarrationVolumes = new Set(['0.5', '0.75', '1']);
const validNumericProgress = new Set(['full', 'reduced']);
const validOnboardingMethods = new Set(['questionnaire', 'manual', 'standard', 'legacy', '']);
const validInputMethods = new Set(INPUT_METHOD_IDS);
const validConflictChoices = new Set(['keep-first', 'use-second', 'disable']);

export const validateSupportConfiguration = () => {
  const errors = [];
  const seenOptionIds = new Set();
  SUPPORT_QUESTIONNAIRE.forEach((question) => {
    if (!question.id || !question.prompt || !Array.isArray(question.options)) errors.push('Questionnaire question is incomplete.');
    question.options.forEach((option) => {
      if (!option.id || !option.label || seenOptionIds.has(option.id)) errors.push('Questionnaire option IDs must be unique.');
      seenOptionIds.add(option.id);
      Object.keys(option.effects || {}).forEach((dimension) => {
        if (!validDimensionIds.has(dimension)) errors.push('Unknown support dimension: ' + dimension);
      });
    });
  });
  PRESETS.forEach((preset) => {
    if (!preset.id || !preset.name || !preset.description || !preset.longDescription) errors.push('A support profile is missing learner-facing copy.');
    if (!preset.category) errors.push('A support profile is missing a category: ' + preset.id);
    if (!Object.keys(preset.settings || {}).length) errors.push('A support profile has no settings overlay: ' + preset.id);
    Object.keys(preset.settings || {}).forEach((key) => {
      if (!validKeys.has(key)) errors.push('Unknown setting in ' + preset.id + ': ' + key);
      if (!editableKeySet.has(key)) errors.push('Non-editable setting in ' + preset.id + ': ' + key);
    });
    Object.keys(preset.matchWeights || {}).forEach((dimension) => {
      if (!validDimensionIds.has(dimension)) errors.push('Unknown profile dimension: ' + dimension);
    });
    [...preset.compatibleWith, ...preset.conflictsWith].forEach((id) => {
      if (!PRESETS.some((candidate) => candidate.id === id)) errors.push('Unknown profile relationship in ' + preset.id + ': ' + id);
      if (id === preset.id) errors.push('A support profile cannot reference itself: ' + preset.id);
    });
  });
  return errors;
};

export const SUPPORT_CONFIGURATION_ERRORS = deepFreeze(validateSupportConfiguration());

const safeObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const unique = (values) => [...new Set(values)];
const isProfileId = (id) => presetById.has(id);
const isRecommendationProfileId = (id) => id === BALANCED_START_PRESET_ID || isProfileId(id);
const timestamp = () => new Date().toISOString();

const cleanProfileIds = (value) => unique((Array.isArray(value) ? value : (value instanceof Set ? [...value] : []))
  .filter((id) => typeof id === 'string' && isProfileId(id)));

const orderProfileIds = (value, primary = '') => {
  const ids = cleanProfileIds(value);
  const chosenPrimary = isProfileId(primary) ? primary : '';
  const remaining = ids
    .filter((id) => id !== chosenPrimary)
    .sort((left, right) => (presetOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (presetOrder.get(right) ?? Number.MAX_SAFE_INTEGER));
  return chosenPrimary ? [chosenPrimary, ...remaining] : remaining;
};

const cleanSelectedAnswerIds = (value) => unique((Array.isArray(value) ? value : (value instanceof Set ? [...value] : []))
  .filter((id) => typeof id === 'string' && optionById.has(id)));

const canonicalSettingKey = (key) => ({
  voiceInput: 'speechToText',
  textSizeLarge: 'textSize',
  spacingRelaxed: 'spacing'
}[key] || key);

const migrateLegacySettingAliases = (value) => {
  const source = safeObject(value);
  const migrated = { ...source };
  const hasSpeechToText = typeof source.speechToText === 'boolean';
  const hasVoiceInput = typeof source.voiceInput === 'boolean';
  if (hasSpeechToText || hasVoiceInput) {
    migrated.speechToText = source.speechToText === true || source.voiceInput === true;
  }
  if (!Object.hasOwn(source, 'textSize') && typeof source.textSizeLarge === 'boolean') {
    migrated.textSize = source.textSizeLarge ? 'large' : 'standard';
  }
  if (!Object.hasOwn(source, 'spacing') && typeof source.spacingRelaxed === 'boolean') {
    migrated.spacing = source.spacingRelaxed ? 'relaxed' : 'standard';
  }
  delete migrated.voiceInput;
  delete migrated.textSizeLarge;
  delete migrated.spacingRelaxed;
  return migrated;
};

const cleanOverrides = (value, allowedKeys = editableKeySet) => {
  const clean = {};
  Object.entries(migrateLegacySettingAliases(value)).forEach(([key, setting]) => {
    if (!allowedKeys.has(key)) return;
    if (key === 'textSize' && !validTextSizes.has(setting)) return;
    if (key === 'spacing' && !validSpacing.has(setting)) return;
    if (key === 'readingWidth' && !validWidths.has(setting)) return;
    if (key === 'narrationSpeed' && !validNarrationSpeeds.has(String(setting))) return;
    if (key === 'narrationVolume' && !validNarrationVolumes.has(String(setting))) return;
    if (key === 'numericProgress' && !validNumericProgress.has(setting)) return;
    if (key === 'narrationVoice' && (typeof setting !== 'string' || setting.length > 300)) return;
    if (!['textSize', 'spacing', 'readingWidth', 'narrationSpeed', 'narrationVolume', 'narrationVoice', 'numericProgress'].includes(key) && typeof setting !== 'boolean') return;
    clean[key] = ['narrationSpeed', 'narrationVolume'].includes(key) ? String(setting) : setting;
  });
  return clean;
};

const cleanConflictResolutions = (value) => {
  const source = safeObject(value);
  const clean = {};
  Object.entries(source).forEach(([id, resolution]) => {
    const entry = safeObject(resolution);
    const key = canonicalSettingKey(entry.key);
    const choice = typeof entry.choice === 'string' ? entry.choice : '';
    const safeValue = cleanOverrides({ [key]: entry.value });
    if (!id || id.length > 180 || !validConflictChoices.has(choice) || !Object.hasOwn(safeValue, key)) return;
    clean[id] = { key, choice, value: safeValue[key] };
  });
  return clean;
};

const cleanActiveInputMethod = (value) => validInputMethods.has(value) ? value : 'keyboard';

/*
 * Older course builds stored a complete resolved settings snapshot under
 * `preferences`. Those values were not all choices made by the learner, so
 * copying that object into `userOverrides` would freeze platform defaults and
 * profile recommendations as if the learner had selected every value.
 *
 * Sparse legacy preference objects were used for explicit choices in earlier
 * shared-settings versions, so those remain migratable. A large object, or an
 * object carrying the old platform-protection signature, is a resolved
 * snapshot and is not promoted. Explicit `overrides`/`userOverrides`
 * envelopes still migrate even when their parent object is a snapshot.
 *
 * The old course snapshot itself is intentionally left to the course's
 * separate bounded migration, which knows which controls that build exposed.
 */
const directLegacyOverrides = (record) => {
  if (looksLikeResolvedSettingsSnapshot(record)) return {};
  const direct = {};
  Object.entries(safeObject(record)).forEach(([key, value]) => {
    if (editableKeySet.has(canonicalSettingKey(key))) direct[key] = value;
  });
  return cleanOverrides(direct);
};

const looksLikeResolvedSettingsSnapshot = (value) => {
  const source = safeObject(value);
  const settingKeyCount = Object.keys(source)
    .filter((key) => validKeys.has(canonicalSettingKey(key)))
    .length;
  const platformSignature = [
    'automaticSaving',
    'noTimers',
    'pauseResume',
    'easyReturn',
    'writtenInstructions',
    'captionsTranscripts',
    'noAutoplay',
    'noUnexpectedSound'
  ];
  const signatureCount = platformSignature.filter((key) => Object.hasOwn(source, key)).length;
  // A learner could reasonably have made a dozen individual changes in an
  // older build. Only treat a preferences object as a broad resolved snapshot
  // when it contains most of today's editable surface, or carries the old
  // always-on platform signature.
  return settingKeyCount >= 20 || signatureCount >= 4;
};

const provenLegacyAliasOverrides = (value) => {
  const source = safeObject(value);
  const overrides = {};
  if (source.voiceInput === true || source.speechToText === true) overrides.speechToText = true;
  if (source.textSizeLarge === true) overrides.textSize = 'large';
  if (source.spacingRelaxed === true) overrides.spacing = 'relaxed';
  return overrides;
};

const explicitLegacyOverrideEnvelope = (value) => {
  const container = safeObject(value);
  return {
    ...(looksLikeResolvedSettingsSnapshot(container) ? provenLegacyAliasOverrides(container) : cleanOverrides(container)),
    ...cleanOverrides(container.overrides),
    ...cleanOverrides(container.userOverrides)
  };
};

const migrateExplicitLegacyOverrides = (record) => ({
  ...explicitLegacyOverrideEnvelope(record.legacyPreferences),
  ...explicitLegacyOverrideEnvelope(record.preferences),
  ...provenLegacyAliasOverrides(record),
  ...directLegacyOverrides(record)
});

const cleanTimestamp = (value) => typeof value === 'string' && value.length <= 80 ? value : '';

const normaliseOnboarding = (raw, state) => {
  const saved = safeObject(raw);
  const requestedMethod = typeof saved.method === 'string' ? saved.method : '';
  const completed = Boolean(saved.completed || state.legacyComplete);
  const primaryCandidate = typeof saved.primaryProfile === 'string'
    ? saved.primaryProfile
    : (typeof saved.primaryProfileId === 'string' ? saved.primaryProfileId : state.primaryPresetId);
  const primaryProfile = isRecommendationProfileId(primaryCandidate)
    ? primaryCandidate
    : (state.primaryPresetId || (completed ? BALANCED_START_PRESET_ID : ''));
  const secondarySource = Array.isArray(saved.secondaryProfiles)
    ? saved.secondaryProfiles
    : (Array.isArray(saved.secondaryProfileIds) ? saved.secondaryProfileIds : state.selectedPresetIds.filter((id) => id !== primaryProfile));
  const secondaryProfiles = orderProfileIds(secondarySource).filter((id) => id !== primaryProfile).slice(0, 2);
  const inferredMethod = primaryProfile === BALANCED_START_PRESET_ID ? 'standard' : (state.selectedPresetIds.length ? 'legacy' : '');
  return {
    completed,
    method: requestedMethod && validOnboardingMethods.has(requestedMethod) ? requestedMethod : inferredMethod,
    recommendationVersion: Number.isInteger(saved.recommendationVersion) && saved.recommendationVersion > 0
      ? saved.recommendationVersion
      : RECOMMENDATION_VERSION,
    primaryProfile,
    secondaryProfiles,
    selectedAnswers: cleanSelectedAnswerIds(saved.selectedAnswers),
    completedAt: cleanTimestamp(saved.completedAt)
  };
};

export const getLearnerSettingsKey = (learnerId) => SETTINGS_STORAGE_PREFIX + encodeURIComponent(String(learnerId || 'learner'));

export const createSettingsState = (saved) => {
  const record = safeObject(saved);
  const rawOnboarding = safeObject(record.onboarding);
  const savedSecondaryProfiles = Array.isArray(rawOnboarding.secondaryProfiles)
    ? rawOnboarding.secondaryProfiles
    : (Array.isArray(rawOnboarding.secondaryProfileIds) ? rawOnboarding.secondaryProfileIds : []);
  const selected = cleanProfileIds([
    ...(Array.isArray(record.selectedPresetIds) ? record.selectedPresetIds : []),
    ...savedSecondaryProfiles
  ]);
  const requestedPrimary = [
    typeof record.primaryPresetId === 'string' ? record.primaryPresetId : '',
    typeof rawOnboarding.primaryProfile === 'string' ? rawOnboarding.primaryProfile : '',
    typeof rawOnboarding.primaryProfileId === 'string' ? rawOnboarding.primaryProfileId : ''
  ].find(isRecommendationProfileId) || '';
  let primary = requestedPrimary || selected[0] || '';
  const legacyOverrides = migrateExplicitLegacyOverrides(record);
  const currentOverrides = cleanOverrides(record.userOverrides);
  const userOverrides = { ...legacyOverrides, ...currentOverrides };
  const temporaryOverrides = cleanOverrides(record.temporaryOverrides, temporaryOverrideKeys);
  const conflictResolutions = cleanConflictResolutions(record.conflictResolutions);
  const activeInputMethod = cleanActiveInputMethod(record.activeInputMethod);
  const legacyComplete = Boolean(record.setupComplete || record.onboarded || rawOnboarding.completed || primary || selected.length || Object.keys(userOverrides).length);
  if (!primary && legacyComplete) primary = BALANCED_START_PRESET_ID;
  const selectedPresetIds = primary === BALANCED_START_PRESET_ID
    ? []
    : orderProfileIds(selected, primary);
  const onboarding = normaliseOnboarding(rawOnboarding, {
    primaryPresetId: primary,
    selectedPresetIds,
    legacyComplete
  });

  return {
    version: SETTINGS_VERSION,
    setupComplete: legacyComplete,
    primaryPresetId: primary,
    selectedPresetIds,
    userOverrides,
    temporaryOverrides,
    conflictResolutions,
    activeInputMethod,
    customSetup: Boolean(record.customSetup || Object.keys(userOverrides).length || Object.keys(conflictResolutions).length),
    onboarding,
    updatedAt: cleanTimestamp(record.updatedAt)
  };
};

export const scoreSupportAnswers = (selectedAnswerIds) => {
  const selectedOptionIds = cleanSelectedAnswerIds(selectedAnswerIds);
  const dimensionScores = Object.fromEntries(SUPPORT_DIMENSION_IDS.map((id) => [id, 0]));
  selectedOptionIds.forEach((id) => {
    Object.entries(optionById.get(id)?.effects || {}).forEach(([dimension, value]) => {
      dimensionScores[dimension] += Number(value) || 0;
    });
  });
  return {
    selectedOptionIds,
    dimensionScores,
    reasonLabels: selectedOptionIds
      .map((id) => optionById.get(id))
      .filter((option) => Object.keys(option.effects || {}).length)
      .map((option) => option.label)
  };
};

const scoreProfile = (profile, dimensionScores) => {
  const entries = Object.entries(profile.matchWeights || {});
  const totalWeight = entries.reduce((sum, [, weight]) => sum + Number(weight || 0), 0);
  if (!totalWeight) return 0;
  return entries.reduce((sum, [dimension, weight]) => sum + ((dimensionScores[dimension] || 0) * Number(weight || 0)), 0) / totalWeight;
};

/*
 * Deterministic, transparent recommendation rules:
 * - no points means a balanced starting setup;
 * - a profile needs 1.25 to be considered;
 * - up to two secondary overlays need at least 65% of the primary score;
 * - profiles within 0.25 of the winner are surfaced as equally strong choices.
 */
export const recommendSupportProfiles = (selectedAnswerIds) => {
  const scoredAnswers = scoreSupportAnswers(selectedAnswerIds);
  const total = Object.values(scoredAnswers.dimensionScores).reduce((sum, value) => sum + value, 0);
  const scores = Object.fromEntries(PRESETS.map((profile) => [profile.id, Number(scoreProfile(profile, scoredAnswers.dimensionScores).toFixed(3))]));

  if (!total) {
    return {
      primaryProfileId: BALANCED_START_PRESET_ID,
      secondaryProfileIds: [],
      equallyStrongProfileIds: [],
      dimensionScores: scoredAnswers.dimensionScores,
      selectedOptionIds: scoredAnswers.selectedOptionIds,
      reasonLabels: [],
      scores,
      isBalanced: true,
      confidence: 'starting-point'
    };
  }

  const ranked = PRESETS
    .map((profile, index) => ({ id: profile.id, score: scores[profile.id], index }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const eligible = ranked.filter((item) => item.score >= 1.25);

  if (!eligible.length) {
    return {
      primaryProfileId: BALANCED_START_PRESET_ID,
      secondaryProfileIds: [],
      equallyStrongProfileIds: [],
      dimensionScores: scoredAnswers.dimensionScores,
      selectedOptionIds: scoredAnswers.selectedOptionIds,
      reasonLabels: scoredAnswers.reasonLabels.slice(0, 3),
      scores,
      isBalanced: true,
      confidence: 'starting-point'
    };
  }

  const primary = eligible[0];
  const equallyStrongProfileIds = eligible
    .filter((item) => primary.score - item.score <= 0.25)
    .map((item) => item.id);
  const chosenProfiles = [presetById.get(primary.id)].filter(Boolean);
  const secondaryProfileIds = [];
  eligible.slice(1).forEach((item) => {
    if (secondaryProfileIds.length >= PRESET_SELECTION_LIMIT - 1 || item.score < primary.score * 0.65) return;
    const candidate = presetById.get(item.id);
    if (!candidate || !chosenProfiles.every((profile) => profilePairIsCompatible(profile, candidate))) return;
    chosenProfiles.push(candidate);
    secondaryProfileIds.push(candidate.id);
  });

  return {
    primaryProfileId: primary.id,
    secondaryProfileIds,
    equallyStrongProfileIds,
    dimensionScores: scoredAnswers.dimensionScores,
    selectedOptionIds: scoredAnswers.selectedOptionIds,
    reasonLabels: scoredAnswers.reasonLabels.slice(0, 3),
    scores,
    isBalanced: false,
    confidence: 'starting-point'
  };
};

export const resolveSettings = (input) => {
  const state = createSettingsState(input);
  const resolved = { ...PLATFORM_DEFAULTS };
  state.selectedPresetIds.forEach((id) => Object.assign(resolved, presetById.get(id)?.settings || {}));
  Object.assign(resolved, state.userOverrides, state.temporaryOverrides);
  // These structural protections are the highest-priority layer. They cannot
  // be disabled by a profile, learner choice, lesson override, or old record.
  Object.assign(resolved, PROTECTION_VALUES);
  return resolved;
};

/* Return only editable keys for a control list or profile preview. A profile's
   preview is intentionally based on its real overlay rather than every setting
   available elsewhere on the Settings page. */
export const getLearnerVisibleSettingKeys = (input) => {
  let candidates = EDITABLE_SETTING_KEYS;
  if (Array.isArray(input) || input instanceof Set) candidates = [...input];
  else if (safeObject(input).settings && typeof input.settings === 'object') candidates = Object.keys(safeObject(input.settings));
  return unique(candidates.map(canonicalSettingKey)).filter((key) => editableKeySet.has(key));
};

export const getSettingProvenance = (input, key) => {
  const state = createSettingsState(input);
  const value = resolveSettings(state)[key];
  if (!validKeys.has(key)) return { value, source: 'default', profileId: '', profileName: '' };
  if (protectionKeySet.has(key)) return { value, source: 'safety', profileId: '', profileName: '' };
  if (Object.hasOwn(state.temporaryOverrides, key)) return { value, source: 'temporary', profileId: '', profileName: '' };
  if (Object.hasOwn(state.userOverrides, key)) return { value, source: 'user', profileId: '', profileName: '' };
  const profile = [...state.selectedPresetIds]
    .reverse()
    .map((id) => presetById.get(id))
    .find((item) => Object.hasOwn(item?.settings || {}, key));
  if (profile) {
    return {
      value,
      source: state.onboarding.method === 'questionnaire' ? 'recommended' : 'preset',
      profileId: profile.id,
      profileName: profile.name
    };
  }
  return { value, source: 'default', profileId: '', profileName: '' };
};

export const settingSource = (input, key) => {
  const provenance = getSettingProvenance(input, key);
  if (provenance.source === 'safety') return 'Always on to protect your work';
  if (provenance.source === 'temporary') return 'Temporary for this lesson';
  if (provenance.source === 'user') return 'Changed by you';
  if (provenance.source === 'recommended') return 'Recommended by ' + provenance.profileName;
  if (provenance.source === 'preset') return 'Provided by ' + provenance.profileName;
  return 'Platform default';
};

const conflictIdFor = (type, ids, key = '') => [type, ...[...ids].sort(), key].filter(Boolean).join(':');
const profilePairIsCompatible = (left, right) => {
  if (!left || !right || left.id === right.id) return true;
  return left.compatibleWith.includes(right.id) && right.compatibleWith.includes(left.id);
};
const profileValueContributions = (profiles) => {
  const values = new Map();
  profiles.forEach((profile) => {
    Object.entries(profile.settings || {}).forEach(([key, value]) => {
      if (!values.has(key)) values.set(key, []);
      values.get(key).push({ profileId: profile.id, profileName: profile.name, value });
    });
  });
  return values;
};
const conflictResolutionFor = (state, conflict) => {
  // A saved value normally is an intentional manual choice. Sensory and
  // motion conflicts are different: merely having an old value in storage
  // must not silently re-enable movement or undo a calmer visual mode.
  const requiresExplicitSafetyChoice = ['auto-scroll-reduce-motion', 'auto-scroll-low-stimulation', 'high-contrast-low-stimulation'].includes(conflict.type);
  if (!requiresExplicitSafetyChoice && Object.hasOwn(state.userOverrides, conflict.key)) {
    return { resolved: true, source: 'manual', value: state.userOverrides[conflict.key] };
  }
  const saved = state.conflictResolutions?.[conflict.id];
  if (saved && saved.key === conflict.key) return { resolved: true, source: 'resolution', value: saved.value, choice: saved.choice };
  return { resolved: false, source: '', value: undefined };
};

/*
 * Inspect a requested set of profiles before it is applied. It intentionally
 * does not mutate state: setup and Settings can display compatibility,
 * duplicates, and preference choices before saving a final configuration.
 */
export const getPresetSelectionAnalysis = (input, profileIds) => {
  const state = createSettingsState(input);
  const selectedPresetIds = orderProfileIds(profileIds, state.primaryPresetId);
  const profiles = selectedPresetIds.map((id) => presetById.get(id)).filter(Boolean);
  const conflicts = [];

  if (profiles.length > PRESET_SELECTION_LIMIT) {
    conflicts.push({
      id: 'selection-limit',
      type: 'selection-limit',
      blocking: true,
      message: 'Choose up to ' + PRESET_SELECTION_LIMIT + ' support bundles at one time so the setup stays clear and reviewable.'
    });
  }

  profiles.forEach((profile, index) => {
    profiles.slice(index + 1).forEach((other) => {
      if (profilePairIsCompatible(profile, other)) return;
      const explicitConflict = profile.conflictsWith.includes(other.id) || other.conflictsWith.includes(profile.id);
      const customMessage = [...profile.conflictMetadata, ...other.conflictMetadata]
        .map((item) => item?.message)
        .find(Boolean);
      conflicts.push({
        id: conflictIdFor(explicitConflict ? 'preset-conflict' : 'preset-incompatible', [profile.id, other.id]),
        type: explicitConflict ? 'preset-conflict' : 'preset-incompatible',
        blocking: true,
        profileIds: [profile.id, other.id],
        message: customMessage || (profile.name + ' and ' + other.name + ' are not a compatible support-bundle combination. Choose one of them, then review individual settings if needed.')
      });
    });
  });

  const contributions = profileValueContributions(profiles);
  const duplicateSettingKeys = [];
  contributions.forEach((entries, key) => {
    if (entries.length > 1 && new Set(entries.map((entry) => JSON.stringify(entry.value))).size === 1) duplicateSettingKeys.push(key);
    if (entries.length < 2 || new Set(entries.map((entry) => JSON.stringify(entry.value))).size < 2) return;
    const first = entries[0];
    const second = entries.find((entry) => JSON.stringify(entry.value) !== JSON.stringify(first.value));
    const conflict = {
      id: conflictIdFor('preset-setting', [first.profileId, second.profileId], key),
      type: 'preset-setting',
      key,
      profileIds: [first.profileId, second.profileId],
      firstValue: first.value,
      secondValue: second.value,
      message: first.profileName + ' and ' + second.profileName + ' have different preferences for ' + key + '. Choose which setting you prefer.'
    };
    const resolution = conflictResolutionFor(state, conflict);
    conflicts.push({ ...conflict, blocking: !resolution.resolved, resolution });
  });

  const base = { ...PLATFORM_DEFAULTS };
  profiles.forEach((profile) => Object.assign(base, profile.settings || {}));
  Object.assign(base, state.userOverrides);
  const activeLowStimulation = selectedPresetIds.includes('low-stimulation') || Boolean(base.quietDisplay);
  const addSafetyPreferenceConflict = ({ type, key, firstValue, secondValue, message }) => {
    const conflict = {
      id: conflictIdFor(type, selectedPresetIds, key),
      type,
      key,
      profileIds: selectedPresetIds,
      firstValue,
      secondValue,
      message
    };
    const resolution = conflictResolutionFor(state, conflict);
    conflicts.push({ ...conflict, blocking: !resolution.resolved, resolution });
  };
  if (base.narrationAutoScroll && base.reducedMotion) {
    addSafetyPreferenceConflict({
      type: 'auto-scroll-reduce-motion',
      key: 'narrationAutoScroll',
      firstValue: true,
      secondValue: false,
      message: 'Auto-scroll while listening conflicts with Reduce motion. Choose manual scrolling or turn off Reduce motion before using auto-scroll.'
    });
  }
  if (base.narrationAutoScroll && activeLowStimulation) {
    addSafetyPreferenceConflict({
      type: 'auto-scroll-low-stimulation',
      key: 'narrationAutoScroll',
      firstValue: true,
      secondValue: false,
      message: 'Auto-scroll while listening conflicts with the calmer presentation requested by Low Stimulation. Choose manual scrolling or keep auto-scroll as your custom preference.'
    });
  }
  if (base.highContrast && activeLowStimulation) {
    addSafetyPreferenceConflict({
      type: 'high-contrast-low-stimulation',
      key: 'highContrast',
      firstValue: true,
      secondValue: false,
      message: 'High contrast can add visual intensity that conflicts with the calmer presentation requested by Low Stimulation. Choose the display preference that helps you most.'
    });
  }
  if (Object.hasOwn(state.userOverrides, 'numericProgress')
    && state.userOverrides.numericProgress === 'full'
    && profiles.some((profile) => profile.id === 'clear-progress')) {
    const conflict = {
      id: conflictIdFor('numeric-progress-low-pressure', selectedPresetIds, 'numericProgress'),
      type: 'numeric-progress-low-pressure',
      key: 'numericProgress',
      profileIds: selectedPresetIds,
      firstValue: 'full',
      secondValue: 'reduced',
      message: 'Clear Progress uses a low-pressure progress view, while your current setting asks for full numeric progress. Choose the version you prefer.'
    };
    const resolution = conflictResolutionFor(state, conflict);
    conflicts.push({ ...conflict, blocking: !resolution.resolved, resolution });
  }

  const inputMethodIds = getAvailableInputMethods({ ...state, selectedPresetIds, primaryPresetId: selectedPresetIds[0] || BALANCED_START_PRESET_ID });
  const blockingConflicts = conflicts.filter((conflict) => conflict.blocking);
  return {
    selectedPresetIds,
    profiles,
    combinedSettingKeys: Array.from(contributions.keys()),
    duplicateSettingKeys,
    conflicts,
    blockingConflicts,
    canApply: blockingConflicts.length === 0,
    inputMethodIds
  };
};

export const getAvailableInputMethods = (input) => {
  const settings = resolveSettings(input);
  const methods = ['keyboard'];
  if (settings.speechToText) methods.push('voice');
  if (settings.alternativeInput || settings.alternativeResponses) methods.push('alternative');
  if (settings.switchInput) methods.push('switch');
  if (settings.oneHandedInput) methods.push('one-handed');
  return Array.from(new Set(methods));
};

export const setActiveInputMethod = (input, method) => {
  const state = createSettingsState(input);
  const available = getAvailableInputMethods(state);
  const activeInputMethod = available.includes(method) ? method : 'keyboard';
  return { ...state, activeInputMethod, customSetup: activeInputMethod !== 'keyboard' || state.customSetup, updatedAt: timestamp() };
};

export const applyPresetConflictResolution = (input, conflict, choice) => {
  const state = createSettingsState(input);
  const entry = safeObject(conflict);
  const key = canonicalSettingKey(entry.key);
  if (!editableKeySet.has(key) || !validConflictChoices.has(choice)) return state;
  const candidateValue = choice === 'keep-first'
    ? entry.firstValue
    : choice === 'use-second'
      ? entry.secondValue
      : PLATFORM_DEFAULTS[key];
  const safeValue = cleanOverrides({ [key]: candidateValue });
  if (!Object.hasOwn(safeValue, key)) return state;
  const companionOverrides = {};
  if (entry.type === 'auto-scroll-reduce-motion' && choice === 'keep-first') companionOverrides.reducedMotion = false;
  if (entry.type === 'auto-scroll-low-stimulation' && choice === 'keep-first') companionOverrides.quietDisplay = false;
  if (entry.type === 'high-contrast-low-stimulation' && choice === 'keep-first') companionOverrides.quietDisplay = false;
  return {
    ...state,
    userOverrides: { ...state.userOverrides, [key]: safeValue[key], ...companionOverrides },
    conflictResolutions: {
      ...state.conflictResolutions,
      [String(entry.id || conflictIdFor('manual-resolution', [], key))]: { key, choice, value: safeValue[key] }
    },