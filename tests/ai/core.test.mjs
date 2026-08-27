import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { COURSE_CONTENT } from '../../course/course-content.js';
import { APPROVED_OPENAI_MINI_MODEL, APPROVED_OPENAI_MODEL, RESERVED_TEST_GENERATION_MODEL, loadRuntimeConfig, parseEnvText } from '../../server/config.mjs';
import { createAiService } from '../../server/ai-service.mjs';
import { createAdaptiveRecallService } from '../../server/adaptive-recall-service.mjs';
import { createModelProvider } from '../../server/model-provider.mjs';
import { adaptiveRecallContext, coursePageContext, createCourseContextResolver, normaliseConversation, normaliseLearnerMessage } from '../../server/course-context.mjs';
import { migratedLegacyTheoryCourse } from '../../server/legacy-neurodivergent-migration.mjs';
import { createFallbackAssessmentBank } from '../../server/fallback-assessment-bank.mjs';
import { assessmentCurriculum, publicAssessmentItem, validateAssessmentBank } from '../../server/assessment-schemas.mjs';
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
    assert.equal(production.openAiModel, 'gpt-5.4-nano');
    assert.equal(production.openAiMiniModel, 'gpt-5.4-mini');
    assert.equal(production.allowGuestAi, true, 'the public course demo keeps its bounded guest helper enabled');

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

  assert.equal(config.openAiAppCapUsd, 14);
  assert.equal(config.openAiUserCapUsd, 2);
  assert.equal(config.openAiAppInputTokenCap, 11200000);
  assert.equal(config.openAiAppOutputTokenCap, 5600000);
  assert.equal(config.openAiUserInputTokenCap, 1000000);
  assert.equal(config.openAiUserOutputTokenCap, 500000);
});

test('Supabase backup origin accepts one accidental dashboard equals sign but rejects non-HTTPS input', async () => {
  const repaired = await loadRuntimeConfig({ environment: { NODE_ENV: 'production', SUPABASE_BACKUP_URL: '=https://private.example.co/path' } });
  const rejected = await loadRuntimeConfig({ environment: { NODE_ENV: 'production', SUPABASE_BACKUP_URL: 'http://not-private.example.co' } });
  assert.equal(repaired.supabaseBackupUrl, 'https://private.example.co');
  assert.equal(rejected.supabaseBackupUrl, '');
});

