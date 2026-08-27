// LIVE SPEECH INPUT
//
// Speechmatics realtime keys are minted by the Type2Learn server after an
// authenticated learner action.  This module sends microphone audio directly
// to Speechmatics with that short-lived key; the long-lived provider key never
// reaches the browser and Render never has to proxy a continuous audio stream.
//
// It deliberately contains no course state.  The course player supplies small
// callbacks for interim/final text, so the same transport can serve typing,
// assessment, Course AI, and the mascot dock without persisting recordings or
// transcripts.

const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320; // 20 ms at 16 kHz.
const MAX_SOCKET_BUFFER_BYTES = 256 * 1024;
const RESUME_SOCKET_BUFFER_BYTES = 64 * 1024;
const FINAL_WAIT_MS = 4500;

const cleanText = (value) => String(value || '')
  .replace(/\u0000/g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s+([,.;!?؟])/g, '$1')
  .trim();

const joinText = (...parts) => cleanText(parts.filter(Boolean).join(' '));

/**
 * Convert one Speechmatics realtime event into readable text.  Their event
 * format is token based (`results[].alternatives[0].content`), but accepting
 * the documented display/transcript fallbacks makes the client resilient to
 * punctuation and model-version differences without guessing new words.
 */
export const extractRealtimeTranscript = (payload) => {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.metadata?.transcript === 'string') return cleanText(payload.metadata.transcript);
  if (typeof payload.transcript === 'string') return cleanText(payload.transcript);
  if (typeof payload.text === 'string') return cleanText(payload.text);
  const results = Array.isArray(payload.results) ? payload.results : [];
  return cleanText(results
    .map((result) => result?.alternatives?.[0]?.content ?? result?.content ?? '')
    .filter(Boolean)
    .join(' '));
};

export const realtimeEventKind = (payload) => String(payload?.message || payload?.type || '');

/**
 * A deliberately simple, deterministic PCM conversion.  It does not try to
 * repair, infer, or alter spoken language: it only changes Float32 microphone
 * samples into signed 16-bit PCM expected by the realtime recogniser.
 */
export const downsamplePcm16 = (samples, sourceRate, targetRate = TARGET_SAMPLE_RATE) => {
  if (!(samples instanceof Float32Array) || !Number.isFinite(sourceRate) || sourceRate <= 0) return new Int16Array();
  if (!Number.isFinite(targetRate) || targetRate <= 0) return new Int16Array();
  if (sourceRate === targetRate) {
    const pcm = new Int16Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, Number(samples[index]) || 0));
      pcm[index] = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
    }
    return pcm;
  }
  const ratio = sourceRate / targetRate;
  const length = Math.max(0, Math.floor(samples.length / ratio));
  const pcm = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(samples.length - 1, left + 1);
    const fraction = position - left;
    const sample = Math.max(-1, Math.min(1, (samples[left] || 0) + ((samples[right] || 0) - (samples[left] || 0)) * fraction));
    pcm[index] = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
  }
  return pcm;
};

export const concatPcm = (left, right) => {
  const next = new Int16Array((left?.length || 0) + (right?.length || 0));
  if (left?.length) next.set(left, 0);
  if (right?.length) next.set(right, left.length);
  return next;
};

const defaultWindow = () => (typeof window === 'undefined' ? null : window);

const workletSource = `
class Type2LearnRealtimePcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs && inputs[0] && inputs[0][0];
    if (input) this.port.postMessage(input.slice(0));
    return true;
  }
}
registerProcessor('type2learn-realtime-pcm-capture', Type2LearnRealtimePcmCapture);
`;

/**
 * Browser transport for a single explicit learner-controlled realtime speech
 * session.  No automatic reconnect is attempted: retrying after a provider or
 * microphone failure can look as though speech is being captured when it is
 * not.  The learner must press the microphone again for a new session.
 */
