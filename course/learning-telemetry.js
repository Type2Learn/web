const MAX_ACTIVE_GAP_MS = 45000;

const now = () => performance.now();
const bounded = (value, maximum = 4 * 60 * 60 * 1000) => Math.max(0, Math.min(maximum, Math.round(Number(value) || 0)));

export class LearningTelemetry {
  constructor({ onFlush = async () => {} } = {}) {
    this.onFlush = onFlush;
    this.enabled = false;
    this.context = null;
    this.metrics = this.emptyMetrics();
    this.support = this.emptySupport();
    this.lastMeaningfulActionAt = 0;
    this.lastTickAt = 0;
    this.contextStartedAt = 0;
    // AI time is collected as one aggregate number only.  No prompt, reply,
    // transcript, or keystroke stream is ever stored in this telemetry.
    this.aiSessionOpen = false;
    this.aiSessionStartedAt = 0;
    this.flushInFlight = null;
    this.visibilityHandler = () => {
      if (document.visibilityState !== 'visible') this.finishAiInterval();
      this.tick();
      if (document.visibilityState === 'visible' && this.aiSessionOpen && !this.aiSessionStartedAt) {
        this.aiSessionStartedAt = now();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  emptyMetrics() {
    return {
      activeMs: 0, idleMs: 0, firstActionMs: 0, returns: 0, rereads: 0,
      typingCharacters: 0, typingCorrectCharacters: 0, typingIncorrectCharacters: 0,
      typingBackspaces: 0, typingAbandons: 0, typingLongestPauseMs: 0,
      ttsStarts: 0, ttsCompleted: 0, speechStarts: 0, speechCompleted: 0,
      aiRequests: 0, aiActiveMs: 0
    };
  }

  emptySupport() {
    return { textToSpeech: false, visualOffered: false, visualOpened: false, taskInitiationOffered: false, taskInitiationUsed: false };
  }

  begin(context) {
    // A module is the aggregation boundary. Moving between reading, typing,
    // and checking must not create a stream of task-level uploads.
    const key = [context?.moduleIndex, context?.language].join(':');
    const oldKey = this.context && [this.context.moduleIndex, this.context.language].join(':');
    if (oldKey && oldKey !== key) {
      this.finishAiInterval();
      void this.flush('task-change');
    }
    if (oldKey !== key) {
      this.context = { moduleIndex: Number(context?.moduleIndex) || 0, phase: String(context?.phase || 'read'), language: context?.language === 'ur' ? 'ur' : 'en' };
      this.metrics = this.emptyMetrics();
      this.support = this.emptySupport();
      this.contextStartedAt = now();
      this.lastMeaningfulActionAt = this.contextStartedAt;
      this.lastTickAt = this.contextStartedAt;
      this.aiSessionOpen = false;
      this.aiSessionStartedAt = 0;
    } else if (this.context) {
      this.context.phase = String(context?.phase || this.context.phase || 'read');
    }
    this.enabled = Boolean(context?.enabled);
  }

  tick() {
    if (!this.context || !this.lastTickAt) return;
    const current = now();
    const elapsed = Math.max(0, current - this.lastTickAt);
    this.lastTickAt = current;
    if (!this.enabled || document.visibilityState !== 'visible') {
      this.metrics.idleMs += elapsed;
      return;
    }
    if (current - this.lastMeaningfulActionAt <= MAX_ACTIVE_GAP_MS) this.metrics.activeMs += elapsed;
    else this.metrics.idleMs += elapsed;
  }

  finishAiInterval() {
    if (!this.aiSessionStartedAt) return;
    const current = now();
    if (this.enabled && document.visibilityState === 'visible') {
      this.metrics.aiActiveMs += bounded(current - this.aiSessionStartedAt, 30 * 60 * 1000);
    }
    this.aiSessionStartedAt = 0;
  }

  action(kind, detail = {}) {
    this.tick();
    if (!this.context || !this.enabled) return;
    const current = now();
    if (!this.metrics.firstActionMs) this.metrics.firstActionMs = bounded(current - this.contextStartedAt, 30 * 60 * 1000);
    this.lastMeaningfulActionAt = current;
    if (kind === 'return') this.metrics.returns += 1;
    if (kind === 'reread') this.metrics.rereads += 1;
    if (kind === 'tts-start') this.metrics.ttsStarts += 1;
    if (kind === 'tts-complete') this.metrics.ttsCompleted += 1;
    if (kind === 'speech-start') this.metrics.speechStarts += 1;
    if (kind === 'speech-complete') this.metrics.speechCompleted += 1;
    if (kind === 'ai-request') this.metrics.aiRequests += 1;
    if (kind === 'ai-open') {
      this.aiSessionOpen = true;
      if (document.visibilityState === 'visible' && !this.aiSessionStartedAt) this.aiSessionStartedAt = current;
    }
    if (kind === 'ai-close') {
      this.finishAiInterval();
      this.aiSessionOpen = false;
    }
    if (kind === 'tts-start') this.support.textToSpeech = true;
    if (kind === 'visual-offered') this.support.visualOffered = true;
    if (kind === 'visual-open') this.support.visualOpened = true;
    if (kind === 'task-initiation-offered') this.support.taskInitiationOffered = true;
    if (kind === 'task-initiation-used') this.support.taskInitiationUsed = true;
    if (kind === 'typing') {
      this.metrics.typingCharacters += bounded(detail.characters, 12000);
      this.metrics.typingCorrectCharacters += bounded(detail.correctCharacters, 12000);
      this.metrics.typingIncorrectCharacters += bounded(detail.incorrectCharacters, 12000);
      this.metrics.typingBackspaces += bounded(detail.backspaces, 12000);
      this.metrics.typingLongestPauseMs = Math.max(this.metrics.typingLongestPauseMs, bounded(detail.pauseMs, 10 * 60 * 1000));
    }
  }

  snapshot(reason = 'manual') {
    this.tick();
    if (!this.enabled || !this.context) return null;
    return {
      clientSummaryId: [this.context.moduleIndex, this.context.phase, Math.round(now()), reason].join('-').replace(/[^A-Za-z0-9_-]/g, ''),
      moduleIndex: this.context.moduleIndex,
      phase: this.context.phase,
      language: this.context.language,
      metrics: Object.fromEntries(Object.entries(this.metrics).map(([key, value]) => [key, bounded(value)])),
      support: { ...this.support }
    };
  }

  async flush(reason = 'manual') {
    const summary = this.snapshot(reason);
    if (!summary || this.flushInFlight) return;
    this.flushInFlight = Promise.resolve(this.onFlush(summary)).catch(() => {}).finally(() => { this.flushInFlight = null; });
    await this.flushInFlight;
  }

  dispose() {
    this.finishAiInterval();
    this.aiSessionOpen = false;
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    void this.flush('dispose');
  }
}
