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