import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('typing voice UI keeps one external Speak control and an in-field pause/resume control', async () => {
  const source = await readFile(new URL('../../course/course.js', import.meta.url), 'utf8');
  assert.match(source, /field\.insertAdjacentElement\('beforebegin', controls\)/);
  assert.match(source, /data-action="toggle-voice-input-pause"/);
  assert.doesNotMatch(source, /data-action="stop-voice-input"[^]*typing-mic-stop/);
  assert.match(source, /voiceIsActive = voiceInput\.listening/);
});

test('typing selects browser live recognition before batch Speechmatics transcription', async () => {
  const source = await readFile(new URL('../../course/course.js', import.meta.url), 'utf8');
  const browserFirst = source.indexOf('if (voiceRecognitionConstructor())', source.indexOf('const startVoiceInput'));
  const speechmaticsSecond = source.indexOf('if (await speechmaticsTypingIsReady())', source.indexOf('const startVoiceInput'));
  assert.ok(browserFirst >= 0 && speechmaticsSecond > browserFirst);
});

test('Speechmatics compatibility recording has a visible Finish control instead of making learners wait for a timeout', async () => {
  const source = await readFile(new URL('../../course/course.js', import.meta.url), 'utf8');
  assert.match(source, /recordingForSpeechmatics/);
  assert.match(source, /Finish speaking and add text/);
  assert.match(source, /Select Finish when you are done speaking to add your text/);
  assert.match(source, /stopSpeechmaticsTypingInput\(\);[\s\S]*Finishing your recording/);
});
