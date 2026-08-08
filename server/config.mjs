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

// Gemini is the primary server-side provider when a suitable key pool is
// present. These stable identifiers are deliberately pinned rather than read
// from an environment variable: a typo or an experimental model must not
// silently change what learners receive.
export const APPROVED_GEMINI_CHAT_MODEL = 'gemini-3.5-flash-lite';
export const APPROVED_GEMINI_HEAVY_MODEL = 'gemini-3.6-flash';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(here, '..');

const numberFrom = (value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

const booleanFrom = (value, fallback = false) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
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

const splitIdentifiers = (value) => String(value || '')
  .split(/[\n,]/)
  .map((entry) => entry.trim())
  .filter((entry) => /^[A-Za-z0-9_-]{1,128}$/.test(entry));

const splitSecrets = (value) => String(value || '')
  .split(/[\n,]/)
  .map((entry) => entry.trim())
  .filter(Boolean);

const uniqueSecrets = (values) => [...new Set(values.filter(Boolean))];

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
  const values = (...keys) => {
    const collected = [];
    for (const key of keys) {
      if (environment[key] !== undefined && String(environment[key]).trim()) collected.push(...splitSecrets(environment[key]));
      if (local[key] !== undefined && String(local[key]).trim()) collected.push(...splitSecrets(local[key]));
    }
    return collected;
  };
  // Support an explicit comma-separated key pool as well as the existing
  // local aliases (`gemchat` and `gemtest`) and future numbered variables.
  // Values never leave this module; callers receive only the configured pool.
  const geminiKeyPool = (kind) => {
    const isHeavy = kind === 'heavy';
    const explicit = values(
      isHeavy ? 'GEMINI_TEST_API_KEYS' : 'GEMINI_CHAT_API_KEYS',
      isHeavy ? 'GEMINI_TEST_API_KEY' : 'GEMINI_CHAT_API_KEY',
      'GEMINI_API_KEYS',
      isHeavy ? 'gemtest' : 'gemchat',
      // `gemtext` was requested as an alias too, in case it is the intended
      // spelling in a future deployment environment.
      ...(isHeavy ? ['gemtext'] : [])
    );
    const prefixes = isHeavy
      ? [/^GEMINI_TEST_API_KEY_\d+$/i, /^gemtest\d+$/i, /^gemtext\d+$/i]
      : [/^GEMINI_CHAT_API_KEY_\d+$/i, /^gemchat\d+$/i];
    const numbered = [environment, local].flatMap((source) => Object.entries(source)
      .filter(([key]) => prefixes.some((pattern) => pattern.test(key)))
      .flatMap(([, secret]) => splitSecrets(secret)));
    return uniqueSecrets([...explicit, ...numbered]);
  };
  const defaultOrigins = [
    'https://type2learn.tech',
    'https://www.type2learn.tech',
    'http://localhost:4173',
    'http://127.0.0.1:4173'
  ];
  const configuredOrigins = splitOrigins(value('AI_ALLOWED_ORIGINS'));

  const configuredOpenAiEndpoint = openAiEndpoint(value('OPENAI_RESPONSES_URL', 'OPENAI_API_BASE_URL', 'OPENAI_BASE_URL', 'url'));

  return {
    production,
    port: numberFrom(value('PORT'), 4173, { min: 1, max: 65535 }),
    host: value('HOST') || '0.0.0.0',
    allowedOrigins: new Set(configuredOrigins.length ? configuredOrigins : defaultOrigins),
    firebaseProjectId: value('FIREBASE_PROJECT_ID') || 'type2learn-defcc',
    firebaseServiceAccountJson: value('FIREBASE_SERVICE_ACCOUNT_JSON'),
    openAiApiKey: value('OPENAI_API_KEY', 'openai', 'key'),
    openAiResponsesUrl: configuredOpenAiEndpoint.url,
    openAiProvider: configuredOpenAiEndpoint.provider,
    geminiChatApiKeys: geminiKeyPool('chat'),
    geminiHeavyApiKeys: geminiKeyPool('heavy'),
    geminiApiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    geminiChatModel: APPROVED_GEMINI_CHAT_MODEL,
    geminiHeavyModel: APPROVED_GEMINI_HEAVY_MODEL,
    // `speech` is supported only for the existing local api.env file. The
    // deployment variable is always the explicit SPEECHMATICS_API_KEY name.
    speechmaticsApiKey: value('SPEECHMATICS_API_KEY', 'speech'),
    openAiModel: APPROVED_OPENAI_MODEL,
    openAiTestGenerationModel: value('OPENAI_TEST_GENERATION_MODEL') || RESERVED_TEST_GENERATION_MODEL,
    adaptiveLearningEnabled: booleanFrom(value('ADAPTIVE_LEARNING_ENABLED')),
    // Assessment delivery always has an authored reserve bank, so learner
    // progress does not need to wait for a live model. Set this to false only
    // when assessments must be deliberately taken offline.
    aiAssessmentsEnabled: booleanFrom(value('AI_ASSESSMENTS_ENABLED'), true),
    aiVisualsEnabled: booleanFrom(value('AI_VISUALS_ENABLED')),
    // A zero cap makes every first request look as though the monthly budget
    // was spent. Treat accidental zero-valued deployment variables as absent
    // and retain the deliberately bounded defaults instead.
    // Live Course AI has its own learner allowance. Adaptive support and
    // assessment use separate buckets below; the fixed application buckets
    // total USD 25 and cannot spill into each other.
    openAiAppCapUsd: numberFrom(value('OPENAI_MONTHLY_APP_USD_CAP'), 10, { min: 0.01, max: 10 }),
    openAiUserCapUsd: numberFrom(value('OPENAI_MONTHLY_USER_USD_CAP'), 2, { min: 0.01, max: 2 }),
    adaptiveAppCapUsd: numberFrom(value('ADAPTIVE_MONTHLY_APP_USD_CAP'), 7, { min: 0.01, max: 7 }),
    adaptiveUserCapUsd: numberFrom(value('ADAPTIVE_MONTHLY_USER_USD_CAP'), 2, { min: 0.01, max: 2 }),
    assessmentAppCapUsd: numberFrom(value('OPENAI_ASSESSMENT_MONTHLY_APP_USD_CAP'), 8, { min: 0.01, max: 8 }),
    assessmentUserCapUsd: numberFrom(value('OPENAI_ASSESSMENT_MONTHLY_USER_USD_CAP'), 4, { min: 0.01, max: 4 }),
    // Assessment-bank generation is deliberately rare. A matching reviewer
    // allow-list is required before the draft/publish routes can be used.
    assessmentReviewerUids: new Set(splitIdentifiers(value('ASSESSMENT_REVIEWER_UIDS'))),
    assessmentGenerationIntervalMs: numberFrom(value('ASSESSMENT_GENERATION_INTERVAL_MS'), 60 * 60 * 1000, { min: 60 * 60 * 1000, max: 24 * 60 * 60 * 1000 }),
    assessmentMaxOutputTokens: numberFrom(value('ASSESSMENT_MAX_OUTPUT_TOKENS'), 5200, { min: 400, max: 6000 }),
    assessmentRequestsPerMinute: numberFrom(value('ASSESSMENT_REQUESTS_PER_MINUTE'), 3, { min: 1, max: 3 }),
    openAiAppInputTokenCap: numberFrom(value('OPENAI_MONTHLY_APP_INPUT_TOKEN_CAP'), 11200000, { min: 1, max: 11200000 }),
    openAiAppOutputTokenCap: numberFrom(value('OPENAI_MONTHLY_APP_OUTPUT_TOKEN_CAP'), 5600000, { min: 1, max: 5600000 }),
    openAiUserInputTokenCap: numberFrom(value('OPENAI_MONTHLY_USER_INPUT_TOKEN_CAP'), 1000000, { min: 1, max: 1000000 }),
    openAiUserOutputTokenCap: numberFrom(value('OPENAI_MONTHLY_USER_OUTPUT_TOKEN_CAP'), 500000, { min: 1, max: 500000 }),
    // GPT-5 nano text-token pricing. Keep the limits below separate from these
    // rates so a pricing change cannot expand the fixed application/user caps.
    openAiInputUsdPerMillion: numberFrom(value('OPENAI_INPUT_USD_PER_MILLION_TOKENS'), 0.05, { min: 0, max: 0.05 }),
    openAiCachedInputUsdPerMillion: numberFrom(value('OPENAI_CACHED_INPUT_USD_PER_MILLION_TOKENS'), 0.01, { min: 0, max: 0.01 }),
    openAiOutputUsdPerMillion: numberFrom(value('OPENAI_OUTPUT_USD_PER_MILLION_TOKENS'), 0.4, { min: 0, max: 0.4 }),
    openAiTestInputUsdPerMillion: numberFrom(value('OPENAI_TEST_INPUT_USD_PER_MILLION_TOKENS'), 0.25, { min: 0, max: 0.25 }),
    openAiTestCachedInputUsdPerMillion: numberFrom(value('OPENAI_TEST_CACHED_INPUT_USD_PER_MILLION_TOKENS'), 0.03, { min: 0, max: 0.03 }),
    openAiTestOutputUsdPerMillion: numberFrom(value('OPENAI_TEST_OUTPUT_USD_PER_MILLION_TOKENS'), 2, { min: 0, max: 2 }),
    openAiMaxOutputTokens: numberFrom(value('OPENAI_MAX_OUTPUT_TOKENS'), 320, { min: 32, max: 320 }),
    openAiRequestsPerMinute: numberFrom(value('OPENAI_REQUESTS_PER_MINUTE'), 12, { min: 1, max: 12 }),
    adaptiveRequestsPerMinute: numberFrom(value('ADAPTIVE_REQUESTS_PER_MINUTE'), 4, { min: 1, max: 4 }),
    speechmaticsMonthlyCreditCap: numberFrom(value('SPEECHMATICS_MONTHLY_CREDIT_CAP'), 180, { min: 0, max: 180 }),
    speechmaticsUserCreditCap: numberFrom(value('SPEECHMATICS_MONTHLY_USER_CREDIT_CAP'), 12, { min: 0, max: 12 }),
    speechmaticsCreditsPerMinute: numberFrom(value('SPEECHMATICS_CREDITS_PER_AUDIO_MINUTE'), 1, { min: 0.01, max: 10 }),
    speechmaticsRequestsPerMinute: numberFrom(value('SPEECHMATICS_REQUESTS_PER_MINUTE'), 6, { min: 1, max: 6 })
  };
};
