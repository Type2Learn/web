import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { COURSE_CONTENT } from '../../course/course-content.js';
import { APPROVED_OPENAI_MODEL, RESERVED_TEST_GENERATION_MODEL, loadRuntimeConfig, parseEnvText } from '../../server/config.mjs';
import { createAiService } from '../../server/ai-service.mjs';
import { coursePageContext, normaliseConversation, normaliseLearnerMessage } from '../../server/course-context.mjs';
import { assessmentUsageEstimate, usageEstimate } from '../../server/usage-ledger.mjs';
import { createModelProvider } from '../../server/model-provider.mjs';
import {
  assessmentCurriculum,
  publicAssessmentItem,
  validateAssessmentAnswer,
  validateAssessmentBank,
  validateResponseEvaluation
} from '../../server/assessment-schemas.mjs';
import { createFallbackAssessmentBank } from '../../server/fallback-assessment-bank.mjs';

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
    assert.equal(production.openAiAppCapUsd, 10);
    assert.equal(production.adaptiveAppCapUsd, 7);
    assert.equal(production.adaptiveUserCapUsd, 2);
    assert.equal(production.assessmentAppCapUsd, 8);
    assert.equal(production.assessmentUserCapUsd, 4);
    assert.equal(production.openAiModel, 'gpt-5-nano');

    const development = await loadRuntimeConfig({ root, environment: { NODE_ENV: 'development' } });
    assert.equal(development.openAiApiKey, 'local-only-value');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('zero-valued AI allowance variables fall back to the bounded working defaults', async () => {
  const config = await loadRuntimeConfig({
    environment: {
      NODE_ENV: 'production',
      OPENAI_MONTHLY_APP_USD_CAP: '0',
      OPENAI_MONTHLY_USER_USD_CAP: '0',
      OPENAI_MONTHLY_APP_INPUT_TOKEN_CAP: '0',
      OPENAI_MONTHLY_APP_OUTPUT_TOKEN_CAP: '0',
      OPENAI_MONTHLY_USER_INPUT_TOKEN_CAP: '0',
      OPENAI_MONTHLY_USER_OUTPUT_TOKEN_CAP: '0'
    }
  });

  assert.equal(config.openAiAppCapUsd, 10);
  assert.equal(config.openAiUserCapUsd, 2);
  assert.equal(config.adaptiveAppCapUsd, 7);
  assert.equal(config.adaptiveUserCapUsd, 2);
  assert.equal(config.assessmentAppCapUsd, 8);
  assert.equal(config.assessmentUserCapUsd, 4);
  assert.equal(config.openAiAppInputTokenCap, 11200000);
  assert.equal(config.openAiAppOutputTokenCap, 5600000);
  assert.equal(config.openAiUserInputTokenCap, 1000000);
  assert.equal(config.openAiUserOutputTokenCap, 500000);
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
    assert.match(request.instructions, /Muhammad Taha Bin Zaeem, Founder and Product Direction/);
    assert.equal(settled.length, 1);
    assert.equal(settled[0].actual.inputTokens, 31);
    assert.equal(settled[0].actual.outputTokens, 7);

    await service.chat({
      authorization: 'Bearer test-token',
      body: {
        message: 'اس صفحے کا مرکزی خیال کیا ہے؟',
        history: [],
        courseId: COURSE_CONTENT.id,
        page: { moduleIndex: 0, phase: 'read' },
        language: 'ur'
      }
    });
    const urduRequest = JSON.parse(calls[1].options.body);
    assert.match(urduRequest.instructions, /Reply only in clear, standard Urdu written in Urdu script/);
    const urduPageFacts = urduRequest.instructions.split('Approved page facts:\n')[1];
    assert.match(urduPageFacts, /اے ڈی ایچ ڈی/);
    assert.doesNotMatch(urduPageFacts, /\bADHD\b/);
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

test('usage estimate uses the documented Nano price configuration and keeps Mini reserved', () => {
  const estimate = usageEstimate(1000000, 500000, { openAiInputUsdPerMillion: 0.05, openAiCachedInputUsdPerMillion: 0.01, openAiOutputUsdPerMillion: 0.4 }, 500000);
  // Half of the input is cached: .5m * .05 + .5m * .01 + .5m * .4.
  assert.equal(estimate, 0.23);
  assert.equal(APPROVED_OPENAI_MODEL, 'gpt-5-nano');
  assert.equal(RESERVED_TEST_GENERATION_MODEL, 'gpt-5.1-codex-mini');
  assert.notEqual(APPROVED_OPENAI_MODEL, RESERVED_TEST_GENERATION_MODEL);
});

test('assessment usage estimate applies the documented Mini price configuration', () => {
  const estimate = assessmentUsageEstimate(1000000, 500000, {
    openAiTestInputUsdPerMillion: 0.25,
    openAiTestCachedInputUsdPerMillion: 0.03,
    openAiTestOutputUsdPerMillion: 2
  }, 500000);
  // Half of the input is cached: .5m * .25 + .5m * .03 + .5m * $2.
  assert.ok(Math.abs(estimate - 1.14) < 0.000001);
});

test('Gemini key pools are primary, rotate after a quota failure, and retain OpenAI as fallback', async () => {
  const calls = [];
  const provider = createModelProvider({
    config: {
      geminiApiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      geminiChatApiKeys: ['first-key', 'second-key'],
      geminiHeavyApiKeys: ['heavy-key'],
      geminiChatModel: 'gemini-3.5-flash-lite',
      geminiHeavyModel: 'gemini-3.6-flash',
      openAiApiKey: 'openai-fallback',
      openAiResponsesUrl: 'https://api.openai.com/v1/responses',
      openAiProvider: 'openai',
      openAiModel: 'gpt-5-nano',
      openAiTestGenerationModel: 'gpt-5.1-codex-mini'
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('first-key')) return new Response(JSON.stringify({ error: { code: 429 } }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'A calm answer.' }] } }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 4 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });

  const result = await provider.generate({ purpose: 'chat', instructions: 'Safe instructions', input: 'Question', maxOutputTokens: 40 });
  assert.equal(result.provider, 'gemini');
  assert.equal(result.model, 'gemini-3.5-flash-lite');
  assert.equal(result.text, 'A calm answer.');
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.includes('first-key'));
  assert.ok(calls[1].url.includes('second-key'));
  assert.ok(!calls[0].options.body.includes('temperature'));
});

