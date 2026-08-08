import { apiError } from './errors.mjs';

// A small server-only provider boundary. It intentionally has no learner
// state: services decide what safe, already-sanitised content to send and the
// provider only delivers that request through the configured key pools.
const keyFingerprint = (key) => `${String(key).slice(0, 5)}:${String(key).slice(-4)}`;

const textFromGemini = (payload) => (Array.isArray(payload?.candidates) ? payload.candidates : [])
  .flatMap((candidate) => candidate?.content?.parts || [])
  .map((part) => part?.text || '')
  .filter(Boolean)
  .join('\n')
  .trim();

const textFromOpenAi = (payload) => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  return (Array.isArray(payload?.output) ? payload.output : [])
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((item) => item?.text || item?.value || '')
    .filter(Boolean)
    .join('\n')
    .trim();
};

const responseBody = async (response) => response.json().catch(() => ({}));

const retryableGeminiStatus = (status) => status === 401 || status === 403 || status === 404 || status === 408 || status === 429 || status >= 500;
const retryableOpenAiStatus = (status) => status === 404 || status === 408 || status === 429 || status >= 500;

const keyPool = (keys, cooldowns, cursor) => {
  const now = Date.now();
  const available = keys.filter((key) => (cooldowns.get(keyFingerprint(key)) || 0) <= now);
  const pool = available.length ? available : keys;
  if (!pool.length) return [];
  const start = cursor.value % pool.length;
  cursor.value = (cursor.value + 1) % Math.max(1, pool.length);
  return pool.map((_, index) => pool[(start + index) % pool.length]);
};

const cooldown = (cooldowns, key, status) => {
  // Auth/model/quota failures are not retried with the same key immediately.
  // Short network/server failures may recover quickly; quota/auth failures get
  // a longer quiet period before this key re-enters the round robin.
  const duration = status === 429 || status === 401 || status === 403 || status === 404
    ? 15 * 60 * 1000
    : 90 * 1000;
  cooldowns.set(keyFingerprint(key), Date.now() + duration);
};

const providerError = () => apiError(502, 'AI_UPSTREAM_ERROR', 'The AI helper could not answer right now. Please try again later.');
const unavailableError = () => apiError(503, 'AI_NOT_CONFIGURED', 'The AI helper is not connected yet. You can still use the course support on this page.');

