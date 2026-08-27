import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpeechService, isSupportedTtsContentType, normaliseAudioMimeType, upstreamSpeechFailure, validateCourseAudio } from '../../server/speech-service.mjs';

test('accepts a MediaRecorder WebM MIME type with its Opus codec parameter', () => {
  const form = new FormData();
  form.append('purpose', 'typing');
  form.append('language', 'en');
  form.append('durationMs', '3000');
  form.append('audio', new Blob(['short recording'], { type: 'audio/webm;codecs=opus' }), 'voice.webm');
  const accepted = validateCourseAudio(form);
  assert.equal(normaliseAudioMimeType(accepted.audio.type), 'audio/webm');
  assert.equal(accepted.durationMs, 3000);
});

test('turns provider quota and billing responses into a clear, non-looping learner message', () => {
  for (const status of [402, 403, 429]) {
    const error = upstreamSpeechFailure({ status }, 'unavailable');
    assert.equal(error.status, 503);
    assert.equal(error.code, 'SPEECH_PROVIDER_LIMIT');
    assert.match(error.message, /provider limit has been reached/);
  }
});

test('keeps non-quota upstream failures distinct from provider limits', () => {
  const error = upstreamSpeechFailure({ status: 500 }, 'Voice input could not continue.');
  assert.equal(error.status, 502);
  assert.equal(error.code, 'SPEECH_UPSTREAM_ERROR');
  assert.equal(error.message, 'Voice input could not continue.');
});

test('accepts only browser-playable provider audio content types', () => {
  assert.equal(isSupportedTtsContentType('audio/wav'), true);
  assert.equal(isSupportedTtsContentType('audio/wav; charset=binary'), true);
  assert.equal(isSupportedTtsContentType('audio/mpeg'), true);
  assert.equal(isSupportedTtsContentType('application/json'), false);
  assert.equal(isSupportedTtsContentType('text/plain'), false);
});

test('TTS rejects a malformed provider success body before the browser receives a silent clip', async () => {
  const originalFetch = globalThis.fetch;
  const config = {
    speechmaticsApiKey: 'provider-key-for-test',
    allowGuestAi: true,
    speechmaticsCreditsPerMinute: 1,
    speechmaticsMonthlyCreditCap: 20,
    speechmaticsUserCreditCap: 5,
    speechmaticsRequestsPerMinute: 5
  };
  const firebase = { available: true, verifyBearer: async () => ({ uid: 'learner' }) };
  const service = createSpeechService({ config, firebase, ledger: {} });
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'not audio' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
    await assert.rejects(
      () => service.synthesise({ body: { text: 'A visible reply.', language: 'en' }, localGuest: { uid: 'guest-1', isGuest: true } }),
      (error) => error?.code === 'AI_AUDIO_UPSTREAM_ERROR'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('TTS returns a valid configured-provider WAV clip without switching to a browser voice', async () => {
  const originalFetch = globalThis.fetch;
  const config = {
    speechmaticsApiKey: 'provider-key-for-test',
    allowGuestAi: true,
    speechmaticsCreditsPerMinute: 1,
    speechmaticsMonthlyCreditCap: 20,
    speechmaticsUserCreditCap: 5,
    speechmaticsRequestsPerMinute: 5
  };
  const firebase = { available: true, verifyBearer: async () => ({ uid: 'learner' }) };
  const service = createSpeechService({ config, firebase, ledger: {} });
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(32)]);
  try {
    globalThis.fetch = async (url, options) => {
      assert.match(String(url), /preview\.tts\.speechmatics\.com\/generate\/sarah/);
      assert.equal(options.headers.Authorization, 'Bearer provider-key-for-test');
      assert.deepEqual(JSON.parse(options.body), { text: 'A visible reply.' });
      return new Response(wav, { status: 200, headers: { 'content-type': 'audio/wav' } });
    };
    const result = await service.synthesise({ body: { text: 'A visible reply.', language: 'en' }, localGuest: { uid: 'guest-1', isGuest: true } });
    assert.equal(result.contentType, 'audio/wav');
    assert.deepEqual(result.audio, wav);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
