const apiBase = () => {
  const override = String(window.TYPE2LEARN_AI_API_URL || '').trim();
  if (override) return override.replace(/\/$/, '');
  const configured = document.querySelector('meta[name="type2learn-ai-api"]')?.getAttribute('content')?.trim();
  return (configured || window.location.origin).replace(/\/$/, '');
};

export class CourseAiError extends Error {
  constructor(message, code = 'AI_REQUEST_FAILED') {
    super(message);
    this.name = 'CourseAiError';
    this.code = code;
  }
}

const readJson = async (response) => response.json().catch(() => ({}));

const requireToken = async (user) => {
  if (!user || user.isGuest || typeof user.getIdToken !== 'function') {
    throw new CourseAiError('Please sign in to use the AI helper. You can still use the course support on this page.', 'SIGN_IN_REQUIRED');
  }
  return user.getIdToken();
};

const request = async (path, options = {}) => {
  let response;
  try {
    response = await fetch(apiBase() + path, { ...options, cache: 'no-store' });
  } catch {
    throw new CourseAiError('The AI helper is not connected right now. You can still use the course support on this page.', 'AI_OFFLINE');
  }
  const payload = await readJson(response);
  if (!response.ok) throw new CourseAiError(payload?.error?.message || 'The AI helper could not continue.', payload?.error?.code || 'AI_REQUEST_FAILED');
  return payload;
};

const authenticatedRequest = async (user, path, options = {}) => {
  const token = await requireToken(user);
  return request(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
};

export const getCourseAiStatus = () => request('/api/v1/health');

export const askCourseAi = async ({ user, message, history, courseId, page, language, signal }) => {
  return authenticatedRequest(user, '/api/v1/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, courseId, page, language }),
    signal
  });
};

// Adaptive recall is intentionally a distinct, structured endpoint instead
// of an unrestricted chat call. The browser sends only the learner's current
// attempt and current page identity; provider keys and model selection remain
// server-only.
export const requestAdaptiveRecall = async ({ user, courseId, page, language, response, previousResponse, barrier, signal }) => {
  return authenticatedRequest(user, '/api/v1/adaptive-recall', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId, page, language, response, previousResponse, barrier }),
    signal
  });
};

export const transcribeCourseAudio = async ({ user, audio, durationMs, language, purpose, signal }) => {
  const form = new FormData();
  form.append('audio', audio, 'type2learn-voice.webm');
  form.append('durationMs', String(Math.round(durationMs)));
  form.append('language', language === 'ur' ? 'ur' : 'en');
  form.append('purpose', purpose);
  return authenticatedRequest(user, '/api/v1/speech/transcribe', { method: 'POST', body: form, signal });
};

export const loadCourseProgress = async ({ user, courseId, signal }) => {
  const encodedCourseId = encodeURIComponent(courseId);
  return authenticatedRequest(user, '/api/v1/course-progress?courseId=' + encodedCourseId, { signal });
};

export const saveCourseProgress = async ({ user, snapshot, signal }) => authenticatedRequest(user, '/api/v1/course-progress', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(snapshot),
  signal
});

export const synthesiseCourseAiReply = async ({ user, text, language, signal }) => {
  const token = await requireToken(user);
  let response;
  try {
    response = await fetch(apiBase() + '/api/v1/speech/synthesise', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language }),
      signal,
      cache: 'no-store'
    });
  } catch {
    throw new CourseAiError('Audio for this AI reply is not connected right now.', 'AI_AUDIO_OFFLINE');
  }
  if (!response.ok) {
    const payload = await readJson(response);
    throw new CourseAiError(payload?.error?.message || 'Audio for this AI reply could not be created.', payload?.error?.code || 'AI_AUDIO_FAILED');
  }
  return response.blob();
};
