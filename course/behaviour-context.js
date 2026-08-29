// BEHAVIOUR CONTEXT — browser-only by default.
// This class keeps compact session aggregates that every adaptive surface can
// consult. It never stores raw typed text, individual keys, speech, chat, a
// microphone recording, answer content, scores, or a learner label.
const now = () => performance.now();
const bounded = (value, maximum = 1000) => Math.max(0, Math.min(maximum, Math.round(Number(value) || 0)));
const roles = new Set(['calm-guide', 'learning-partner', 'self-challenge', 'visual-co-explorer']);
const presence = new Set(['quiet', 'available', 'involved']);

export const normalisePartnerControls = (value = {}) => ({
  enabled: value.enabled === true,
  role: roles.has(value.role) ? value.role : 'calm-guide',
  presence: presence.has(value.presence) ? value.presence : 'available',
  proactive: value.proactive !== false,
  channel: ['text', 'speech', 'both'].includes(value.channel) ? value.channel : 'text'
});

export const deriveBehaviourSignals = ({ metrics = {}, phase = 'read', support = {}, completed = false } = {}) => ({
  delayedStart: Number(metrics.firstActionMs || 0) >= 90000,
  returned: Number(metrics.returns || 0) >= 1,
  rereads: Number(metrics.rereads || 0) >= 2,
  longReading: phase === 'read' && Number(metrics.activeMs || 0) >= 8 * 60 * 1000,
  longTypingPause: phase === 'type' && Number(metrics.typingLongestPauseMs || 0) >= 45000,
  retries: Number(metrics.typingAbandons || 0) >= 1 || Number(metrics.typingBackspaces || 0) >= 8,
  aiRequests: Number(metrics.aiRequests || 0) >= 3,
  noTaskMovement: Number(metrics.aiActiveMs || 0) >= 6 * 60 * 1000,
  completed: Boolean(completed),
  assessmentUncertainty: phase === 'assessment' && (Number(metrics.typingLongestPauseMs || 0) >= 45000 || Boolean(support.assessmentHelp))
});

// Store only the public, neutral state names that other adaptive features
// understand. Raw counters stay local unless the learner explicitly enables
// adaptive summaries, and neither list is a description of the learner.
export const supportStatesForSignals = (signals = {}) => {
  const states = [];
  if (signals.delayedStart && signals.returned) states.push('starting');
  if (signals.aiRequests && signals.noTaskMovement) states.push('returning');
  if (signals.rereads && signals.longReading) states.push('re-reading');
  if (signals.longTypingPause && signals.retries) states.push('working-through-typing');
  if (signals.aiRequests) states.push('using-support');
  if (signals.completed) states.push('ready-for-next-step');
  if (signals.assessmentUncertainty) states.push('needs-a-choice');
  return states.slice(0, 7);
};

const names = {
  'calm-guide': { en: 'Calm Guide', ur: 'پُرسکون رہنما' },
  'learning-partner': { en: 'Learning Partner', ur: 'سیکھنے کا ساتھی' },
  'self-challenge': { en: 'Self-Challenge Coach', ur: 'خود چیلنج کوچ' },
  'visual-co-explorer': { en: 'Visual Co-Explorer', ur: 'بصری ساتھی' }
};
export const partnerRoleName = (role, language = 'en') => names[role]?.[language === 'ur' ? 'ur' : 'en'] || names['calm-guide'][language === 'ur' ? 'ur' : 'en'];

