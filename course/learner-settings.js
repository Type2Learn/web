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