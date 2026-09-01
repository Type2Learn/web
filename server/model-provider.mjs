// Server-only model routing. Browser code never receives provider keys or a
// provider URL. Gemini is always first. An optional single-flight Featherless
// account is the bounded middle fallback, then a role-specific OpenAI model
// supplies the final fallback. Every structured result is validated by the
// calling service, regardless of which provider produced it.
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
const boundedTimeout = (value, fallback = 35_000) => Math.min(35_000, Math.max(1_000, number(value, fallback)));
const boundedAttempts = (value, fallback) => Math.min(Math.max(1, number(value, fallback)), Math.max(1, fallback));

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
  let featherlessInFlight = 0;

  const geminiReady = () => keys.some((key) => Number(cooldowns.get(key) || 0) <= Date.now());
  const featherlessReady = () => Boolean(config.featherlessApiKey && config.featherlessChatCompletionsUrl && config.featherlessModel);
  const openAiReady = () => Boolean(config.openAiApiKey && config.openAiResponsesUrl);
  // Behavioural companion wording is intentionally Gemini-first. Nano is a
  // bounded repair/verification fallback only; this flow must never consume a
  // Mini or final-assessment model.
  const geminiFirstNanoFallbackPurposes = new Set([
    'behavioural-partner',
    // A preference proposal is behavioural wording, not a complex judgment.
    // It therefore follows the same inexpensive, privacy-bounded routing as
    // the fictional partner: Flash-Lite first and Nano only as fallback.
    'adaptive-support'
  ]);
  const miniPurposes = new Set([
    'adaptive-recall',
    'assessment-evaluation',
    'assessment-generation',
    'intent-generation',
    'json-compilation',
    'json-repair',
    'component-planning',
    // Private administrator source conversion has a larger, tightly bounded
    // JSON/Markdown contract. Gemini still runs first; Mini is used only when
    // the lower-cost providers cannot complete that reviewed draft.
    'course-authoring-conversion',
    'course-authoring-repair',
    'course-authoring-critique'
  ]);
  const extendedCourseAuthoringPurposes = new Set(['course-authoring-conversion', 'course-authoring-repair']);

  const modelForOpenAiPurpose = (purpose) => {
    if (geminiFirstNanoFallbackPurposes.has(purpose)) return config.openAiModel;
    if (purpose === 'final-assessment-generation') return config.openAiTestModel || config.openAiMiniModel || config.openAiModel;
    if (miniPurposes.has(purpose)) return config.openAiMiniModel || config.openAiModel;
    return config.openAiModel;
  };
  const status = () => ({
    available: geminiReady() || featherlessReady() || openAiReady(),
    primary: geminiReady() ? 'gemini' : featherlessReady() ? 'featherless' : openAiReady() ? 'openai' : 'offline',
    fallback: featherlessReady() ? 'featherless' : openAiReady() ? 'openai' : null,
    fastModel: config.geminiFastModel || null,
    heavyModel: config.geminiHeavyModel || config.openAiMiniModel || config.openAiTestModel || null,
    chatModel: config.geminiFastModel || config.openAiModel || null,
    fallbackModel: config.openAiModel || null,
    nanoModel: config.openAiModel || null,
    miniModel: config.openAiMiniModel || null,
    finalAssessmentModel: config.openAiTestModel || null,
    featherless: {
      available: featherlessReady(),
      model: featherlessReady() ? config.featherlessModel : null,
      maxConcurrentRequests: Number(config.featherlessMaxConcurrentRequests) || 1,
      inFlight: featherlessInFlight
    }
  });

  const nextAvailableKey = () => {
    for (let attempt = 0; attempt < keys.length; attempt += 1) {
      const index = (nextKey + attempt) % keys.length;
      const key = keys[index];
      if (Number(cooldowns.get(key) || 0) <= Date.now()) {
        nextKey = (index + 1) % keys.length;
        return { key, index };
      }
    }
    return '';
  };

  const callGemini = async ({ instructions, input, maxOutputTokens, jsonSchema, heavy = false, purpose, timeoutMs, maxGeminiAttempts }) => {
    let lastError = null;
    const attempts = boundedAttempts(maxGeminiAttempts, keys.length);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const keySlot = nextAvailableKey();
      if (!keySlot) break;
      const { key, index: keyIndex } = keySlot;
      const model = heavy ? config.geminiHeavyModel : config.geminiFastModel;
      const outputLimit = extendedCourseAuthoringPurposes.has(purpose)
        ? Number(config.courseAuthoringMaxOutputTokens) || 3_600
        : Number(config.geminiMaxOutputTokens) || 420;
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instructions }] },
            contents: [{ role: 'user', parts: [{ text: input }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: Math.min(Number(maxOutputTokens) || outputLimit, outputLimit),
              ...(jsonSchema ? { responseMimeType: 'application/json', responseSchema: geminiSchema(jsonSchema) } : {})
            }
          }),
          signal: AbortSignal.timeout(boundedTimeout(timeoutMs))
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
          // This is deliberately server-only diagnostic metadata. It is not
          // forwarded by any public API response, but lets deployment checks
          // prove that a pool actually rotates without printing key material.
          keySlot: keyIndex + 1,
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

  const schemaNameFor = (purpose) => String(purpose || 'structured_output')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64) || 'structured_output';

  const callOpenAi = async ({ instructions, input, maxOutputTokens, jsonSchema, purpose, timeoutMs }) => {
    if (!openAiReady()) throw new Error('No fallback model is configured.');
    const model = modelForOpenAiPurpose(purpose);
    const response = await fetch(config.openAiResponsesUrl, {
      method: 'POST',
      headers: {
        ...(config.openAiProvider === 'azure-openai' ? { 'api-key': config.openAiApiKey } : { Authorization: `Bearer ${config.openAiApiKey}` }),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        store: false,
        instructions,
        input,
        max_output_tokens: maxOutputTokens,
        ...(jsonSchema ? { text: { format: { type: 'json_schema', name: schemaNameFor(purpose), strict: true, schema: jsonSchema } } } : {})
      }),
      signal: AbortSignal.timeout(boundedTimeout(timeoutMs))
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    const payload = await response.json().catch(() => ({}));
    const text = outputText(payload);
    if (!text) throw new Error('OpenAI returned an empty result.');
    return {
      text,
      provider: 'openai',
      model,
      usage: {
        inputTokens: number(payload?.usage?.input_tokens, Math.ceil((instructions.length + input.length) / 3)),
        outputTokens: number(payload?.usage?.output_tokens, Math.ceil(text.length / 3))
      }
    };
  };

  const featherlessText = (payload) => {
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) return content.map((item) => item?.text || '').filter(Boolean).join('\n').trim();
    return '';
  };

  const callFeatherless = async ({ instructions, input, maxOutputTokens, purpose, timeoutMs }) => {
    if (!featherlessReady()) throw new Error('Featherless is not configured.');
    // Featherless accounts reserve a finite number of concurrent units. The
    // Type2Learn fallback is intentionally one-at-a-time: when it is busy,
    // the caller immediately continues to OpenAI rather than queuing a learner
    // behind another learner’s interaction.
    if (featherlessInFlight >= (Number(config.featherlessMaxConcurrentRequests) || 1)) {
      throw new Error('Featherless capacity is busy.');
    }
    featherlessInFlight += 1;
    try {
      const outputLimit = extendedCourseAuthoringPurposes.has(purpose)
        ? Number(config.courseAuthoringMaxOutputTokens) || 3_600
        : 420;
      const response = await fetch(config.featherlessChatCompletionsUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.featherlessApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.featherlessModel,
          temperature: 0.2,
          max_tokens: Math.min(Number(maxOutputTokens) || outputLimit, outputLimit),
          messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: input }
          ]
        }),
        signal: AbortSignal.timeout(boundedTimeout(timeoutMs))
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const payload = await response.json().catch(() => ({}));
      const text = featherlessText(payload);
      if (!text) throw new Error('Featherless returned an empty result.');
      return {
        text,
        provider: 'featherless',
        model: config.featherlessModel,
        usage: {
          inputTokens: number(payload?.usage?.prompt_tokens, Math.ceil((instructions.length + input.length) / 3)),
          outputTokens: number(payload?.usage?.completion_tokens, Math.ceil(text.length / 3))
        }
      };
    } finally {
      featherlessInFlight = Math.max(0, featherlessInFlight - 1);
    }
  };

  const generate = async (request) => {
    // ADAPTIVE LEARNING: one provider layer owns all model choices. A purpose
    // changes only model role/order, never the browser contract or safety
    // validators that consume the returned JSON.
    const normalisedRequest = {
      ...request,
      heavy: Boolean(request?.heavy || request?.purpose === 'heavy')
    };
    // A compact behavioural-partner message normally begins with Gemini. If
    // that response is malformed, its service may request one Nano-only JSON
    // repair. No other feature can force a provider through this escape hatch.
    if (normalisedRequest.purpose === 'behavioural-partner' && normalisedRequest.forceOpenAi === true) {
      if (!openAiReady()) throw new Error('The Nano JSON-repair model is not available.');
      return callOpenAi(normalisedRequest);
    }
    // Gemini remains the low-cost first provider for every learner request.
    // Featherless is the explicitly bounded middle fallback, followed by the
    // existing OpenAI role-specific provider. Every downstream service still
    // validates structured output independently, so Featherless never widens
    // the accepted response contract.
    const candidates = [
      [geminiReady(), callGemini],
      [featherlessReady(), callFeatherless],
      [openAiReady(), callOpenAi]
    ];
    let firstError;
    for (const [ready, call] of candidates) {
      if (!ready) continue;
      try { return await call(normalisedRequest); }
      catch (error) { firstError ||= error; }
    }
    throw firstError || new Error('No learning model is available.');
  };

  const available = () => status().available;
  const availableFor = () => available();
  return { status, available, availableFor, generate };
};
