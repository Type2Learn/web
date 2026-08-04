import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { COURSE_CONTENT } from '../../course/course-content.js';
import { APPROVED_OPENAI_MODEL, loadRuntimeConfig, parseEnvText } from '../../server/config.mjs';
import { createAiService } from '../../server/ai-service.mjs';
import { coursePageContext, normaliseConversation, normaliseLearnerMessage } from '../../server/course-context.mjs';
import { usageEstimate } from '../../server/usage-ledger.mjs';

test('environment parser keeps comments out and reads quoted local values', () => {
  assert.deepEqual(parseEnvText('# comment\nONE=first\nTWO="second value"\n'), { ONE: 'first', TWO: 'second value' });
});

test('environment parser accepts a multi-line local Firebase service-account value', () => {
  const parsed = parseEnvText([
    'FIREBASE_SERVICE_ACCOUNT_JSON={',
    '  "type": "service_account",',
    '  "project_id": "example-project",',
    '  "client_email": "local@example-project.iam.gserviceaccount.com",',
    '  "token_uri": "https://oauth2.googleapis.com/token"',
    '}',
    'OPENAI_API_KEY=local-only-value'
  ].join('\n'));
  assert.equal(JSON.parse(parsed.FIREBASE_SERVICE_ACCOUNT_JSON).project_id, 'example-project');
  assert.equal(parsed.OPENAI_API_KEY, 'local-only-value');
});

test('production runtime never loads the local secret file and caps cannot be raised above policy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'type2learn-config-'));
  await mkdir(path.join(root, 'security'));
  await writeFile(path.join(root, 'security', 'api.env'), 'OPENAI_API_KEY=local-only-value\n');
  try {
    const production = await loadRuntimeConfig({
      root,
      environment: { NODE_ENV: 'production', OPENAI_MONTHLY_USER_USD_CAP: '999', OPENAI_MONTHLY_APP_USD_CAP: '999' }
    });
    assert.equal(production.openAiApiKey, '');
    assert.equal(production.openAiUserCapUsd, 2);
    assert.equal(production.openAiAppCapUsd, 14);
    assert.equal(production.openAiModel, 'gpt-5.1-codex-mini');

    const development = await loadRuntimeConfig({ root, environment: { NODE_ENV: 'development' } });
    assert.equal(development.openAiApiKey, 'local-only-value');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('development aliases accept a constrained Azure Responses endpoint without changing the approved model', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'type2learn-azure-config-'));
  await mkdir(path.join(root, 'security'));
  await writeFile(path.join(root, 'security', 'api.env'), [
    'key=unit-test-key',
    'url=https://unit-test.openai.azure.com/openai/responses?api-version=2025-04-01-preview'
  ].join('\n'));
  try {
    const config = await loadRuntimeConfig({ root, environment: { NODE_ENV: 'development' } });
    assert.equal(config.openAiApiKey, 'unit-test-key');
    assert.equal(config.openAiProvider, 'azure-openai');
    assert.equal(config.openAiResponsesUrl, 'https://unit-test.openai.azure.com/openai/responses?api-version=2025-04-01-preview');
    assert.equal(config.openAiModel, APPROVED_OPENAI_MODEL);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Azure Responses calls use api-key, the exact approved model, and parse Azure output text', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const reservation = { month: '2026-08', reservationId: 'unit-reservation' };
  const settled = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'A clear answer.' }] }],
      usage: { input_tokens: 31, output_tokens: 7 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const service = createAiService({
      config: {
        openAiApiKey: 'unit-test-key',
        openAiResponsesUrl: 'https://unit-test.openai.azure.com/openai/responses?api-version=2025-04-01-preview',
        openAiProvider: 'azure-openai',
        openAiModel: APPROVED_OPENAI_MODEL,
        openAiMaxOutputTokens: 64,
        openAiInputUsdPerMillion: .25,
        openAiOutputUsdPerMillion: 2,
        openAiAppCapUsd: 14,
        openAiAppInputTokenCap: 11200000,
        openAiAppOutputTokenCap: 5600000,
        openAiUserCapUsd: 2,
        openAiUserInputTokenCap: 1000000,
        openAiUserOutputTokenCap: 500000,
        openAiRequestsPerMinute: 12
      },
      firebase: {
        available: true,
        verifyBearer: async (authorization) => {
          assert.equal(authorization, 'Bearer test-token');
          return { uid: 'learner-1' };
        }
      },
      ledger: {
        reserve: async () => reservation,
        settle: async (details) => settled.push(details),
        release: async () => assert.fail('successful request must not release its reservation')
      }
    });
    const result = await service.chat({
      authorization: 'Bearer test-token',
      body: {
        message: 'What does this page introduce?',
        history: [],
        courseId: COURSE_CONTENT.id,
        page: { moduleIndex: 0, phase: 'read' },
        language: 'en'
      }
    });
    assert.deepEqual(result, { reply: 'A clear answer.' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers['api-key'], 'unit-test-key');
    assert.equal(calls[0].options.headers.Authorization, undefined);
    const request = JSON.parse(calls[0].options.body);
    assert.equal(request.model, APPROVED_OPENAI_MODEL);
    assert.equal(request.store, false);
    assert.equal(request.max_output_tokens, 64);
    assert.equal(settled.length, 1);
    assert.equal(settled[0].actual.inputTokens, 31);
    assert.equal(settled[0].actual.outputTokens, 7);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('course context limits model facts to the current page and excludes assessment options', () => {
  const context = coursePageContext({
    courseId: COURSE_CONTENT.id,
    page: { moduleIndex: 0, phase: 'check' },
    language: 'en'
  });
  const approvedFacts = context.facts.join(' ');
  const firstOption = String(COURSE_CONTENT.steps[0].check.options[0][0]);
  assert.equal(context.phase, 'check');
  assert.equal(approvedFacts.includes(firstOption), false);
  assert.ok(approvedFacts.length > 0);
});

test('learner chat input and history stay bounded', () => {
  const long = 'a'.repeat(1200);
  assert.equal(normaliseLearnerMessage(long).length, 900);
  const history = normaliseConversation(Array.from({ length: 9 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: long })));
  assert.equal(history.length, 6);
  assert.ok(history.every((entry) => entry.content.length === 650));
});

test('usage estimate uses the documented input and output price configuration', () => {
  const estimate = usageEstimate(1000000, 500000, { openAiInputUsdPerMillion: 0.25, openAiOutputUsdPerMillion: 2 });
  assert.equal(estimate, 1.25);
  assert.equal(APPROVED_OPENAI_MODEL, 'gpt-5.1-codex-mini');
});