test('Gemini aliases and numbered keys are all retained for server-side rotation', async () => {
  const config = await loadRuntimeConfig({
    environment: {
      NODE_ENV: 'production',
      gemchat: 'test-gemini-key-one',
      gemtext: 'test-gemini-key-two',
      gemchat1: 'test-gemini-key-three',
      gemtest1: 'test-gemini-key-four',
      GEMINI_API_KEY_1: 'test-gemini-key-five'
    }
  });
  assert.deepEqual(config.geminiApiKeys, ['test-gemini-key-one', 'test-gemini-key-two', 'test-gemini-key-three', 'test-gemini-key-four', 'test-gemini-key-five']);
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

test('a Type2Learn team question uses the complete reviewed fact set without a model call', async () => {
  let providerCalls = 0;
  const service = createAiService({
    config: {},
    firebase: {
      available: true,
      verifyBearer: async (authorization) => {
        assert.equal(authorization, 'Bearer learner-token');
        return { uid: 'learner-1' };
      }
    },
    provider: {
      status: () => ({ available: false }),
      generate: async () => {
        providerCalls += 1;
        throw new Error('A public team fact must not reach a model.');
      }
    }
  });

  const english = await service.chat({
    authorization: 'Bearer learner-token',
    body: { message: 'Who is on the Type2Learn team?', language: 'en', courseId: COURSE_CONTENT.id, page: { moduleIndex: 0, phase: 'read' } }
  });
  assert.equal(english.reply, 'Type2Learn was founded by six CEME students: Muhammad Taha Bin Zaeem (Development Lead), Muhammad Hamiz Bin Kashif (Engineering Lead), Muhammad Fahad Younus (AI Lead), Idrees Babar (Research Lead), Alizay Hassan (Product Lead), and Lameea Mubashir Khan (UI/UX Design Lead).');
  assert.equal(providerCalls, 0);

  const urdu = await service.chat({
    authorization: 'Bearer learner-token',
    body: { message: 'ٹائپ ٹو لرن کی ٹیم کون ہے؟', language: 'ur', courseId: COURSE_CONTENT.id, page: { moduleIndex: 0, phase: 'read' } }
  });
  assert.match(urdu.reply, /محمد طٰہٰ بن زعیم/);
  assert.match(urdu.reply, /لمیعہ مبشر خان/);
  assert.equal(providerCalls, 0);
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
        companionRole: 'learning-partner',
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
    assert.match(request.instructions, /team of six CEME students/);
    assert.match(request.instructions, /Muhammad Taha Bin Zaeem \(Development Lead\)/);
    assert.match(request.instructions, /Lameea Mubashir Khan \(UI\/UX Design Lead\)/);
    assert.match(request.instructions, /fictional bunny learning partner/);
    assert.match(request.instructions, /working alongside the learner/);
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

test('structured adaptive work uses its OpenAI role only after Gemini is unavailable, and final-bank work keeps the reserved 5.1 model', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith('https://generativelanguage.googleapis.com/')) {
      return new Response(JSON.stringify({ error: { message: 'temporary Gemini quota' } }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }
    if (!String(url).startsWith('https://api.openai.com/')) throw new Error('Only the configured Gemini and OpenAI endpoints may be contacted.');
    return new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }],
      usage: { input_tokens: 10, output_tokens: 5 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const provider = createModelProvider({
      geminiApiKeys: ['unused-gemini-test-key'], geminiFastModel: 'gemini-3.5-flash-lite', geminiHeavyModel: 'gemini-3.6-flash', geminiMaxOutputTokens: 420,
      openAiApiKey: 'unit-test-key', openAiResponsesUrl: 'https://api.openai.com/v1/responses', openAiProvider: 'openai',
      openAiModel: APPROVED_OPENAI_MODEL, openAiMiniModel: APPROVED_OPENAI_MINI_MODEL, openAiTestModel: RESERVED_TEST_GENERATION_MODEL
    });
    await provider.generate({ purpose: 'adaptive-recall', instructions: 'Return JSON.', input: '{}', maxOutputTokens: 50, jsonSchema: { type: 'object' } });
    await provider.generate({ purpose: 'final-assessment-generation', instructions: 'Return JSON.', input: '{}', maxOutputTokens: 50, jsonSchema: { type: 'object' } });
    const openAiCalls = calls.filter((call) => call.url.startsWith('https://api.openai.com/'));
    assert.equal(JSON.parse(openAiCalls[0].options.body).model, APPROVED_OPENAI_MINI_MODEL);
    assert.equal(JSON.parse(openAiCalls[1].options.body).model, RESERVED_TEST_GENERATION_MODEL);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('signed-in Course AI uses the shared Gemini-first provider before an unavailable OpenAI fallback', async () => {
  const settled = [];
  const service = createAiService({
    config: {
      openAiApiKey: '',
      openAiResponsesUrl: '',
      openAiModel: APPROVED_OPENAI_MODEL,
      openAiMaxOutputTokens: 120,
      openAiInputUsdPerMillion: .05,
      openAiOutputUsdPerMillion: .4,
      openAiAppCapUsd: 14,
      openAiAppInputTokenCap: 11200000,
      openAiAppOutputTokenCap: 5600000,
      openAiUserCapUsd: 2,
      openAiUserInputTokenCap: 1000000,
      openAiUserOutputTokenCap: 500000,
      openAiRequestsPerMinute: 12,
      allowLocalGuestAi: false
    },
    firebase: { available: true, verifyBearer: async () => ({ uid: 'gemini-first-learner' }) },
    ledger: {
      reserve: async () => ({ month: '2026-08', reservationId: 'gemini-first-test' }),
      settle: async (details) => settled.push(details),
      release: async () => assert.fail('a successful Gemini reply must settle its reservation')
    },
    provider: {
      status: () => ({ available: true, primary: 'gemini', chatModel: 'gemini-3.5-flash-lite' }),
      generate: async () => ({
        text: 'Try naming one helpful next step.',
        provider: 'gemini',
        usage: { inputTokens: 22, outputTokens: 9 }
      })
    }
  });
  const result = await service.chat({
    authorization: 'Bearer test-token',
    body: { message: 'I am stuck.', history: [], courseId: COURSE_CONTENT.id, page: { moduleIndex: 0, phase: 'read' }, language: 'en' }
  });
  assert.equal(result.reply, 'Try naming one helpful next step.');
  assert.equal(service.status().provider, 'gemini');
  assert.equal(settled.length, 1);
  assert.equal(settled[0].actual.usd, 0);
});

test('guest Course AI uses only bundled public context and never requests a reviewed manifest', async () => {
  const service = createAiService({
    config: {
      allowGuestAi: true,
      openAiApiKey: '', openAiResponsesUrl: '', openAiModel: APPROVED_OPENAI_MODEL,
      openAiMaxOutputTokens: 120, openAiInputUsdPerMillion: .05, openAiOutputUsdPerMillion: .4,
      openAiAppCapUsd: 14, openAiAppInputTokenCap: 11200000, openAiAppOutputTokenCap: 5600000,
      openAiUserCapUsd: 2, openAiUserInputTokenCap: 1000000, openAiUserOutputTokenCap: 500000,
      openAiRequestsPerMinute: 12
    },
    firebase: { available: true, verifyBearer: async () => assert.fail('guest Course AI must not verify a bearer token') },
    ledger: {
      reserve: async () => ({ month: '2026-08', reservationId: 'local-guest-preview' }),
      settle: async () => {}, release: async () => assert.fail('successful guest preview must settle')
    },
    provider: {
      status: () => ({ available: true, primary: 'gemini', chatModel: 'gemini-3.5-flash-lite' }),
      generate: async ({ instructions }) => {
        assert.match(instructions, /Current module:/);
        return { text: 'Start with one visible idea.', provider: 'gemini', usage: { inputTokens: 12, outputTokens: 7 } };
      }
    },
    contextResolver: { resolve: async () => assert.fail('guest Course AI must not load a private manifest') }
  });
  const result = await service.chat({
    localGuest: { uid: 'guest-local-preview', isGuest: true },
    body: { message: 'How can I begin?', history: [], courseId: COURSE_CONTENT.id, page: { moduleIndex: 0, phase: 'read' }, language: 'en' }
  });
  assert.equal(result.reply, 'Start with one visible idea.');
  assert.equal(service.status().guestAccess, true);
  assert.equal(service.status().requiresSignIn, false);
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

test('reviewed-course context is reloaded from the authorised learner manifest and excludes targets and options', async () => {
  const { learnerManifest } = migratedLegacyTheoryCourse();
  const manifest = structuredClone(learnerManifest);
  manifest.id = 'teacher-reviewed-course';
  manifest.version = '2.4';
  let request = null;
  const resolver = createCourseContextResolver({
    courseCatalog: {
      manifest: async (value) => {
        request = value;
        return { manifest };
      }
    }
  });
  const context = await resolver.resolve({
    authorization: 'Bearer reviewed-learner',
    body: {
      courseId: manifest.id,
      courseVersion: manifest.version,
      page: { moduleIndex: 0, phase: 'read' },
      language: 'en'
    }
  });
  assert.deepEqual(request, { authorization: 'Bearer reviewed-learner', courseId: manifest.id, version: manifest.version });
  assert.equal(context.title, manifest.modules[0].en.title);
  const supplied = context.facts.join(' ');
  assert.equal(supplied.includes(manifest.modules[0].en.typing.target), false);
  assert.equal(supplied.includes(manifest.modules[0].en.check.options[0]), false);
  assert.ok(supplied.includes(manifest.modules[0].en.content.definition));
});

test('reviewed-course context rejects a catalogue manifest that does not match the requested version', async () => {
  const { learnerManifest } = migratedLegacyTheoryCourse();
  const resolver = createCourseContextResolver({ courseCatalog: { manifest: async () => ({ manifest: learnerManifest }) } });
  await assert.rejects(
    resolver.resolve({
      authorization: 'Bearer reviewed-learner',
      body: { courseId: 'other-reviewed-course', courseVersion: '9.9', page: { moduleIndex: 0, phase: 'read' }, language: 'en' }
    }),
    (error) => error?.code === 'COURSE_MANIFEST_MISMATCH'
  );
});

test('an explicit reviewed version for the historic course re-authorises the manifest instead of using static context', async () => {
  const { learnerManifest } = migratedLegacyTheoryCourse();
  let calls = 0;
  const resolver = createCourseContextResolver({
    courseCatalog: {
      manifest: async () => {
        calls += 1;
        return { manifest: learnerManifest };
      }
    }
  });
  const context = await resolver.resolve({
    authorization: 'Bearer reviewed-learner',
    body: {
      courseId: COURSE_CONTENT.id,
      courseVersion: learnerManifest.version,
      page: { moduleIndex: 0, phase: 'read' },
      language: 'en'
    }
  });
  assert.equal(calls, 1);
  assert.equal(context.title, learnerManifest.modules[0].en.title);
});

test('learner chat input and history stay bounded', () => {
  const long = 'a'.repeat(1200);
  assert.equal(normaliseLearnerMessage(long).length, 900);
  const history = normaliseConversation(Array.from({ length: 9 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: long })));
  assert.equal(history.length, 6);
  assert.ok(history.every((entry) => entry.content.length === 650));
});

test('adaptive recall keeps evidence scoped to the current module and returns structured feedback', async () => {
  const settled = [];
  const service = createAdaptiveRecallService({
    config: {
      openAiInputUsdPerMillion: .05,
      openAiOutputUsdPerMillion: .4,
      openAiAppCapUsd: 14,
      openAiAppInputTokenCap: 11200000,
      openAiAppOutputTokenCap: 5600000,
      openAiUserCapUsd: 2,
      openAiUserInputTokenCap: 1000000,
      openAiUserOutputTokenCap: 500000,
      openAiRequestsPerMinute: 12
    },
    firebase: { available: true, verifyBearer: async () => ({ uid: 'adaptive-learner' }) },
    ledger: {
      reserve: async () => ({ month: '2026-08', reservationId: 'adaptive-test' }),
      settle: async (details) => settled.push(details),
      release: async () => assert.fail('successful adaptive response must not release its reservation')
    },
    provider: {
      status: () => ({ available: true }),
      generate: async () => ({
        text: JSON.stringify({
          evidence_found: ['mentions attention'],
          missing_concept: 'planning can also be affected',
          support_mode: 'hint',
          feedback: 'You connected ADHD with attention. Add one idea about planning next.',
          next_prompt: 'How could planning affect the first step of a task?',
          improvement: ''
        }),
        usage: { inputTokens: 40, outputTokens: 32 }
      })
    }
  });
  const response = await service.analyse({
    authorization: 'Bearer test-token',
    body: {
      courseId: COURSE_CONTENT.id,
      page: { moduleIndex: 0, phase: 'type' },
      language: 'en',
      response: 'It can affect attention.'
    }
  });
  assert.equal(response.source, 'adaptive-recall');
  assert.equal(response.result.support_mode, 'hint');
  assert.deepEqual(response.result.evidence_found, ['mentions attention']);
  assert.equal(settled.length, 1);
});

test('local guest adaptive recall stays on public bundled context', async () => {
  const service = createAdaptiveRecallService({
    config: {
      openAiInputUsdPerMillion: .05, openAiOutputUsdPerMillion: .4,
      openAiAppCapUsd: 14, openAiAppInputTokenCap: 11200000, openAiAppOutputTokenCap: 5600000,
      openAiUserCapUsd: 2, openAiUserInputTokenCap: 1000000, openAiUserOutputTokenCap: 500000,
      openAiRequestsPerMinute: 12
    },
    firebase: { available: true, verifyBearer: async () => assert.fail('local guest preview must not verify a token') },
    ledger: { reserve: async () => ({ month: '2026-08', reservationId: 'guest-adaptive' }), settle: async () => {}, release: async () => assert.fail('valid guest result must settle') },
    provider: {
      status: () => ({ available: true }),
      generate: async () => ({
        text: JSON.stringify({ evidence_found: ['mentions attention'], missing_concept: 'planning can also be affected', support_mode: 'hint', feedback: 'You named attention. Add one idea about planning.', next_prompt: 'How could planning affect the first step?', improvement: '' }),
        usage: { inputTokens: 30, outputTokens: 20 }
      })
    },
    contextResolver: { resolve: async () => assert.fail('local guest preview must not resolve a private manifest') }
  });
  const result = await service.analyse({
    localGuest: { uid: 'guest-adaptive-preview', isGuest: true },
    body: { courseId: COURSE_CONTENT.id, page: { moduleIndex: 0, phase: 'type' }, language: 'en', response: 'It can affect attention.' }
  });
  assert.equal(result.source, 'adaptive-recall');
  assert.equal(result.result.support_mode, 'hint');
});

test('adaptive recall context has no assessment answers or exact typing target', () => {
  const context = adaptiveRecallContext({
    courseId: COURSE_CONTENT.id,
    page: { moduleIndex: 0, phase: 'type' },
    language: 'en',
    response: 'A learner response',
    behaviourStates: ['re-reading', 'not-a-real-state', 'working-through-typing']
  });
  const supplied = context.outline.join(' ');
  assert.equal(supplied.includes(COURSE_CONTENT.steps[0].typing.target), false);
  assert.equal(supplied.includes(String(COURSE_CONTENT.steps[0].check.options[0][0])), false);
  assert.deepEqual(context.supportStates, ['re-reading', 'working-through-typing']);
});

test('authored module assessment reserve is deterministic, bounded, and keeps answer keys server-only', () => {
  const curriculum = assessmentCurriculum(0, 'en');
  const first = createFallbackAssessmentBank(curriculum);
  const second = createFallbackAssessmentBank(curriculum);
  assert.deepEqual(first, second);
  const bank = validateAssessmentBank(first, curriculum);
  assert.equal(bank.items.filter((item) => item.responseMode === 'open').length, 4);
  assert.equal(bank.items.filter((item) => item.responseMode === 'mcq').length, 5);
  const publicItem = publicAssessmentItem(bank.items.find((item) => item.responseMode === 'mcq'));
  assert.equal(Object.hasOwn(publicItem, 'correctOptionIndex'), false);
  assert.equal(Object.hasOwn(publicItem, 'answerGuide'), false);
  assert.equal(Object.hasOwn(publicItem, 'rubric'), false);
});

test('authored final assessment reserve provides the requested calm question limits', () => {
  const curriculum = assessmentCurriculum('final', 'en');
  const bank = validateAssessmentBank(createFallbackAssessmentBank(curriculum), curriculum);
  assert.equal(bank.items.filter((item) => item.responseMode === 'open').length, 9);
  assert.equal(bank.items.filter((item) => item.responseMode === 'mcq').length, 12);
  assert.equal(bank.items.length, 21);
});

test('model roles keep nano, mini, and final assessment generation distinct', () => {
  const estimate = usageEstimate(1000000, 500000, { openAiInputUsdPerMillion: 0.05, openAiOutputUsdPerMillion: 0.4 });
  assert.equal(estimate, 0.25);
  assert.equal(APPROVED_OPENAI_MODEL, 'gpt-5.4-nano');
  assert.equal(APPROVED_OPENAI_MINI_MODEL, 'gpt-5.4-mini');
  assert.equal(RESERVED_TEST_GENERATION_MODEL, 'gpt-5.1');
  assert.notEqual(APPROVED_OPENAI_MODEL, RESERVED_TEST_GENERATION_MODEL);
  assert.notEqual(APPROVED_OPENAI_MINI_MODEL, RESERVED_TEST_GENERATION_MODEL);
});
