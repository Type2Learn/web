import { COURSE_AUDIO_CUES } from './course-audio-cues.js';

// Local Microsoft Edge Ava narration assets for the eleven course modules.
// The course content does not store audio keys, so callers use the module's
// zero-based position with COURSE_AUDIO_MODULE_KEYS. The versioned MP3s and
// their WordBoundary cues are generated together, so playback and visible
// word progress use one shared audio timeline.
export const COURSE_AUDIO_MODULE_KEYS = [
  '01-adhd',
  '02-dyslexia',
  '03-autism-spectrum-disorder',
  '04-dysgraphia',
  '05-dyspraxia-developmental-coordination-disorder',
  '06-dyscalculia',
  '07-auditory-processing-disorder',
  '08-visual-impairment-low-vision',
  '09-intellectual-developmental-disabilities',
  '10-physical-motor-disabilities',
  '11-sensory-processing-sensitivities'
];

const moduleAssets = (key) => {
  const cues = COURSE_AUDIO_CUES[key] || {};
  const root = '/assets/audio/edge-ava/neurodivergent/' + key + '/';
  return {
    read: root + 'read-ava-timed.mp3',
    simpleAddon: root + 'simple-addon-ava-timed.mp3',
    readCues: Array.isArray(cues.read) ? cues.read : [],
    simpleAddonCues: Array.isArray(cues.simpleAddon) ? cues.simpleAddon : []
  };
};

export const COURSE_AUDIO_MANIFEST = {
  version: '1.1',
  courseId: 'course-1-neurodivergent-conditions-v2',
  courseVersion: '1.1',
  voice: 'en-US-AvaMultilingualNeural',
  model: 'Microsoft Edge online neural TTS via edge-tts',
  disclosure: 'Narration uses an AI-generated voice.',
  timing: 'Exact WordBoundary cues from the same Ava generation request as each MP3.',
  modules: Object.fromEntries(COURSE_AUDIO_MODULE_KEYS.map((key) => [key, moduleAssets(key)]))
};

