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

export const askCourseAi = async ({ user, message, history, courseId, courseVersion, page, language, companionRole = '', signal }) => {
  const requestOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // `companionRole` is an allow-listed presentation hint. The server owns
    // the whitelist and the learning safeguards; it never changes course
    // facts or gives the model an unrestricted persona instruction.
    body: JSON.stringify({ message, history, courseId, courseVersion, page, language, companionRole }),
    signal
  };
  // Guest access is an explicitly bounded public-course route. It never
  // receives a Firebase token or private manifest context; the server still
  // applies provider rotation, rate limits and content safeguards.
  return user?.isGuest
    ? request('/api/v1/ai/chat', requestOptions)
    : authenticatedRequest(user, '/api/v1/ai/chat', requestOptions);
};

// Adaptive recall is intentionally a distinct, structured endpoint instead
// of an unrestricted chat call. The browser sends only the learner's current
// attempt and current page identity; provider keys and model selection remain
// server-only.
export const requestAdaptiveRecall = async ({ user, courseId, courseVersion, page, language, response, previousResponse, barrier, behaviourStates = [], signal }) => {
  const requestOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Behaviour states are a short allow-list (for example, "re-reading"),
    // never timings, typed words, recordings, chat, answers, or a learner label.
    body: JSON.stringify({ courseId, courseVersion, page, language, response, previousResponse, barrier, behaviourStates }),
    signal
  };
  // Adaptive Recall stays signed-in-only. Guest Course AI is deliberately
  // conversation support, not storage-backed personalisation or assessment.
  return user?.isGuest
    ? request('/api/v1/adaptive-recall', requestOptions)
    : authenticatedRequest(user, '/api/v1/adaptive-recall', requestOptions);
};

export const transcribeCourseAudio = async ({ user, audio, durationMs, language, purpose, signal }) => {
  const form = new FormData();
  form.append('audio', audio, 'type2learn-voice.webm');
  form.append('durationMs', String(Math.round(durationMs)));
  form.append('language', language === 'ur' ? 'ur' : 'en');
  form.append('purpose', purpose);
  return authenticatedRequest(user, '/api/v1/speech/transcribe', { method: 'POST', body: form, signal });
};

// Live microphone input gets a short-lived, provider-scoped token from the
// protected server route. The browser never receives SPEECHMATICS_API_KEY and
// Type2Learn never proxies or stores raw microphone audio.
export const getRealtimeSpeechToken = async ({ user, language, purpose, signal }) => authenticatedRequest(user, '/api/v1/speech/realtime-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ language: language === 'ur' ? 'ur' : 'en', purpose: purpose === 'chat' ? 'chat' : 'typing' }),
  signal
});

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

// Reviewed publishing catalogue. These helpers deliberately use the same
// signed-in request boundary as account progress: guest preview never gains
// access to a private course manifest or its server-held answer keys.
export const loadReviewedCourseManifest = async ({ user, courseId, version, signal }) => {
  const query = new URLSearchParams({ courseId: String(courseId || ''), version: String(version || '') });
  return authenticatedRequest(user, '/api/v1/course-manifest?' + query.toString(), { signal });
};

// The learner catalogue is a deliberately small projection of approved
// courses the current account may open. It never includes source uploads,
// answer keys, rosters, or other authoring-only data.
export const loadPublishedCourseCatalogue = async ({ user, signal }) => authenticatedRequest(user, '/api/v1/courses', { signal });

// Published human narration is retrieved only for the visible module. The
// endpoint returns a short-lived signed URL, never a private Storage path.
export const loadReviewedCourseNarration = async ({ user, courseId, version, moduleId, language, signal }) => {
  const query = new URLSearchParams({
    courseId: String(courseId || ''),
    version: String(version || ''),
    moduleId: String(moduleId || ''),
    language: language === 'ur' ? 'ur' : 'en'
  });
  return authenticatedRequest(user, '/api/v1/course-narration?' + query.toString(), { signal });
};

export const checkReviewedCourseAnswer = async ({ user, courseId, version, scope, moduleId, questionIndex, language, selectedIndex, signal }) => authenticatedRequest(user, '/api/v1/courses/check-answer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    courseId,
    version,
    scope: scope === 'final' ? 'final' : 'module',
    moduleId: moduleId || undefined,
    questionIndex: Number.isInteger(questionIndex) ? questionIndex : undefined,
    language: language === 'ur' ? 'ur' : 'en',
    selectedIndex
  }),
  signal
});