export class BehaviourContext {
  constructor() {
    this.module = { courseId: '', courseVersion: '', moduleIndex: 0, phase: 'read', language: 'en', layout: 'balanced', objectiveIds: [] };
    this.controls = normalisePartnerControls();
    this.metrics = this.emptyMetrics();
    this.support = this.emptySupport();
    this.completed = false;
    this.history = { offered: 0, accepted: 0, dismissed: 0, visualsOpened: 0, missionsCompleted: 0 };
    this.dismissed = new Set();
    this.startedAt = now();
    this.lastActionAt = this.startedAt;
    this.lastTickAt = this.startedAt;
    // Course AI can stay open while the learner reads or composes a question.
    // Keep only that bounded elapsed time; the context never sees the thread,
    // prompt, reply, or an input transcript.
    this.aiSessionStartedAt = 0;
    this.visibilityHandler = () => {
      this.metrics.visibilityChanges += 1;
      this.tick();
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  emptyMetrics() {
    // These are deliberately course-interaction aggregates, never a replay of
    // a person. They let the support and assessment systems notice whether a
    // course surface was revisited or difficult to move through without
    // retaining words, keys, pointer coordinates, audio, or a profile.
    return {
      activeMs: 0, idleMs: 0, visibilityChanges: 0, firstActionMs: 0,
      returns: 0, rereads: 0, readingSectionMoves: 0, readingSectionBacktracks: 0,
      typingCharacters: 0, typingCorrectCharacters: 0, typingIncorrectCharacters: 0,
      typingBackspaces: 0, typingAbandons: 0, typingLongestPauseMs: 0,
      typingPauseTotalMs: 0, typingBursts: 0, typingFocusReturns: 0,
      taskFocusChanges: 0, taskFocusReturns: 0, controlActivations: 0,
      scrollMoves: 0, scrollBacktracks: 0, maxScrollDepth: 0, viewportChanges: 0,
      ttsStarts: 0, ttsCompleted: 0, ttsPauses: 0,
      speechStarts: 0, speechCompleted: 0,
      aiRequests: 0, aiActiveMs: 0, aiDismissals: 0,
      visualCloses: 0, settingsChanges: 0
    };
  }

  // Support use is kept separately from interaction rhythm. These are
  // learner-initiated feature switches, not an inference about why a learner
  // used them. The same bounded flags are safe to use for an optional next
  // offer and, after consent, for one compact module summary.
  emptySupport() {
    return {
      assessmentHelp: false,
      textToSpeech: false,
      visualOffered: false,
      visualOpened: false,
      taskInitiationOffered: false,
      taskInitiationUsed: false
    };
  }

  begin({ courseId = '', courseVersion = '', moduleIndex, phase, language, layout, objectiveIds = [], moduleTitle = '', controls }) {
    const nextCourseId = String(courseId || '').slice(0, 80);
    const nextCourseVersion = String(courseVersion || '').slice(0, 24);
    const changed = this.module.courseId !== nextCourseId
      || this.module.courseVersion !== nextCourseVersion
      || this.module.moduleIndex !== Number(moduleIndex)
      || this.module.language !== (language === 'ur' ? 'ur' : 'en');
    const phaseChanged = this.module.phase !== String(phase || this.module.phase);
    if (changed) {
      this.module = { courseId: nextCourseId, courseVersion: nextCourseVersion, moduleIndex: Number(moduleIndex) || 0, phase: String(phase || 'read'), language: language === 'ur' ? 'ur' : 'en', layout: layout || 'balanced', objectiveIds: Array.isArray(objectiveIds) ? objectiveIds.slice(0, 3) : [], moduleTitle: String(moduleTitle || '').slice(0, 180) };
      this.metrics = this.emptyMetrics();
      this.support = this.emptySupport();
      this.completed = false;
      this.history = { offered: 0, accepted: 0, dismissed: 0, visualsOpened: 0, missionsCompleted: 0 };
      this.dismissed.clear();
      this.startedAt = now();
      this.lastActionAt = this.startedAt;
      this.lastTickAt = this.startedAt;
      this.aiSessionStartedAt = 0;
    } else {
      this.module.phase = String(phase || this.module.phase);
      this.module.layout = layout || this.module.layout;
      this.module.objectiveIds = Array.isArray(objectiveIds) ? objectiveIds.slice(0, 3) : this.module.objectiveIds;
      this.module.moduleTitle = String(moduleTitle || this.module.moduleTitle || '').slice(0, 180);
      if (phaseChanged) this.completed = false;
    }
    this.controls = normalisePartnerControls(controls);
  }

  action(kind, detail = {}) {
    this.tick();
    const at = now();
    if (!this.metrics.firstActionMs) this.metrics.firstActionMs = bounded(at - this.startedAt, 30 * 60 * 1000);
    this.lastActionAt = at;
    if (kind === 'return') this.metrics.returns += 1;
    if (kind === 'reread') this.metrics.rereads += 1;
    if (kind === 'reading-section') {
      this.metrics.readingSectionMoves += 1;
      if (detail.direction === 'back') this.metrics.readingSectionBacktracks += 1;
    }
    if (kind === 'focus') {
      this.metrics.taskFocusChanges += 1;
      if (detail.returning === true) this.metrics.taskFocusReturns += 1;
      if (detail.typing === true) this.metrics.typingFocusReturns += 1;
    }
    if (kind === 'control') this.metrics.controlActivations += 1;
    if (kind === 'scroll') {
      this.metrics.scrollMoves += 1;
      if (detail.direction === 'back') this.metrics.scrollBacktracks += 1;
      this.metrics.maxScrollDepth = Math.max(this.metrics.maxScrollDepth, bounded(detail.depth, 100));
    }
    if (kind === 'viewport') this.metrics.viewportChanges += 1;
    if (kind === 'ai-request') this.metrics.aiRequests += 1;
    if (kind === 'ai-dismiss') this.metrics.aiDismissals += 1;
    if (kind === 'tts-start') this.metrics.ttsStarts += 1;
    if (kind === 'tts-complete') this.metrics.ttsCompleted += 1;
    if (kind === 'tts-pause') this.metrics.ttsPauses += 1;
    if (kind === 'speech-start') this.metrics.speechStarts += 1;
    if (kind === 'speech-complete') this.metrics.speechCompleted += 1;
    if (kind === 'ai-open') this.aiSessionStartedAt = at;
    if (kind === 'ai-close' && this.aiSessionStartedAt) {
      this.aiSessionStartedAt = 0;
    }
    if (kind === 'typing') {
      this.metrics.typingCharacters += bounded(detail.characters, 12000);
      this.metrics.typingCorrectCharacters += bounded(detail.correctCharacters, 12000);
      this.metrics.typingIncorrectCharacters += bounded(detail.incorrectCharacters, 12000);
      this.metrics.typingBackspaces += bounded(detail.backspaces, 12000);
      this.metrics.typingLongestPauseMs = Math.max(this.metrics.typingLongestPauseMs, bounded(detail.pauseMs, 10 * 60 * 1000));
      this.metrics.typingPauseTotalMs += bounded(detail.pauseMs, 30 * 60 * 1000);
      if (bounded(detail.characters, 12000) > 0) this.metrics.typingBursts += 1;
    }
    if (kind === 'typing-retry') this.metrics.typingAbandons += 1;
    if (kind === 'assessment-help') this.support.assessmentHelp = true;
    if (kind === 'tts-start') this.support.textToSpeech = true;
    if (kind === 'visual-offered') this.support.visualOffered = true;
    if (kind === 'visual-open') this.support.visualOpened = true;
    if (kind === 'visual-close') this.metrics.visualCloses += 1;
    if (kind === 'task-initiation-offered') this.support.taskInitiationOffered = true;
    if (kind === 'task-initiation-used') this.support.taskInitiationUsed = true;
    if (kind === 'settings-change') this.metrics.settingsChanges += 1;
    if (kind === 'complete') this.completed = true;
  }

  tick() {
    const at = now();
    const elapsed = Math.max(0, at - this.lastTickAt);
    this.lastTickAt = at;
    if (this.aiSessionStartedAt && document.visibilityState === 'visible') {
      this.metrics.aiActiveMs += bounded(at - this.aiSessionStartedAt, 30 * 60 * 1000);
      this.aiSessionStartedAt = at;
    }
    // “Active” remains intentionally conservative: a visible page is active
    // only shortly after a real course action; the rest is aggregate idle time.
    if (document.visibilityState === 'visible' && at - this.lastActionAt <= 45000) this.metrics.activeMs += bounded(elapsed, 4 * 60 * 60 * 1000);
    else this.metrics.idleMs += bounded(elapsed, 4 * 60 * 60 * 1000);
  }

  key(trigger) { return [this.module.moduleIndex, this.module.phase, trigger].join(':'); }
  dismiss(trigger) { this.dismissed.add(this.key(trigger)); this.history.dismissed += 1; }
  accept(action) {
    this.history.accepted += 1;
    if (action === 'open-visual') this.history.visualsOpened += 1;
    if (action === 'optional-mission') this.history.missionsCompleted += 1;
  }
  isDismissed(trigger) { return this.dismissed.has(this.key(trigger)); }

  snapshot({ completed = false } = {}) {
    this.tick();
    const signals = deriveBehaviourSignals({ metrics: this.metrics, phase: this.module.phase, support: this.support, completed: completed || this.completed });
    const states = supportStatesForSignals(signals);
    return {
      schemaVersion: 2, courseId: this.module.courseId, courseVersion: this.module.courseVersion, moduleIndex: this.module.moduleIndex, phase: this.module.phase,
      language: this.module.language, layout: this.module.layout, objectiveIds: this.module.objectiveIds,
      // A reviewed module title is browser-session context only. It lets the
      // local Learning Partner stay truthful when another published course is
      // open; telemetry intentionally does not persist this display copy.
      moduleTitle: this.module.moduleTitle,
      controls: { enabled: this.controls.enabled, role: this.controls.role, presence: this.controls.presence, proactive: this.controls.proactive },
      metrics: { ...this.metrics }, support: { ...this.support }, signals,
      supportHistory: { accepted: this.history.accepted, dismissed: this.history.dismissed },
      behaviour: { role: this.controls.role, presence: this.controls.presence, proactive: this.controls.proactive, states, companion: { ...this.history } }
    };
  }

  dispose() { document.removeEventListener('visibilitychange', this.visibilityHandler); }
}
