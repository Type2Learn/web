import assert from 'node:assert/strict';
import test from 'node:test';
import { RealtimeSpeechInput, concatPcm, downsamplePcm16, extractRealtimeTranscript, realtimeEventKind } from '../../course/live-speech.js';

test('Speechmatics realtime token events retain provider words and punctuation without inventing text', () => {
  const payload = {
    message: 'AddPartialTranscript',
    results: [
      { alternatives: [{ content: 'ADHD' }] },
      { alternatives: [{ content: 'can' }] },
      { alternatives: [{ content: 'affect' }] },
      { alternatives: [{ content: 'learning' }] },
      { alternatives: [{ content: '.' }] }
    ]
  };
  assert.equal(realtimeEventKind(payload), 'AddPartialTranscript');
  assert.equal(extractRealtimeTranscript(payload), 'ADHD can affect learning.');
  assert.equal(extractRealtimeTranscript({ transcript: '  only supplied words  ' }), 'only supplied words');
  assert.equal(extractRealtimeTranscript({ results: [] }), '');
});

test('PCM conversion is bounded and deterministic for realtime microphone frames', () => {
  const source = new Float32Array([-1, -0.5, 0, 0.5, 1, 2, -2]);
  const pcm = downsamplePcm16(source, 16000, 16000);
  assert.deepEqual([...pcm], [-32768, -16384, 0, 16384, 32767, 32767, -32768]);
  const reduced = downsamplePcm16(new Float32Array([0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25]), 8000, 4000);
  assert.deepEqual([...reduced], [0, 16384, 32767, 16384]);
  assert.deepEqual([...concatPcm(new Int16Array([1, 2]), new Int16Array([3]))], [1, 2, 3]);
});

test('live realtime capability requires microphone, AudioContext, and WebSocket rather than browser recognition', () => {
  assert.equal(RealtimeSpeechInput.supported({
    navigator: { mediaDevices: { getUserMedia() {} } },
    AudioContext() {},
    WebSocket() {}
  }), true);
  assert.equal(RealtimeSpeechInput.supported({
    navigator: { mediaDevices: { getUserMedia() {} } },
    AudioContext() {}
  }), false);
});

test('realtime transport emits partial words immediately, then returns final words only after Finish', async () => {
  const sockets = [];
  class FakeSocket {
    static OPEN = 1;
    static CLOSING = 2;
    constructor(url) {
      this.url = url;
      this.readyState = FakeSocket.OPEN;
      this.bufferedAmount = 0;
      this.listeners = new Map();
      this.sent = [];
      sockets.push(this);
      queueMicrotask(() => this.emit('open', {}));
    }
    addEventListener(kind, listener) { this.listeners.set(kind, listener); }
    removeEventListener(kind) { this.listeners.delete(kind); }
    emit(kind, event) { this.listeners.get(kind)?.(event); }
    send(value) {
      this.sent.push(value);
      if (typeof value === 'string' && JSON.parse(value).message === 'StartRecognition') {
        queueMicrotask(() => this.emit('message', { data: JSON.stringify({ message: 'RecognitionStarted' }) }));
      }
      if (value instanceof ArrayBuffer) {
        queueMicrotask(() => this.emit('message', { data: JSON.stringify({ message: 'AudioAdded', seq_no: 1 }) }));
      }
    }
    close() { this.readyState = 3; this.emit('close', {}); }
  }
  const stream = { getTracks: () => [{ stop() {} }] };
  let scriptProcessor;
  class FakeAudioContext {
    constructor() { this.sampleRate = 16000; this.state = 'running'; this.destination = {}; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    createScriptProcessor() { scriptProcessor = { connect() {}, disconnect() {}, onaudioprocess: null }; return scriptProcessor; }
    close() { return Promise.resolve(); }
  }
  const fakeWindow = {
    navigator: { mediaDevices: { getUserMedia: async () => stream } },
    AudioContext: FakeAudioContext,
    WebSocket: FakeSocket,
    setTimeout,
    clearTimeout,
    URL: { createObjectURL() { return 'blob:unused'; }, revokeObjectURL() {} }
  };
  const partials = [];
  const finals = [];
  const client = new RealtimeSpeechInput({
    user: { uid: 'learner' },
    windowRef: fakeWindow,
    requestToken: async () => ({ jwt: 'temporary', endpoint: 'wss://global.rt.speechmatics.com/v2/', language: 'en', maxDurationMs: 45000 }),
    onPartial: (text) => partials.push(text),
    onFinal: (text) => finals.push(text)
  });
  await client.start();
  assert.match(sockets[0].url, /\?jwt=temporary$/);
  assert.equal(JSON.parse(sockets[0].sent[0]).message, 'StartRecognition');
  scriptProcessor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(400).fill(0.25) } });
  assert.ok(sockets[0].sent.some((entry) => entry instanceof ArrayBuffer));
  sockets[0].emit('message', { data: JSON.stringify({ message: 'AddPartialTranscript', results: [{ alternatives: [{ content: 'one' }] }] }) });
  assert.deepEqual(partials, ['one']);
  const stopping = client.stop();
  sockets[0].emit('message', { data: JSON.stringify({ message: 'AddTranscript', results: [{ alternatives: [{ content: 'one clear step' }] }] }) });
  sockets[0].emit('message', { data: JSON.stringify({ message: 'EndOfTranscript' }) });
  const result = await stopping;
  assert.equal(result.transcript, 'one clear step');
  assert.deepEqual(finals, ['one clear step']);
  assert.equal(JSON.parse(sockets[0].sent.at(-1)).message, 'EndOfStream');
  assert.equal(JSON.parse(sockets[0].sent.at(-1)).last_seq_no, 1);
});
