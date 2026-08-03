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