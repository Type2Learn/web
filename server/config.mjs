import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Course AI is deliberately pinned to the low-cost model selected for normal
// learner conversations. Do not introduce an automatic fallback: a model
// availability problem must be visible rather than silently spending the
// future assessment-generation budget.
export const APPROVED_OPENAI_MODEL = 'gpt-5-nano';

// Reserved for the future assessment/test-generation feature only. It is not
// an approved Course AI chat model and must not be used as a chat fallback.
export const RESERVED_TEST_GENERATION_MODEL = 'gpt-5.1-codex-mini';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(here, '..');

const numberFrom = (value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

const booleanFrom = (value, fallback = false) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return /^(?:1|true|yes|on)$/i.test(String(value).trim());
};

const unquote = (value) => {
  const trimmed = String(value || '').trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const completeJsonValue = (value) => {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};

// Local service-account downloads are often pasted with their normal JSON
// line breaks. Accept that developer-friendly shape locally; deployment still
// receives the same value as one encrypted Render environment variable.
export const parseEnvText = (text) => {
  const lines = String(text || '').split(/\r?\n/);
  const values = {};
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || /^\s*#/.test(line)) continue;

    const key = match[1];
    let value = unquote(match[2]);
    if (/^[{[]/.test(value) && !completeJsonValue(value)) {
      while (index + 1 < lines.length && !completeJsonValue(value)) {
        index += 1;
        value += `\n${lines[index]}`;
      }
    }
    values[key] = value;
  }
  return values;
};

const localEnvironment = async (root) => {
  try {
    return parseEnvText(await readFile(path.join(root, 'security', 'api.env'), 'utf8'));
  } catch {
    return {};
  }
};

const splitOrigins = (value) => String(value || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const splitKeys = (value) => String(value || '')
  .split(/[\s,]+/)
  .map((key) => key.trim())
  .filter(Boolean);

const openAiEndpoint = (value) => {
  const fallback = 'https://api.openai.com/v1/responses';
  if (!value) return { url: fallback, provider: 'openai' };
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const isOpenAi = host === 'api.openai.com';
    const isAzureOpenAi = host.endsWith('.openai.azure.com');
    if (parsed.protocol !== 'https:' || (!isOpenAi && !isAzureOpenAi)) return { url: '', provider: 'unsupported' };
    if (isOpenAi && !/\/v1\/responses\/?$/.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\/$/, '') + '/v1/responses';
    }
    return { url: parsed.toString(), provider: isAzureOpenAi ? 'azure-openai' : 'openai' };
  } catch {
    return { url: '', provider: 'unsupported' };
  }
};

export const loadRuntimeConfig = async ({ environment = process.env, root = repositoryRoot } = {}) => {
  const production = String(environment.NODE_ENV || '').toLowerCase() === 'production';
  // The local file is intentionally never read by a production process. Render
  // obtains all credentials directly from its encrypted environment instead.
  const local = production ? {} : await localEnvironment(root);
  const value = (...keys) => {
    for (const key of keys) {
      const configured = environment[key];
      if (configured !== undefined && String(configured).trim()) return String(configured).trim();
      const developmentValue = local[key];
      if (developmentValue !== undefined && String(developmentValue).trim()) return String(developmentValue).trim();
    }
    return '';
  };
  // Unlike ordinary single-value settings, every supplied Gemini key is
  // meaningful: preserve all aliases so gemchat, gemtext, gemtest, and their
  // numbered variants participate in round-robin rotation instead of silently
  // taking the first populated name.
  // participate in round-robin rotation instead of silently taking the first.
  const values = (...keys) => keys.flatMap((key) => [environment[key], local[key]])
    .filter((configured) => configured !== undefined && String(configured).trim())
    .map((configured) => String(configured).trim());
  const defaultOrigins = [
    'https://type2learn.tech',
    'https://www.type2learn.tech',
    'http://localhost:4173',
    'http://127.0.0.1:4173'
  ];
  const configuredOrigins = splitOrigins(value('AI_ALLOWED_ORIGINS'));

  const configuredOpenAiEndpoint = openAiEndpoint(value('OPENAI_RESPONSES_URL', 'OPENAI_API_BASE_URL', 'OPENAI_BASE_URL', 'url'));
  const geminiApiKeys = Array.from(new Set([
    ...values('GEMINI_API_KEYS', 'GEMINI_API_KEY').flatMap(splitKeys),
    ...values('gemchat', 'gemtext', 'gemtest').flatMap(splitKeys),
    ...Array.from({ length: 12 }, (_, index) => values(`gemchat${index + 1}`, `gemtext${index + 1}`, `gemtest${index + 1}`)).flatMap(splitKeys),
    ...Array.from({ length: 12 }, (_, index) => values(`GEMINI_API_KEY_${index + 1}`, `GEMINI_KEY_${index + 1}`)).flatMap(splitKeys)
  ]));

  return {
    production,
    port: numberFrom(value('PORT'), 4173, { min: 1, max: 65535 }),
    host: value('HOST') || '0.0.0.0',
    allowedOrigins: new Set(configuredOrigins.length ? configuredOrigins : defaultOrigins),
    // Guest AI exists only to make local preview/testing possible without a
    // Firebase account. It is hard-disabled in production even when an
    // environment variable is accidentally supplied there.
    allowLocalGuestAi: !production && booleanFrom(value('AI_ALLOW_GUESTS')),
    // ADAPTIVE LEARNING: every data-collecting or generative feature remains
    // off by default. These flags must block server routes as well as UI, so a
    // hidden button cannot create learner data or provider spend.
    adaptiveLearningEnabled: booleanFrom(value('ADAPTIVE_LEARNING_ENABLED')),
    aiAssessmentsEnabled: booleanFrom(value('AI_ASSESSMENTS_ENABLED')),
    aiVisualsEnabled: booleanFrom(value('AI_VISUALS_ENABLED')),
    firebaseProjectId: value('FIREBASE_PROJECT_ID') || 'type2learn-defcc',
    firebaseServiceAccountJson: value('FIREBASE_SERVICE_ACCOUNT_JSON'),
    openAiApiKey: value('OPENAI_API_KEY', 'openai', 'key'),
    openAiResponsesUrl: configuredOpenAiEndpoint.url,
    openAiProvider: configuredOpenAiEndpoint.provider,
    // `speech` is supported only for the existing local api.env file. The
    // deployment variable is always the explicit SPEECHMATICS_API_KEY name.
    speechmaticsApiKey: value('SPEECHMATICS_API_KEY', 'speech'),
    openAiModel: APPROVED_OPENAI_MODEL,
    openAiTestModel: RESERVED_TEST_GENERATION_MODEL,
    // A zero cap makes every first request look as though the monthly budget
    // was spent. Treat accidental zero-valued deployment variables as absent
    // and retain the deliberately bounded defaults instead.
    openAiAppCapUsd: numberFrom(value('OPENAI_MONTHLY_APP_USD_CAP'), 14, { min: 0.01, max: 14 }),
    openAiUserCapUsd: numberFrom(value('OPENAI_MONTHLY_USER_USD_CAP'), 2, { min: 0.01, max: 2 }),
    openAiAppInputTokenCap: numberFrom(value('OPENAI_MONTHLY_APP_INPUT_TOKEN_CAP'), 11200000, { min: 1, max: 11200000 }),
    openAiAppOutputTokenCap: numberFrom(value('OPENAI_MONTHLY_APP_OUTPUT_TOKEN_CAP'), 5600000, { min: 1, max: 5600000 }),
    openAiUserInputTokenCap: numberFrom(value('OPENAI_MONTHLY_USER_INPUT_TOKEN_CAP'), 1000000, { min: 1, max: 1000000 }),
    openAiUserOutputTokenCap: numberFrom(value('OPENAI_MONTHLY_USER_OUTPUT_TOKEN_CAP'), 500000, { min: 1, max: 500000 }),
    // GPT-5 nano text-token pricing. Keep the limits below separate from these
    // rates so a pricing change cannot expand the fixed application/user caps.
    openAiInputUsdPerMillion: numberFrom(value('OPENAI_INPUT_USD_PER_MILLION_TOKENS'), 0.05, { min: 0, max: 0.05 }),
    openAiOutputUsdPerMillion: numberFrom(value('OPENAI_OUTPUT_USD_PER_MILLION_TOKENS'), 0.4, { min: 0, max: 0.4 }),
    openAiMaxOutputTokens: numberFrom(value('OPENAI_MAX_OUTPUT_TOKENS'), 320, { min: 32, max: 320 }),
    openAiRequestsPerMinute: numberFrom(value('OPENAI_REQUESTS_PER_MINUTE'), 12, { min: 1, max: 12 }),
    // The adaptive proposal service uses a smaller portion of the existing
    // protected ledger. These are ceilings, never new defaults that enable a
    // feature by themselves.
    adaptiveAppCapUsd: numberFrom(value('ADAPTIVE_MONTHLY_APP_USD_CAP'), 2, { min: 0.01, max: 2 }),
    adaptiveUserCapUsd: numberFrom(value('ADAPTIVE_MONTHLY_USER_USD_CAP'), 0.5, { min: 0.01, max: 0.5 }),
    adaptiveRequestsPerMinute: numberFrom(value('ADAPTIVE_REQUESTS_PER_MINUTE'), 4, { min: 1, max: 4 }),
    // Assessment generation is intentionally rare and reviewer-only. The
    // learner-facing authored reserve needs no provider call.
    assessmentAppCapUsd: numberFrom(value('OPENAI_ASSESSMENT_MONTHLY_APP_USD_CAP'), 3, { min: 0.01, max: 3 }),
    assessmentUserCapUsd: numberFrom(value('OPENAI_ASSESSMENT_MONTHLY_USER_USD_CAP'), 0.5, { min: 0.01, max: 0.5 }),
    assessmentRequestsPerMinute: numberFrom(value('OPENAI_ASSESSMENT_REQUESTS_PER_MINUTE'), 2, { min: 1, max: 2 }),
    assessmentGenerationIntervalMs: numberFrom(value('ASSESSMENT_GENERATION_INTERVAL_MS'), 3600000, { min: 60000, max: 86400000 }),
    assessmentMaxOutputTokens: numberFrom(value('OPENAI_ASSESSMENT_MAX_OUTPUT_TOKENS'), 2400, { min: 400, max: 4800 }),
    assessmentReviewerUids: new Set(value('ASSESSMENT_REVIEWER_UIDS').split(',').map((item) => item.trim()).filter(Boolean)),
    openAiTestInputUsdPerMillion: numberFrom(value('OPENAI_TEST_INPUT_USD_PER_MILLION_TOKENS'), 0.25, { min: 0, max: 5 }),
    openAiTestCachedInputUsdPerMillion: numberFrom(value('OPENAI_TEST_CACHED_INPUT_USD_PER_MILLION_TOKENS'), 0.025, { min: 0, max: 5 }),
    openAiTestOutputUsdPerMillion: numberFrom(value('OPENAI_TEST_OUTPUT_USD_PER_MILLION_TOKENS'), 2, { min: 0, max: 10 }),
    // Gemini is the primary low-cost provider. Keys are read only by this
    // server process and are rotated by the model provider after temporary
    // quota or transport failures. OpenAI remains a server-side fallback.
    geminiApiKeys,
    geminiFastModel: value('GEMINI_FAST_MODEL') || 'gemini-3.5-flash-lite',
    geminiHeavyModel: value('GEMINI_HEAVY_MODEL') || 'gemini-3.6-flash',
    geminiMaxOutputTokens: numberFrom(value('GEMINI_MAX_OUTPUT_TOKENS'), 420, { min: 64, max: 700 }),
    speechmaticsMonthlyCreditCap: numberFrom(value('SPEECHMATICS_MONTHLY_CREDIT_CAP'), 180, { min: 0, max: 180 }),
    speechmaticsUserCreditCap: numberFrom(value('SPEECHMATICS_MONTHLY_USER_CREDIT_CAP'), 12, { min: 0, max: 12 }),
    speechmaticsCreditsPerMinute: numberFrom(value('SPEECHMATICS_CREDITS_PER_AUDIO_MINUTE'), 1, { min: 0.01, max: 10 }),
    speechmaticsRequestsPerMinute: numberFrom(value('SPEECHMATICS_REQUESTS_PER_MINUTE'), 6, { min: 1, max: 6 })
  };
};
