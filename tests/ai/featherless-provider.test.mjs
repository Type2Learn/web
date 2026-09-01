import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createModelProvider } from '../../server/model-provider.mjs';

const baseConfig = (overrides = {}) => ({
  geminiApiKeys: [],
  geminiFastModel: 'gemini-3.5-flash-lite',
  geminiHeavyModel: 'gemini-3.6-flash',
  geminiMaxOutputTokens: 420,
  featherlessApiKey: 'featherless-test-key',
  featherlessChatCompletionsUrl: 'https://api.featherless.ai/v1/chat/completions',
  featherlessModel: 'account-selected-model',
  featherlessMaxConcurrentRequests: 1,
  openAiApiKey: '',
  openAiResponsesUrl: '',
  openAiProvider: 'openai',
  openAiModel: 'gpt-5.4-nano',
  openAiMiniModel: 'gpt-5.4-mini',
  openAiTestModel: 'gpt-5.1',
  ...overrides
});

test('Featherless is the configured middle provider and its credential stays server-side', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"safe":true}' } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const provider = createModelProvider(baseConfig());
    const result = await provider.generate({ purpose: 'adaptive-support', instructions: 'Return JSON.', input: '{}', maxOutputTokens: 40 });
    assert.equal(result.provider, 'featherless');
    assert.equal(result.text, '{"safe":true}');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.featherless.ai/v1/chat/completions');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer featherless-test-key');
    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.model, 'account-selected-model');
    assert.equal(payload.max_tokens, 40);
    const status = provider.status();
    assert.equal(status.primary, 'featherless');
    assert.equal(status.featherless.available, true);
    assert.equal(status.featherless.maxConcurrentRequests, 1);
    assert.equal(JSON.stringify(status).includes('featherless-test-key'), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('a busy Featherless unit immediately falls through to OpenAI rather than queueing learners', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  let resolveFeatherless;
  const featherlessPending = new Promise((resolve) => { resolveFeatherless = resolve; });
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    if (String(url).includes('featherless.ai')) return featherlessPending;
    return new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"fallback":"openai"}' }] }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const provider = createModelProvider(baseConfig({
      openAiApiKey: 'openai-test-key',
      openAiResponsesUrl: 'https://api.openai.com/v1/responses'
    }));
    const first = provider.generate({ instructions: 'First.', input: '{}', maxOutputTokens: 40 });
    await new Promise((resolve) => setImmediate(resolve));
    const second = await provider.generate({ instructions: 'Second.', input: '{}', maxOutputTokens: 40 });
    assert.equal(second.provider, 'openai');
    assert.equal(calls.filter((url) => url.includes('featherless.ai')).length, 1);
    assert.equal(calls.filter((url) => url.includes('api.openai.com')).length, 1);
    resolveFeatherless(new Response(JSON.stringify({ choices: [{ message: { content: 'first answer' } }] }), { status: 200 }));
    assert.equal((await first).provider, 'featherless');
    assert.equal(provider.status().featherless.inFlight, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('a failed Gemini attempt uses Featherless before OpenAI', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('generativelanguage.googleapis.com')) return new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429 });
    if (String(url).includes('featherless.ai')) return new Response(JSON.stringify({ choices: [{ message: { content: 'middle fallback' } }] }), { status: 200 });
    throw new Error('OpenAI must not be reached while Featherless succeeds.');
  };
  try {
    const provider = createModelProvider(baseConfig({
      geminiApiKeys: ['gemini-test-key'],
      openAiApiKey: 'openai-test-key',
      openAiResponsesUrl: 'https://api.openai.com/v1/responses'
    }));
    const result = await provider.generate({ instructions: 'Answer.', input: '{}', maxOutputTokens: 40 });
    assert.equal(result.provider, 'featherless');
    assert.match(calls[0], /generativelanguage\.googleapis\.com/);
    assert.match(calls[1], /featherless\.ai/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('a bounded authoring request tries one Gemini key before continuing through its configured fallbacks', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('generativelanguage.googleapis.com')) return new Response(JSON.stringify({ error: { message: 'temporarily unavailable' } }), { status: 503 });
    if (String(url).includes('api.openai.com')) return new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"markdown":"review draft"}' }] }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    throw new Error(`Unexpected provider call: ${url}`);
  };
  try {
    const provider = createModelProvider(baseConfig({
      geminiApiKeys: ['first-gemini-key', 'second-gemini-key', 'third-gemini-key'],
      featherlessApiKey: '', featherlessChatCompletionsUrl: '', featherlessModel: '',
      openAiApiKey: 'openai-test-key', openAiResponsesUrl: 'https://api.openai.com/v1/responses'
    }));
    const result = await provider.generate({
      purpose: 'course-authoring-conversion', instructions: 'Convert.', input: '{}', maxOutputTokens: 600,
      maxGeminiAttempts: 1, timeoutMs: 7_000
    });
    assert.equal(result.provider, 'openai');
    assert.equal(calls.filter((url) => url.includes('generativelanguage.googleapis.com')).length, 1);
    assert.equal(calls.filter((url) => url.includes('api.openai.com')).length, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('private course conversion may use the bounded extended output allowance while ordinary learner requests stay small', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"markdown":"draft"}' } }] }), { status: 200 });
  };
  try {
    const provider = createModelProvider(baseConfig({ courseAuthoringMaxOutputTokens: 3600 }));
    await provider.generate({ purpose: 'course-authoring-conversion', instructions: 'Convert.', input: '{}', maxOutputTokens: 5000 });
    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.max_tokens, 3600);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('feature health advertises the exact offline and PSL capability boundary', async () => {
  const source = await readFile(new URL('../../server.mjs', import.meta.url), 'utf8');
  assert.match(source, /release:\s*\{/);
  assert.match(source, /RENDER_GIT_COMMIT/);
  assert.match(source, /RENDER_GIT_BRANCH/);
  assert.match(source, /offlineLearning:/);
  assert.match(source, /public-course-learner-controls-and-local-narration/);
  assert.match(source, /english-and-urdu-local-mp3/);
  assert.match(source, /signLanguage:/);
  assert.match(source, /pslTemporalTranslation: false/);
});