export const setAdaptiveLearningConsent = async ({ user, enabled, signal }) => authenticatedRequest(user, '/api/v1/adaptive/consent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ enabled: Boolean(enabled) }),
  signal
});

export const getAdaptiveLearningConsent = async ({ user, signal }) => authenticatedRequest(user, '/api/v1/adaptive/consent', {
  method: 'GET',
  signal
});

export const saveLearningSummary = async ({ user, summary, signal }) => authenticatedRequest(user, '/api/v1/learning-summary', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(summary),
  signal
});

export const requestAdaptiveProposal = async ({ user, courseId, courseVersion, moduleIndex, signal }) => authenticatedRequest(user, '/api/v1/adaptive/proposal', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ courseId, courseVersion, moduleIndex }),
  signal
});

export const decideAdaptiveProposal = async ({ user, courseId, courseVersion, proposalId, accepted, signal }) => authenticatedRequest(user, '/api/v1/adaptive/proposal/' + encodeURIComponent(proposalId) + '/decision', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ courseId, courseVersion, accepted: Boolean(accepted) }),
  signal
});

export const deleteAdaptiveLearningData = async ({ user, signal }) => authenticatedRequest(user, '/api/v1/privacy/adaptive-data', {
  method: 'DELETE',
  signal
});

export const exportAdaptiveLearningData = async ({ user, signal }) => authenticatedRequest(user, '/api/v1/privacy/adaptive-data-export', {
  method: 'POST',
  signal
});

// BEHAVIOURAL LEARNING PARTNER: browser code supplies only a validated compact
// aggregate. The endpoint is signed-in + adaptive-consent gated; guest/local
// sessions always use authored local support instead.
export const requestBehaviourDirective = async ({ user, context, signal }) => authenticatedRequest(user, '/api/v1/behaviour/directive', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(context),
  signal
});

// Assessment runs are intentionally separate from guided lesson typing. The
// server returns only the current question and short supportive feedback; it
// never returns an answer key, score, or hidden evaluation rubric.
export const startUnderstandingCheck = async ({ user, courseId, courseVersion, moduleIndex, language, scope = 'module', signal }) => authenticatedRequest(user, '/api/v1/assessment/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ courseId, courseVersion, moduleIndex, scope: scope === 'final' ? 'final' : 'module', language: language === 'ur' ? 'ur' : 'en' }),
  signal
});

export const loadUnderstandingCheck = async ({ user, runId, signal }) => authenticatedRequest(user, '/api/v1/assessment/' + encodeURIComponent(runId), { signal });

export const answerUnderstandingCheck = async ({ user, runId, answer, signal }) => authenticatedRequest(user, '/api/v1/assessment/' + encodeURIComponent(runId), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ answer }),
  signal
});

// A recheck is deliberately learner-led. This records only that the linked
// reviewed module was opened before a fresh no-score check; it never sends
// the reading position, response, answer key, or assessment result.
export const acknowledgeUnderstandingReview = async ({ user, runId, signal }) => authenticatedRequest(user, '/api/v1/assessment/' + encodeURIComponent(runId) + '/reviewed', {
  method: 'POST',
  signal
});

export const synthesiseCourseAiReply = async ({ user, text, language, signal }) => {
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language }),
    signal,
    cache: 'no-store'
  };
  let response;
  try {
    // Guest narration is an intentionally bounded public read-aloud route.
    // It uses the same provider voice as the signed-in course, while private
    // speech-to-text and learner data remain authenticated-only.
    if (user?.isGuest) response = await fetch(apiBase() + '/api/v1/speech/synthesise', options);
    else {
      const token = await requireToken(user);
      response = await fetch(apiBase() + '/api/v1/speech/synthesise', {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...options.headers }
      });
    }
  } catch {
    throw new CourseAiError('Audio for this AI reply is not connected right now.', 'AI_AUDIO_OFFLINE');
  }
  if (!response.ok) {
    const payload = await readJson(response);
    throw new CourseAiError(payload?.error?.message || 'Audio for this AI reply could not be created.', payload?.error?.code || 'AI_AUDIO_FAILED');
  }
  return response.blob();
};