export class RealtimeSpeechInput {
  constructor({
    user,
    language = 'en',
    purpose = 'typing',
    requestToken,
    onPartial = () => {},
    onFinal = () => {},
    onState = () => {},
    onError = () => {},
    windowRef = defaultWindow(),
    maxDurationMs = 45000
  } = {}) {
    this.user = user;
    this.language = language === 'ur' ? 'ur' : 'en';
    this.purpose = purpose;
    this.requestToken = requestToken;
    this.onPartial = onPartial;
    this.onFinal = onFinal;
    this.onState = onState;
    this.onError = onError;
    this.window = windowRef;
    this.maxDurationMs = Math.max(5000, Math.min(60000, Number(maxDurationMs) || 45000));
    this.socket = null;
    this.stream = null;
    this.audioContext = null;
    this.source = null;
    this.captureNode = null;
    this.silentGain = null;
    this.workletUrl = '';
    this.pendingPcm = new Int16Array();
    this.finalSegments = [];
    this.partial = '';
    this.active = false;
    this.stopping = false;
    this.startedAt = 0;
    this.stopTimer = null;
    this.finalResolve = null;
    this.finalPromise = null;
    this.token = null;
    // Speechmatics accepts binary audio only after it has acknowledged the
    // StartRecognition message.  Waiting for this message prevents the first
    // browser frames from being discarded on a slower connection.
    this.recognitionReady = false;
    this.recognitionReadyPromise = null;
    this.recognitionReadyResolve = null;
    this.recognitionReadyReject = null;
    this.lastSequenceNumber = 0;
    this.sentAudioFrames = 0;
  }

  static supported(windowRef = defaultWindow()) {
    const media = windowRef?.navigator?.mediaDevices;
    const AudioContext = windowRef?.AudioContext || windowRef?.webkitAudioContext;
    const Socket = windowRef?.WebSocket;
    return Boolean(media?.getUserMedia && AudioContext && Socket);
  }

  transcript() {
    return joinText(this.finalSegments.join(' '), this.partial);
  }

  async start() {
    if (this.active) return this;
    if (!RealtimeSpeechInput.supported(this.window)) throw new Error('Live voice input is not available in this browser. You can type instead.');
    if (typeof this.requestToken !== 'function') throw new Error('Live voice input is not connected yet. You can type instead.');
    this.onState('requesting');
    try {
      // Request microphone access first. If it is declined, we never reserve a
      // provider session/token in the first place.
      this.stream = await this.window.navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      const token = await this.requestToken({ user: this.user, language: this.language, purpose: this.purpose });
      if (!token?.jwt || !token?.endpoint) throw new Error('Live voice input is not connected yet. You can type instead.');
      this.token = token;
      this.maxDurationMs = Math.max(5000, Math.min(60000, Number(token.maxDurationMs) || this.maxDurationMs));
      await this.openSocket(token);
      await this.connectAudio();
      this.active = true;
      this.startedAt = Date.now();
      this.stopTimer = this.window.setTimeout(() => { void this.stop(); }, this.maxDurationMs);
      this.onState('listening');
      return this;
    } catch (error) {
      this.cleanup();
      const message = this.friendlyError(error);
      this.onState('error');
      this.onError(message, error);
      throw error;
    }
  }

  async openSocket(token) {
    const Socket = this.window.WebSocket;
    const separator = String(token.endpoint).includes('?') ? '&' : '?';
    const url = String(token.endpoint) + separator + 'jwt=' + encodeURIComponent(String(token.jwt));
    const socket = new Socket(url);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    await new Promise((resolve, reject) => {
      let settled = false;
      const timeout = this.window.setTimeout(() => finish(new Error('Live voice input took too long to connect. You can type instead.')), 10000);
      const finish = (error) => {
        if (settled) return;
        settled = true;
        this.window.clearTimeout(timeout);
        socket.removeEventListener('open', opened);
        socket.removeEventListener('error', failed);
        if (error) reject(error); else resolve();
      };
      const opened = () => finish();
      const failed = () => finish(new Error('Live voice input could not connect. You can type instead.'));
      socket.addEventListener('open', opened, { once: true });
      socket.addEventListener('error', failed, { once: true });
    });
    socket.addEventListener('message', (event) => this.handleSocketMessage(event));
    socket.addEventListener('error', () => {
      if (!this.stopping) this.fail(new Error('Live voice input disconnected. Your editable words are still here.'));
    });
    socket.addEventListener('close', () => {
      if (!this.stopping && this.active) this.fail(new Error('Live voice input disconnected. Your editable words are still here.'));
    });
    this.recognitionReadyPromise = new Promise((resolve, reject) => {
      const timeout = this.window.setTimeout(() => {
        this.recognitionReadyResolve = null;
        this.recognitionReadyReject = null;
        reject(new Error('Live voice input did not start. You can type instead.'));
      }, 10000);
      this.recognitionReadyResolve = () => {
        this.window.clearTimeout(timeout);
        resolve();
      };
      this.recognitionReadyReject = (error) => {
        this.window.clearTimeout(timeout);
        reject(error);
      };
    });
    socket.send(JSON.stringify({
      message: 'StartRecognition',
      audio_format: { type: 'raw', encoding: 'pcm_s16le', sample_rate: TARGET_SAMPLE_RATE },
      transcription_config: {
        language: token.language === 'ur' ? 'ur' : this.language,
        model: token.model || 'enhanced',
        // The documented low safe delay keeps final words moving without
        // making the editable live transcript jump around per character.
        max_delay: 0.7,
        enable_partials: true
      }
    }));
    return this.recognitionReadyPromise;
  }

