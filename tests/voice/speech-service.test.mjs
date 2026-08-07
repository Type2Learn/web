import assert from 'node:assert/strict';
import test from 'node:test';
import { normaliseAudioMimeType, validateCourseAudio } from '../../server/speech-service.mjs';

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
