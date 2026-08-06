import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APPROVED_OPENAI_MODEL = 'gpt-5.1-codex-mini';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(here, '..');

const numberFrom = (value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
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
    // `speech` is supported only for the existing local api.env file. The
    // deployment variable is always the explicit SPEECHMATICS_API_KEY name.
    speechmaticsApiKey: value('SPEECHMATICS_API_KEY', 'speech'),
    openAiModel: APPROVED_OPENAI_MODEL,
    // A zero cap makes every first request look as though the monthly budget
    // was spent. Treat accidental zero-valued deployment variables as absent
    // and retain the deliberately bounded defaults instead.
    openAiAppCapUsd: numberFrom(value('OPENAI_MONTHLY_APP_USD_CAP'), 14, { min: 0.01, max: 14 }),
    openAiUserCapUsd: numberFrom(value('OPENAI_MONTHLY_USER_USD_CAP'), 2, { min: 0.01, max: 2 }),
    openAiAppInputTokenCap: numberFrom(value('OPENAI_MONTHLY_APP_INPUT_TOKEN_CAP'), 11200000, { min: 1, max: 11200000 }),
    openAiAppOutputTokenCap: numberFrom(value('OPENAI_MONTHLY_APP_OUTPUT_TOKEN_CAP'), 5600000, { min: 1, max: 5600000 }),
    openAiUserInputTokenCap: numberFrom(value('OPENAI_MONTHLY_USER_INPUT_TOKEN_CAP'), 1000000, { min: 1, max: 1000000 }),
    openAiUserOutputTokenCap: numberFrom(value('OPENAI_MONTHLY_USER_OUTPUT_TOKEN_CAP'), 500000, { min: 1, max: 500000 }),
    openAiInputUsdPerMillion: numberFrom(value('OPENAI_INPUT_USD_PER_MILLION_TOKENS'), 0.25, { min: 0, max: 0.25 }),
    openAiOutputUsdPerMillion: numberFrom(value('OPENAI_OUTPUT_USD_PER_MILLION_TOKENS'), 2, { min: 0, max: 2 }),
    openAiMaxOutputTokens: numberFrom(value('OPENAI_MAX_OUTPUT_TOKENS'), 320, { min: 32, max: 320 }),
    openAiRequestsPerMinute: numberFrom(value('OPENAI_REQUESTS_PER_MINUTE'), 12, { min: 1, max: 12 }),
    speechmaticsMonthlyCreditCap: numberFrom(value('SPEECHMATICS_MONTHLY_CREDIT_CAP'), 180, { min: 0, max: 180 }),
    speechmaticsUserCreditCap: numberFrom(value('SPEECHMATICS_MONTHLY_USER_CREDIT_CAP'), 12, { min: 0, max: 12 }),
    speechmaticsCreditsPerMinute: numberFrom(value('SPEECHMATICS_CREDITS_PER_AUDIO_MINUTE'), 1, { min: 0.01, max: 10 }),
    speechmaticsRequestsPerMinute: numberFrom(value('SPEECHMATICS_REQUESTS_PER_MINUTE'), 6, { min: 1, max: 6 })
  };
};
