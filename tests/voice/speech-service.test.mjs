import assert from 'node:assert/strict';
import test from 'node:test';
import { normaliseAudioMimeType, upstreamSpeechFailure, validateCourseAudio } from '../../server/speech-service.mjs';

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
