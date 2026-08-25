import { createHash } from 'node:crypto';
import { apiError } from './errors.mjs';
import { speechUsageCaps } from './usage-ledger.mjs';

const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const MAX_AUDIO_MILLISECONDS = 45 * 1000;
const MAX_TRANSCRIPT_CHARACTERS = 2400;
const MAX_TTS_CHARACTERS = 1200;
const TTS_VOICE_ID = 'sarah';
const supportedTypes = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav']);
const identifierHash = (value) => createHash('sha256').update(String(value)).digest('hex');
const bounded = (value, maximum) => String(value || '').replace(/\u0000/g, '').trim().slice(0, maximum);
const jobIdFrom = (payload) => payload?.id || payload?.job?.id || payload?.jobs?.[0]?.id || '';
const jobStatusFrom = (payload) => String(payload?.status || payload?.job?.status || payload?.jobs?.[0]?.status || '').toLowerCase();
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// Provider quota and billing responses should be clear to the learner without
// exposing provider payloads, account data, or implementation details.
export const upstreamSpeechFailure = (response, fallback) => {
  if ([402, 403, 429].includes(Number(response?.status))) {
    return apiError(503, 'SPEECH_PROVIDER_LIMIT', 'Voice transcription is temporarily unavailable because its provider limit has been reached. You can type your response instead.');
  }
  return apiError(502, 'SPEECH_UPSTREAM_ERROR', fallback);
};

// MediaRecorder correctly reports its codec with the MIME type (for example
// `audio/webm;codecs=opus`).  The codec parameter is not a different file
// format, so compare the media type itself rather than rejecting it.
export const normaliseAudioMimeType = (value) => String(value || '').toLowerCase().split(';', 1)[0].trim();

export const validateCourseAudio = (form) => {
  const audio = form.get('audio');
  const purpose = String(form.get('purpose') || '');
  const language = form.get('language') === 'ur' ? 'ur' : 'en';
  const durationMs = Number(form.get('durationMs'));
  if (!['chat', 'typing'].includes(purpose)) throw apiError(400, 'INVALID_SPEECH_PURPOSE', 'Voice input is only available for chat or an eligible typing activity.');
  if (!audio || typeof audio.arrayBuffer !== 'function' || !supportedTypes.has(normaliseAudioMimeType(audio.type)) || Number(audio.size) > MAX_AUDIO_BYTES) {
    throw apiError(400, 'INVALID_AUDIO', 'Use a short WebM, Ogg, MP4, MP3, or WAV recording under 6 MB.');
  }
  if (!Number.isFinite(durationMs) || durationMs < 300 || durationMs > MAX_AUDIO_MILLISECONDS) {
    throw apiError(400, 'INVALID_AUDIO_DURATION', 'Keep each voice recording under 45 seconds.');
  }
  return { audio, purpose, language, durationMs };
};