  async connectAudio() {
    const AudioContext = this.window.AudioContext || this.window.webkitAudioContext;
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.audioContext = context;
    if (context.state === 'suspended') await context.resume();
    this.source = context.createMediaStreamSource(this.stream);
    this.silentGain = context.createGain();
    this.silentGain.gain.value = 0;
    if (context.audioWorklet && this.window.AudioWorkletNode && this.window.URL?.createObjectURL) {
      const BlobClass = this.window.Blob || globalThis.Blob;
      const blob = new BlobClass([workletSource], { type: 'application/javascript' });
      this.workletUrl = this.window.URL.createObjectURL(blob);
      await context.audioWorklet.addModule(this.workletUrl);
      const node = new this.window.AudioWorkletNode(context, 'type2learn-realtime-pcm-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      node.port.onmessage = (event) => this.captureSamples(event.data);
      this.captureNode = node;
      this.source.connect(node);
      node.connect(this.silentGain);
      this.silentGain.connect(context.destination);
      return;
    }
    // ScriptProcessor is a compatibility fallback for browsers that offer
    // getUserMedia but not AudioWorklet. It remains live and uses identical
    // PCM framing, just with a less efficient capture callback.
    const node = context.createScriptProcessor(2048, 1, 1);
    node.onaudioprocess = (event) => this.captureSamples(new Float32Array(event.inputBuffer.getChannelData(0)));
    this.captureNode = node;
    this.source.connect(node);
    node.connect(this.silentGain);
    this.silentGain.connect(context.destination);
  }

  captureSamples(samples) {
    if (!this.active || this.stopping) return;
    const pcm = downsamplePcm16(samples instanceof Float32Array ? samples : new Float32Array(samples || []), this.audioContext?.sampleRate || TARGET_SAMPLE_RATE);
    if (!pcm.length) return;
    if ((this.socket?.bufferedAmount || 0) > MAX_SOCKET_BUFFER_BYTES) {
      this.onState('buffering');
      return;
    }
    if ((this.socket?.bufferedAmount || 0) <= RESUME_SOCKET_BUFFER_BYTES) this.pendingPcm = concatPcm(this.pendingPcm, pcm);
    this.flushFrames(false);
  }

  flushFrames(includeRemainder) {
    const socket = this.socket;
    if (!socket || socket.readyState !== this.window.WebSocket.OPEN) return;
    while (this.pendingPcm.length >= FRAME_SAMPLES || (includeRemainder && this.pendingPcm.length)) {
      const size = this.pendingPcm.length >= FRAME_SAMPLES ? FRAME_SAMPLES : this.pendingPcm.length;
      const frame = this.pendingPcm.slice(0, size);
      this.pendingPcm = this.pendingPcm.slice(size);
      if ((socket.bufferedAmount || 0) > MAX_SOCKET_BUFFER_BYTES) {
        this.pendingPcm = concatPcm(frame, this.pendingPcm);
        this.onState('buffering');
        return;
      }
      socket.send(frame.buffer);
      this.sentAudioFrames += 1;
    }
  }

  handleSocketMessage(event) {
    let payload;
    try { payload = typeof event.data === 'string' ? JSON.parse(event.data) : null; } catch (_) { return; }
    const kind = realtimeEventKind(payload);
    if (kind === 'RecognitionStarted') {
      this.recognitionReady = true;
      this.recognitionReadyResolve?.();
      this.recognitionReadyResolve = null;
      this.recognitionReadyReject = null;
      return;
    }
    if (kind === 'AudioAdded' && Number.isInteger(Number(payload?.seq_no))) {
      this.lastSequenceNumber = Math.max(this.lastSequenceNumber, Number(payload.seq_no));
      return;
    }
    const text = extractRealtimeTranscript(payload);
    if (kind === 'AddPartialTranscript' && text) {
      this.partial = text;
      this.onPartial(this.transcript(), { final: false, payload });
      return;
    }
    if (kind === 'AddTranscript' && text) {
      // Some endpoints repeat an already-final segment after a reconnect. Keep
      // a duplicate from appearing in the visible editable response while
      // never replacing content with an inferred phrase.
      if (this.finalSegments[this.finalSegments.length - 1] !== text) this.finalSegments.push(text);
      this.partial = '';
      this.onPartial(this.transcript(), { final: true, payload });
      return;
    }
    if (kind === 'EndOfTranscript') this.resolveFinal();
    if (kind === 'Error') this.fail(new Error('Live voice input could not understand that audio. You can type instead.'));
  }

  async stop() {
    if (this.stopping) return this.finalPromise || { transcript: this.transcript(), durationMs: 0 };
    this.stopping = true;
    this.active = false;
    this.window?.clearTimeout?.(this.stopTimer);
    this.stopTimer = null;
    this.flushFrames(true);
    this.disconnectAudio();
    const socket = this.socket;
    if (!socket || socket.readyState !== this.window.WebSocket.OPEN) {
      const result = { transcript: this.transcript(), durationMs: this.durationMs() };
      this.cleanup();
      return result;
    }
    this.onState('finishing');
    this.finalPromise = new Promise((resolve) => { this.finalResolve = resolve; });
    // AudioAdded acknowledgements are asynchronous. If a learner taps Finish
    // immediately after beginning, give the provider one short turn to
    // acknowledge the final PCM frame before referencing its sequence number.
    if (this.sentAudioFrames > 0 && this.lastSequenceNumber === 0) {
      await new Promise((resolve) => this.window.setTimeout(resolve, 180));
    }
    // `last_seq_no` is required by the realtime protocol.  Using the highest
    // server-acknowledged audio frame lets Speechmatics wait for the actual
    // final frame rather than finalising an empty stream.
    try { socket.send(JSON.stringify({ message: 'EndOfStream', last_seq_no: this.lastSequenceNumber })); } catch (_) { /* cleanup below */ }
    let finalWaitTimer = null;
    const result = await Promise.race([
      this.finalPromise,
      new Promise((resolve) => {
        finalWaitTimer = this.window.setTimeout(() => resolve({ transcript: this.transcript(), durationMs: this.durationMs() }), FINAL_WAIT_MS);
      })
    ]);
    if (finalWaitTimer) this.window.clearTimeout(finalWaitTimer);
    this.cleanup();
    return result;
  }

  resolveFinal() {
    const result = { transcript: this.transcript(), durationMs: this.durationMs() };
    this.onFinal(result.transcript, result);
    if (this.finalResolve) this.finalResolve(result);
  }

  durationMs() {
    return this.startedAt ? Math.max(0, Date.now() - this.startedAt) : 0;
  }

  fail(error) {
    if (this.stopping) return;
    this.stopping = true;
    this.active = false;
    this.disconnectAudio();
    this.recognitionReadyReject?.(error);
    this.recognitionReadyResolve = null;
    this.recognitionReadyReject = null;
    const message = this.friendlyError(error);
    this.onState('error');
    this.onError(message, error);
    this.cleanup();
  }

  friendlyError(error) {
    const name = String(error?.name || '');
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'Allow microphone access for this site, or type your response instead.';
    return String(error?.message || 'Live voice input could not continue. Your editable words are still here.');
  }

  disconnectAudio() {
    try { this.captureNode?.disconnect?.(); } catch (_) { /* best effort */ }
    try { this.source?.disconnect?.(); } catch (_) { /* best effort */ }
    try { this.silentGain?.disconnect?.(); } catch (_) { /* best effort */ }
    this.stream?.getTracks?.().forEach((track) => track.stop());
    this.captureNode = null;
    this.source = null;
    this.silentGain = null;
    this.stream = null;
    if (this.audioContext) {
      void this.audioContext.close?.().catch?.(() => {});
      this.audioContext = null;
    }
    if (this.workletUrl) {
      try { this.window?.URL?.revokeObjectURL?.(this.workletUrl); } catch (_) { /* best effort */ }
      this.workletUrl = '';
    }
  }

  cleanup() {
    this.window?.clearTimeout?.(this.stopTimer);
    this.stopTimer = null;
    this.disconnectAudio();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < this.window.WebSocket.CLOSING) {
      try { socket.close(); } catch (_) { /* best effort */ }
    }
    this.pendingPcm = new Int16Array();
    this.recognitionReady = false;
    this.recognitionReadyPromise = null;
    this.recognitionReadyResolve = null;
    this.recognitionReadyReject = null;
    this.lastSequenceNumber = 0;
    this.sentAudioFrames = 0;
    this.active = false;
  }
}
