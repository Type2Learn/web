/*
 * Rebuild the recorded Urdu counterparts for the non-typing course narration.
 *
 * The English Ava recordings remain untouched.  This uses Microsoft's
 * dedicated Pakistani Urdu neural voice rather than trying to pronounce Urdu
 * through an Arabic or Hindi voice.  Run with:
 *   node scripts/generate-urdu-ava-narration.mjs --write
 *
 * Audio is written to a new `urdu-pk` directory so the earlier recordings are
 * retained as a reversible fallback until a human listening review is done.
 */
import { mkdir, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { COURSE_URDU } from '../course/course-urdu.js';
import { COURSE_AUDIO_MODULE_KEYS } from '../course/course-audio-manifest.js';

const WRITE = process.argv.includes('--write');
const VOICE = 'ur-PK-UzmaNeural';
const ROOT = path.resolve('course/audio/edge-ava/neurodivergent');
const fields = [
  ['title-ava.mp3', (step) => step.title],
  ['section-1-heading-ava.mp3', (step) => step.content?.definitionHeading],
  ['section-1-answer-ava.mp3', (step) => step.content?.definition],
  ['section-2-heading-ava.mp3', (step) => step.content?.dailyLifeHeading],
  ['section-2-answer-ava.mp3', (step) => step.content?.dailyLife],
  ['section-3-heading-ava.mp3', (step) => step.content?.strengthsHeading],
  ['section-3-answer-ava.mp3', (step) => step.content?.strengths],
  ['section-4-heading-ava.mp3', (step) => step.content?.challengesHeading],
  ['section-4-answer-ava.mp3', (step) => step.content?.challenges],
  ['section-5-heading-ava.mp3', (step) => step.content?.supportsHeading],
  ['section-5-answer-ava.mp3', (step) => step.content?.supports]
];

const narrationText = (value) => (Array.isArray(value) ? value.join('؛ ') : String(value || ''))
  .replace(/\s+/g, ' ')
  .trim();

const exists = async (file) => access(file, fsConstants.F_OK).then(() => true).catch(() => false);
const makeTrack = (text, output) => new Promise((resolve, reject) => {
  const process = spawn('edge-tts', ['--voice', VOICE, '--text', text, '--write-media', output], { stdio: 'inherit' });
  process.once('error', reject);
  process.once('exit', (code) => code === 0 ? resolve() : reject(new Error('edge-tts exited with code ' + code + ' for ' + output)));
});

const jobs = COURSE_AUDIO_MODULE_KEYS.flatMap((key, index) => fields.map(([filename, getText]) => ({
  output: path.join(ROOT, key, 'urdu-pk', filename),
  text: narrationText(getText(COURSE_URDU.steps[index]))
})));

if (COURSE_AUDIO_MODULE_KEYS.length !== COURSE_URDU.steps.length) throw new Error('Course module keys and Urdu course steps do not match.');
if (!WRITE) {
  console.log('Dry run: ' + jobs.length + ' Urdu tracks would be generated with ' + VOICE + '. Re-run with --write.');
  process.exit(0);
}

for (let index = 0; index < jobs.length; index += 1) {
  const job = jobs[index];
  if (!job.text) throw new Error('Missing Urdu narration text for ' + job.output);
  await mkdir(path.dirname(job.output), { recursive: true });
  if (await exists(job.output)) {
    console.log('[' + (index + 1) + '/' + jobs.length + '] kept ' + path.relative(ROOT, job.output));
    continue;
  }
  console.log('[' + (index + 1) + '/' + jobs.length + '] generating ' + path.relative(ROOT, job.output));
  await makeTrack(job.text, job.output);
}

console.log('Generated ' + jobs.length + ' Pakistani Urdu narration tracks with ' + VOICE + '.');
