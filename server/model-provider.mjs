// Server-only model routing. Browser code never receives provider keys or a
// provider URL. Gemini is attempted first because the supplied project keys
// are intended for the normal learning flow; OpenAI is a resilient fallback.
const outputText = (payload) => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  return (Array.isArray(payload?.output) ? payload.output : [])
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((item) => item?.text || item?.value || '')
    .filter(Boolean)
    .join('\n')
    .trim();
};

const geminiText = (payload) => (Array.isArray(payload?.candidates) ? payload.candidates : [])
  .flatMap((candidate) => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
  .map((part) => part?.text || '')
  .filter(Boolean)
  .join('\n')
  .trim();

const errorMessage = async (response) => {
  const body = await response.json().catch(() => ({}));
  return String(body?.error?.message || body?.message || 'The model did not return a usable result.');
};

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// Gemini accepts a useful, but smaller, JSON Schema dialect. Strip fields that
// are valid in standard/OpenAI schemas yet rejected by Gemini (notably
// `additionalProperties`, length limits, and item limits) while retaining the
// shape, enums, required keys, and nested object/array definitions.
const geminiSchema = (schema) => {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  const allowed = new Set(['type', 'format', 'description', 'nullable', 'enum', 'items', 'properties', 'required']);
  return Object.fromEntries(Object.entries(schema)
    .filter(([key]) => allowed.has(key))
    .map(([key, value]) => {
      if (key === 'properties' && value && typeof value === 'object') {
        return [key, Object.fromEntries(Object.entries(value).map(([name, definition]) => [name, geminiSchema(definition)]))];
      }
      return [key, key === 'items' ? geminiSchema(value) : value];
    }));
};

export const createModelProvider = (config) => {
  const keys = Array.isArray(config.geminiApiKeys) ? config.geminiApiKeys.slice() : [];
  let nextKey = 0;
  const cooldowns = new Map();

  const geminiReady = () => keys.some((key) => Number(cooldowns.get(key) || 0) <= Date.now());
  const openAiReady = () => Boolean(config.openAiApiKey && config.openAiResponsesUrl);
  const status = () => ({
    available: geminiReady() || openAiReady(),
    primary: geminiReady() ? 'gemini' : openAiReady() ? 'openai' : 'offline',
    fallback: openAiReady() ? 'openai' : null,
    fastModel: config.geminiFastModel || null,
    fallbackModel: config.openAiModel || null
  });

  const nextAvailableKey = () => {
    for (let attempt = 0; attempt < keys.length; attempt += 1) {
      const index = (nextKey + attempt) % keys.length;
      const key = keys[index];
      if (Number(cooldowns.get(key) || 0) <= Date.now()) {
        nextKey = (index + 1) % keys.length;
        return key;
      }
    }
    return '';
  };

  const callGemini = async ({ instructions, input, maxOutputTokens, jsonSchema, heavy = false }) => {
    let lastError = null;
    for (let attempt = 0; attempt < keys.length; attempt += 1) {
      const key = nextAvailableKey();
      if (!key) break;
      const model = heavy ? config.geminiHeavyModel : config.geminiFastModel;
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instructions }] },
            contents: [{ role: 'user', parts: [{ text: input }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: Math.min(Number(maxOutputTokens) || 420, Number(config.geminiMaxOutputTokens) || 420),
              ...(jsonSchema ? { responseMimeType: 'application/json', responseSchema: geminiSchema(jsonSchema) } : {})
            }
          }),
          signal: AbortSignal.timeout(35000)
        });
        if (!response.ok) {
          const message = await errorMessage(response);
          // Rotate quota/transiently unavailable keys. Other errors can still
          // be a model rollout issue, so trying the next key is harmless.
          cooldowns.set(key, Date.now() + (response.status === 429 ? 90_000 : 25_000));
          lastError = new Error(message);
          continue;
        }
        const payload = await response.json().catch(() => ({}));
        const text = geminiText(payload);
        if (!text) {
          cooldowns.set(key, Date.now() + 15_000);
          lastError = new Error('Gemini returned an empty result.');
          continue;
        }
        return {
          text,
          provider: 'gemini',
          model,
          usage: {
            inputTokens: number(payload?.usageMetadata?.promptTokenCount, Math.ceil((instructions.length + input.length) / 3)),
            outputTokens: number(payload?.usageMetadata?.candidatesTokenCount, Math.ceil(text.length / 3))
          }
        };
      } catch (error) {
        cooldowns.set(key, Date.now() + 20_000);
        lastError = error;
      }
    }
    throw lastError || new Error('No Gemini key is ready.');
  };

  const callOpenAi = async ({ instructions, input, maxOutputTokens, jsonSchema }) => {
    if (!openAiReady()) throw new Error('No fallback model is configured.');
    const response = await fetch(config.openAiResponsesUrl, {
      method: 'POST',
      headers: {
        ...(config.openAiProvider === 'azure-openai' ? { 'api-key': config.openAiApiKey } : { Authorization: `Bearer ${config.openAiApiKey}` }),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.openAiModel,
        store: false,
        instructions,
        input,
        max_output_tokens: maxOutputTokens,
        ...(jsonSchema ? { text: { format: { type: 'json_schema', name: 'adaptive_recall', strict: true, schema: jsonSchema } } } : {})
      }),
      signal: AbortSignal.timeout(35000)
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    const payload = await response.json().catch(() => ({}));
    const text = outputText(payload);
    if (!text) throw new Error('OpenAI returned an empty result.');
    return {
      text,
      provider: 'openai',
      model: config.openAiModel,
      usage: {
        inputTokens: number(payload?.usage?.input_tokens, Math.ceil((instructions.length + input.length) / 3)),
        outputTokens: number(payload?.usage?.output_tokens, Math.ceil(text.length / 3))
      }
    };
  };

  const generate = async (request) => {
    let geminiError;
    if (geminiReady()) {
      try { return await callGemini(request); } catch (error) { geminiError = error; }
    }
    try { return await callOpenAi(request); } catch (openAiError) {
      const failure = new Error(geminiError?.message || openAiError?.message || 'No learning model is available.');
      failure.cause = openAiError;
      throw failure;
    }
  };

  return { status, generate };
};