test('Gemini configuration accepts explicit pools, numbered keys, and legacy local aliases', async () => {
  const config = await loadRuntimeConfig({
    root: path.join(process.cwd(), 'tests', 'fixtures', 'missing-root'),
    environment: {
      GEMINI_CHAT_API_KEYS: 'chat-one, chat-two',
      GEMINI_CHAT_API_KEY_3: 'chat-three',
      GEMINI_TEST_API_KEYS: 'test-one',
      gemtext2: 'test-two'
    }
  });
  assert.deepEqual(config.geminiChatApiKeys, ['chat-one', 'chat-two', 'chat-three']);
  assert.deepEqual(config.geminiHeavyApiKeys, ['test-one', 'test-two']);
  assert.equal(config.geminiChatModel, 'gemini-3.5-flash-lite');
  assert.equal(config.geminiHeavyModel, 'gemini-3.6-flash');
});

test('heavy Gemini work uses the separate heavy key pool and model', async () => {
  const calls = [];
  const provider = createModelProvider({
    config: {
      geminiApiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      geminiChatApiKeys: ['chat-key'], geminiHeavyApiKeys: ['heavy-key'],
      geminiChatModel: 'gemini-3.5-flash-lite', geminiHeavyModel: 'gemini-3.6-flash'
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  const result = await provider.generate({ purpose: 'heavy', instructions: 'draft safely', input: 'source', maxOutputTokens: 300, jsonSchema: { type: 'object' } });
  assert.equal(result.provider, 'gemini');
  assert.equal(result.model, 'gemini-3.6-flash');
  assert.equal(provider.availableFor('heavy'), true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /gemini-3\.6-flash/);
  assert.match(calls[0].url, /heavy-key/);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.temperature, undefined);
});

test('assessment banks accept only approved objectives and never expose answer keys', () => {
  const curriculum = assessmentCurriculum(0, 'en');
  const objectiveId = curriculum.objectives[0].id;
  const bank = validateAssessmentBank({
    courseId: curriculum.courseId,
    curriculumVersion: curriculum.curriculumVersion,
    moduleIndex: curriculum.moduleIndex,
    language: curriculum.language,
    bankVersion: 'review-candidate-1',
    items: [
      {
        id: 'open-1', objectiveIds: [objectiveId], responseMode: 'open',
        prompt: 'In your own words, name one support that can make a task easier to begin.',
        options: [], correctOptionIndex: -1,
        answerGuide: 'A response can name visible steps, reminders, or another respectful support from the approved lesson.',
        rubric: ['Names a relevant support', 'Connects it to beginning or following a task'],
        feedback: 'Thank you for explaining your thinking. Continue when you are ready.'
      },
      {
        id: 'mcq-1', objectiveIds: [objectiveId], responseMode: 'mcq',
        prompt: 'Which approach can make a task easier to begin?',
        options: ['Visible steps and reminders', 'One very large undefined task', 'Removing all breaks', 'Expecting every step to be remembered'],
        correctOptionIndex: 0, answerGuide: '', rubric: [],
        feedback: 'Your choice is saved. Continue when you are ready.'
      }
    ],
    coverageMap: [{ objectiveId, itemIds: ['open-1', 'mcq-1'] }]
  }, curriculum);
  const publicItem = publicAssessmentItem(bank.items[1]);
  assert.equal(publicItem.correctOptionIndex, undefined);
  assert.equal(publicItem.answerGuide, undefined);
  assert.equal(publicItem.rubric, undefined);
  assert.deepEqual(validateAssessmentAnswer({ item: bank.items[1], answer: { optionIndex: 0 } }), { optionIndex: 0 });
  assert.throws(() => validateAssessmentAnswer({ item: bank.items[0], answer: { text: '' } }), /short response/i);
});

test('assessment evaluations reject answer-revealing feedback and unknown objectives', () => {
  const curriculum = assessmentCurriculum(0, 'en');
  const item = { objectiveIds: [curriculum.objectives[0].id] };
  assert.deepEqual(validateResponseEvaluation({
    outcome: 'demonstrated', demonstratedObjectiveIds: [curriculum.objectives[0].id], needsReviewObjectiveIds: [],
    feedback: 'Your explanation connects the idea to a helpful next step.'
  }, { item, curriculum }), {
    outcome: 'demonstrated', demonstratedObjectiveIds: [curriculum.objectives[0].id], needsReviewObjectiveIds: [],
    feedback: 'Your explanation connects the idea to a helpful next step.'
  });
  assert.throws(() => validateResponseEvaluation({
    outcome: 'demonstrated', demonstratedObjectiveIds: ['unknown-objective'], needsReviewObjectiveIds: [],
    feedback: 'The answer is visible steps and reminders.'
  }, { item, curriculum }), /could not be evaluated safely/i);
});

test('authored reserve provides a varied 32-item source bank for every module and a complete final review', () => {
  const moduleCurriculum = assessmentCurriculum(0, 'en');
  const reserveSamples = Array.from({ length: 5 }, () => createFallbackAssessmentBank(moduleCurriculum));
  const reserveIds = new Set(reserveSamples.flatMap((bank) => bank.items.map((item) => item.id)));
  assert.ok(reserveIds.size >= 12);
  reserveSamples.forEach((bank) => {
    const validated = validateAssessmentBank(bank, moduleCurriculum);
    assert.ok(validated.items.length >= 8 && validated.items.length <= 9);
    assert.ok(validated.items.filter((item) => item.responseMode === 'open').length === 4);
  });
  const finalCurriculum = assessmentCurriculum('final', 'en');
  const finalBank = validateAssessmentBank(createFallbackAssessmentBank(finalCurriculum), finalCurriculum);
  assert.equal(finalBank.items.length, 21);
  assert.equal(finalBank.items.filter((item) => item.responseMode === 'open').length, 9);
  assert.equal(finalBank.items.filter((item) => item.responseMode === 'mcq').length, 12);
});
