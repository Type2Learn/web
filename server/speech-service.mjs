import { createHash } from 'node:crypto';
import { apiError } from './errors.mjs';
import { speechUsageCaps } from './usage-ledger.mjs';

const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const MAX_AUDIO_MILLISECONDS = 45 * 1000;
const MAX_TRANSCRIPT_CHARACTERS = 2400;
const supportedTypes = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav']);
const identifierHash = (value) => createHash('sha256').update(String(value)).digest('hex');
const bounded = (value, maximum) => String(value || '').replace(/\u0000/g, '').trim().slice(0, maximum);
const jobIdFrom = (payload) => payload?.id || payload?.job?.id || payload?.jobs?.[0]?.id || '';
const jobStatusFrom = (payload) => String(payload?.status || payload?.job?.status || payload?.jobs?.[0]?.status || '').toLowerCase();
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const validateAudio = (form) => {
  const audio = form.get('audio');
  const purpose = String(form.get('purpose') || '');
  const language = form.get('language') === 'ur' ? 'ur' : 'en';
  const durationMs = Number(form.get('durationMs'));
  if (!['chat', 'typing'].includes(purpose)) throw apiError(400, 'INVALID_SPEECH_PURPOSE', 'Voice input is only available for chat or an eligible typing activity.');
  if (!audio || typeof audio.arrayBuffer !== 'function' || !supportedTypes.has(String(audio.type || '').toLowerCase()) || Number(audio.size) > MAX_AUDIO_BYTES) {
    throw apiError(400, 'INVALID_AUDIO', 'Use a short WebM, Ogg, MP4, MP3, or WAV recording under 6 MB.');
  }
  if (!Number.isFinite(durationMs) || durationMs < 300 || durationMs > MAX_AUDIO_MILLISECONDS) {
    throw apiError(400, 'INVALID_AUDIO_DURATION', 'Keep each voice recording under 45 seconds.');
  }
  return { audio, purpose, language, durationMs };
};

export const createSpeechService = ({ config, firebase, ledger }) => {
  const available = () => Boolean(config.speechmaticsApiKey && firebase.available && ledger);
  const status = () => ({ available: available(), requiresSignIn: true, purposes: ['chat', 'typing'] });

  const transcribe = async ({ authorization, form }) => {
    if (!config.speechmaticsApiKey) throw apiError(503, 'SPEECH_NOT_CONFIGURED', 'Voice input is not connected yet. You can type instead.');
    if (!firebase.available || !ledger) throw apiError(503, 'SPEECH_USAGE_PROTECTION_UNAVAILABLE', 'Voice input is being set up safely. You can type instead.');
    const learner = await firebase.verifyBearer(authorization);
    const { audio, language, durationMs } = validateAudio(form);
    const estimatedCredits = Math.ceil((durationMs / 60000) * config.speechmaticsCreditsPerMinute * 100) / 100;
    const reservation = await ledger.reserve({
      kind: 'speechmatics',
      userHash: identifierHash(learner.uid),
      usage: { usd: 0, inputTokens: 0, outputTokens: 0, credits: estimatedCredits },
      caps: speechUsageCaps(config),
      requestsPerMinute: config.speechmaticsRequestsPerMinute
    });
    let jobId = '';
    let settled = false;
    try {
      const requestForm = new FormData();
      requestForm.append('config', JSON.stringify({
        type: 'transcription',
        transcription_config: { language, operating_point: 'enhanced' }
      }));
      requestForm.append('data_file', audio, 'type2learn-voice.webm');
      let created;
      try {
        created = await fetch('https://asr.api.speechmatics.com/v2/jobs/', {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.speechmaticsApiKey}` },
          body: requestForm,
          signal: AbortSignal.timeout(30000)
        });
      } catch {
        throw apiError(502, 'SPEECH_UPSTREAM_ERROR', 'Voice input could not start. You can type instead.');
      }
      const createdBody = await created.json().catch(() => ({}));
      if (!created.ok) throw apiError(502, 'SPEECH_UPSTREAM_ERROR', 'Voice input could not start. You can type instead.');
      jobId = jobIdFrom(createdBody);
      if (!jobId) throw apiError(502, 'SPEECH_JOB_ERROR', 'Voice input did not return a transcription job.');

      let complete = false;
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await wait(800);
        const statusResponse = await fetch(`https://asr.api.speechmatics.com/v2/jobs/${encodeURIComponent(jobId)}`, {
          headers: { Authorization: `Bearer ${config.speechmaticsApiKey}` },
          signal: AbortSignal.timeout(10000)
        });
        const status = jobStatusFrom(await statusResponse.json().catch(() => ({})));
        if (status === 'done' || status === 'completed') { complete = true; break; }
        if (['rejected', 'failed', 'error'].includes(status)) throw apiError(502, 'SPEECH_JOB_ERROR', 'Voice input could not understand that recording. Try a shorter recording or type instead.');
      }
      if (!complete) throw apiError(504, 'SPEECH_TIMEOUT', 'Voice input took too long. Try a shorter recording or type instead.');
      const transcriptResponse = await fetch(`https://asr.api.speechmatics.com/v2/jobs/${encodeURIComponent(jobId)}/transcript?format=txt`, {
        headers: { Authorization: `Bearer ${config.speechmaticsApiKey}` },
        signal: AbortSignal.timeout(15000)
      });
      const transcript = bounded(await transcriptResponse.text().catch(() => ''), MAX_TRANSCRIPT_CHARACTERS);
      if (!transcriptResponse.ok || !transcript) throw apiError(502, 'SPEECH_TRANSCRIPT_ERROR', 'Voice input could not return text for that recording.');
      await ledger.settle({ ...reservation, actual: { usd: 0, inputTokens: 0, outputTokens: 0, credits: estimatedCredits } });
      settled = true;
      return { transcript };
    } finally {
      if (jobId) {
        await fetch(`https://asr.api.speechmatics.com/v2/jobs/${encodeURIComponent(jobId)}?force=true`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${config.speechmaticsApiKey}` },
          signal: AbortSignal.timeout(10000)
        }).catch(() => {});
      }
      if (!settled) await ledger.release({ ...reservation, tolerateMissing: true }).catch(() => {});
    }
  };

  return { status, transcribe };
};