export const createSpeechService = ({ config, firebase, ledger }) => {
  const available = () => Boolean(config.speechmaticsApiKey && firebase.available && ledger);
  // Read-aloud has no learner-uploaded audio and only accepts a bounded piece
  // of already-visible course text. It can therefore remain available to the
  // explicit public guest course when AI_ALLOW_GUESTS is enabled, while STT
  // and every stored learner feature remain Firebase-authenticated.
  const ttsAvailable = () => Boolean(config.speechmaticsApiKey && (firebase.available || config.allowGuestAi));
  const guestTtsAvailable = () => Boolean(config.allowGuestAi && config.speechmaticsApiKey);
  const ttsCache = new Map();
  const ttsRecentRequests = new Map();
  const status = () => ({
    available: available(),
    requiresSignIn: true,
    purposes: ['chat', 'typing'],
    textToSpeech: {
      available: ttsAvailable(), language: 'en', voice: TTS_VOICE_ID,
      guestAccess: guestTtsAvailable(), requiresSignIn: !guestTtsAvailable()
    }
  });

  const pruneTtsCache = (now) => {
    for (const [key, item] of ttsCache.entries()) if (item.expiresAt <= now) ttsCache.delete(key);
    while (ttsCache.size > 80) ttsCache.delete(ttsCache.keys().next().value);
  };

  const checkTtsRate = (userHash, now) => {
    const recent = (ttsRecentRequests.get(userHash) || []).filter((time) => time > now - 60000);
    if (recent.length >= 6) throw apiError(429, 'AI_AUDIO_RATE_LIMITED', 'Please wait a moment before listening to another AI reply.');
    recent.push(now);
    ttsRecentRequests.set(userHash, recent);
  };

  const synthesise = async ({ authorization, body, localGuest = null, clientAddress = '' }) => {
    if (!config.speechmaticsApiKey || (!firebase.available && !localGuest)) throw apiError(503, 'AI_AUDIO_NOT_CONFIGURED', 'Audio for AI replies is not connected yet.');
    if (body?.language !== 'en') throw apiError(400, 'AI_AUDIO_LANGUAGE_UNSUPPORTED', 'Audio for AI replies is currently available in English only.');
    const text = bounded(body?.text, MAX_TTS_CHARACTERS);
    if (!text) throw apiError(400, 'EMPTY_AI_AUDIO', 'There is no AI reply to read aloud.');
    if (localGuest && !config.allowGuestAi) throw apiError(401, 'SIGN_IN_REQUIRED', 'Please sign in to listen to this reply.');
    const learner = localGuest ? null : await firebase.verifyBearer(authorization);
    const now = Date.now();
    // A guest gets a small per-address rate bucket. This is only a safety
    // limit for public narrated text; no address is stored in Firestore.
    const userHash = identifierHash(learner?.uid || ('guest-tts:' + String(clientAddress || 'anonymous')));
    checkTtsRate(userHash, now);
    const key = createHash('sha256').update(TTS_VOICE_ID + '\n' + text).digest('hex');
    pruneTtsCache(now);
    const cached = ttsCache.get(key);
    if (cached) return cached;
    let response;
    try {
      response = await fetch(`https://preview.tts.speechmatics.com/generate/${TTS_VOICE_ID}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.speechmaticsApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(30000)
      });
    } catch {
      throw apiError(502, 'AI_AUDIO_UPSTREAM_ERROR', 'Audio for this AI reply could not start.');
    }
    if (!response.ok) throw upstreamSpeechFailure(response, 'Audio for this AI reply could not be created.');
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length || audio.length > 3 * 1024 * 1024) throw apiError(502, 'AI_AUDIO_UPSTREAM_ERROR', 'Audio for this AI reply could not be created.');
    const result = { audio, contentType: response.headers.get('content-type') || 'audio/wav' };
    ttsCache.set(key, { ...result, expiresAt: now + 15 * 60 * 1000 });
    return result;
  };

  const transcribe = async ({ authorization, form }) => {
    if (!config.speechmaticsApiKey) throw apiError(503, 'SPEECH_NOT_CONFIGURED', 'Voice input is not connected yet. You can type instead.');
    if (!firebase.available || !ledger) throw apiError(503, 'SPEECH_USAGE_PROTECTION_UNAVAILABLE', 'Voice input is being set up safely. You can type instead.');
    const learner = await firebase.verifyBearer(authorization);
    const { audio, language, durationMs } = validateCourseAudio(form);
    const estimatedCredits = Math.ceil((durationMs / 60000) * config.speechmaticsCreditsPerMinute * 100) / 100;
    let reservation;
    try {
      reservation = await ledger.reserve({
        kind: 'speechmatics',
        userHash: identifierHash(learner.uid),
        usage: { usd: 0, inputTokens: 0, outputTokens: 0, credits: estimatedCredits },
        caps: speechUsageCaps(config),
        requestsPerMinute: config.speechmaticsRequestsPerMinute
      });
    } catch (error) {
      if (String(error?.code || '').includes('PERMISSION_DENIED') || /Firestore API/i.test(String(error?.message || ''))) {
        throw apiError(503, 'SPEECH_USAGE_PROTECTION_UNAVAILABLE', 'Voice input is being set up safely. You can type instead.');
      }
      throw error;
    }
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
      if (!created.ok) throw upstreamSpeechFailure(created, 'Voice input could not start. You can type instead.');
      jobId = jobIdFrom(createdBody);
      if (!jobId) throw apiError(502, 'SPEECH_JOB_ERROR', 'Voice input did not return a transcription job.');

      let complete = false;
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await wait(800);
        const statusResponse = await fetch(`https://asr.api.speechmatics.com/v2/jobs/${encodeURIComponent(jobId)}`, {
          headers: { Authorization: `Bearer ${config.speechmaticsApiKey}` },
          signal: AbortSignal.timeout(10000)
        });
        if (!statusResponse.ok) throw upstreamSpeechFailure(statusResponse, 'Voice input could not continue. You can type instead.');
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
      if (!transcriptResponse.ok) throw upstreamSpeechFailure(transcriptResponse, 'Voice input could not return text for that recording.');
      if (!transcript) throw apiError(502, 'SPEECH_TRANSCRIPT_ERROR', 'Voice input could not return text for that recording.');
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

  return { status, transcribe, synthesise };
};