export const createModelProvider = ({ config, fetchImpl = globalThis.fetch } = {}) => {
  const chatCursor = { value: 0 };
  const heavyCursor = { value: 0 };
  const cooldowns = new Map();
  const hasOpenAiFallback = () => Boolean(config?.openAiApiKey && config?.openAiResponsesUrl && config?.openAiProvider !== 'unsupported');
  const geminiKeysFor = (purpose) => purpose === 'heavy'
    ? (Array.isArray(config?.geminiHeavyApiKeys) ? config.geminiHeavyApiKeys : [])
    : (Array.isArray(config?.geminiChatApiKeys) ? config.geminiChatApiKeys : []);
  const geminiModelFor = (purpose) => purpose === 'heavy' ? config?.geminiHeavyModel : config?.geminiChatModel;

  const gemini = async ({ purpose, instructions, input, maxOutputTokens, jsonSchema }) => {
    const keys = geminiKeysFor(purpose);
    const cursor = purpose === 'heavy' ? heavyCursor : chatCursor;
    const candidates = keyPool(keys, cooldowns, cursor);
    if (!candidates.length) return null;
    let lastFailure = null;
    for (const key of candidates) {
      try {
        const endpoint = `${String(config.geminiApiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')}/models/${encodeURIComponent(geminiModelFor(purpose))}:generateContent?key=${encodeURIComponent(key)}`;
        const generationConfig = { maxOutputTokens: Math.max(1, Number(maxOutputTokens) || 1) };
        if (jsonSchema) {
          generationConfig.responseMimeType = 'application/json';
          generationConfig.responseJsonSchema = jsonSchema;
        }
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: String(instructions || '') }] },
            contents: [{ role: 'user', parts: [{ text: String(input || '') }] }],
            generationConfig
          }),
          signal: AbortSignal.timeout(35000)
        });
        const payload = await responseBody(response);
        if (!response.ok) {
          lastFailure = { status: response.status, payload };
          if (retryableGeminiStatus(response.status)) {
            cooldown(cooldowns, key, response.status);
            continue;
          }
          throw providerError();
        }
        const text = textFromGemini(payload);
        if (!text) {
          cooldown(cooldowns, key, 500);
          lastFailure = { status: 502, payload };
          continue;
        }
        const usage = payload?.usageMetadata || {};
        return {
          provider: 'gemini',
          model: geminiModelFor(purpose),
          text,
          usage: {
            inputTokens: Number(usage.promptTokenCount) || 0,
            cachedInputTokens: Number(usage.cachedContentTokenCount) || 0,
            outputTokens: Number(usage.candidatesTokenCount) || 0
          }
        };
      } catch (error) {
        if (error?.code) throw error;
        lastFailure = { status: 502 };
        cooldown(cooldowns, key, 502);
      }
    }
    return { failure: lastFailure || { status: 503 } };
  };

  const openAi = async ({ purpose, instructions, input, maxOutputTokens, jsonSchema }) => {
    if (!hasOpenAiFallback()) throw unavailableError();
    const isHeavy = purpose === 'heavy';
    const model = isHeavy ? config.openAiTestGenerationModel : config.openAiModel;
    const body = {
      model,
      store: false,
      instructions: String(instructions || ''),
      input: String(input || ''),
      max_output_tokens: Math.max(1, Number(maxOutputTokens) || 1)
    };
    if (jsonSchema) body.text = { format: { type: 'json_schema', name: 'type2learn_response', strict: true, schema: jsonSchema } };
    let response;
    try {
      response = await fetchImpl(config.openAiResponsesUrl, {
        method: 'POST',
        headers: {
          ...(config.openAiProvider === 'azure-openai' ? { 'api-key': config.openAiApiKey } : { Authorization: `Bearer ${config.openAiApiKey}` }),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(35000)
      });
    } catch {
      throw providerError();
    }
    const payload = await responseBody(response);
    if (!response.ok) {
      if (retryableOpenAiStatus(response.status)) throw providerError();
      throw providerError();
    }
    const text = textFromOpenAi(payload);
    if (!text) throw apiError(502, 'EMPTY_AI_REPLY', 'The AI helper did not return a usable reply. Please try again.');
    return {
      provider: 'openai',
      model,
      text,
      usage: {
        inputTokens: Number(payload?.usage?.input_tokens) || 0,
        cachedInputTokens: Number(payload?.usage?.input_tokens_details?.cached_tokens) || 0,
        outputTokens: Number(payload?.usage?.output_tokens) || 0
      }
    };
  };

  const generate = async (request) => {
    const purpose = request?.purpose === 'heavy' ? 'heavy' : 'chat';
    const geminiResult = await gemini({ ...request, purpose });
    if (geminiResult?.text) return geminiResult;
    // Gemini is always attempted first. OpenAI is only the safe backup after
    // every currently usable Gemini key has failed or is cooling down.
    return openAi({ ...request, purpose });
  };

  return {
    status: () => ({
      primary: geminiKeysFor('chat').length ? 'gemini' : null,
      fallback: hasOpenAiFallback() ? 'openai' : null,
      chatModel: geminiKeysFor('chat').length ? config.geminiChatModel : (hasOpenAiFallback() ? config.openAiModel : null),
      heavyModel: geminiKeysFor('heavy').length ? config.geminiHeavyModel : (hasOpenAiFallback() ? config.openAiTestGenerationModel : null)
    }),
    available: () => Boolean(geminiKeysFor('chat').length || hasOpenAiFallback()),
    // A heavy task must not report itself available merely because the normal
    // chat pool is configured. Assessment-bank creation uses this narrower
    // check before it can reserve budget or present an admin workflow.
    availableFor: (purpose = 'chat') => Boolean(geminiKeysFor(purpose === 'heavy' ? 'heavy' : 'chat').length || hasOpenAiFallback()),
    generate
  };
};
