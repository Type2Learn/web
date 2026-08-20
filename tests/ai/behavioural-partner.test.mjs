import assert from 'node:assert/strict';
import test from 'node:test';
import { directiveForContext } from '../../server/behavioural-partner-service.mjs';
import { createModelProvider } from '../../server/model-provider.mjs';
import { adaptiveCandidateForSummary } from '../../server/adaptive-policy.mjs';
import { assessmentLearningSignals, prioritiseAssessmentItems } from '../../server/assessment-monitor.mjs';

const context = (overrides = {}) => ({
  moduleIndex: 0, phase: 'type', language: 'en', layout: 'balanced',
  enabled: true, role: 'learning-partner', presence: 'available', proactive: true,
  dismissed: false, objectiveIds: ['module-0-core'], supportHistory: { accepted: 0, dismissed: 0 },
  signals: { delayedStart: false, returned: false, rereads: false, longReading: false, longTypingPause: true, retries: true, aiRequests: false, noTaskMovement: false, completed: false, assessmentUncertainty: false },
  ...overrides
});

test('behavioural policy requires two neutral signals and never creates a learner label', () => {
  assert.equal(directiveForContext(context({ signals: { ...context().signals, retries: false } })), null);
  const directive = directiveForContext(context());
  assert.equal(directive.role, 'learning-partner');
  assert.equal(directive.action, 'teach-partner');
  assert.match(directive.message, /attention can feel different/i);
  assert.equal(Object.hasOwn(directive, 'score'), false);
});

test('assessment partner support remains process-only', () => {
  const directive = directiveForContext(context({ phase: 'assessment' }));
  assert.match(directive.message, /process/i);
  assert.doesNotMatch(directive.message, /correct answer|option/i);
});

test('published-course partner wording never inherits the historic condition script', () => {
  const directive = directiveForContext(context({ courseId: 'published-learning-course', courseVersion: '1.0', moduleTitle: 'Learning through examples', signals: { ...context().signals } }));
  assert.match(directive.message, /Learning through examples/i);
  assert.match(directive.message, /next idea/i);
  assert.doesNotMatch(directive.message, /attention can feel different/i);
});

test('published-course partner asks for a connection without supplying a support or answer', () => {
  const directive = directiveForContext(context({ courseId: 'published-learning-course', courseVersion: '1.0', moduleTitle: 'Reading source material' }));
  assert.match(directive.message, /Reading source material/i);
  assert.match(directive.message, /explain one connection/i);
  assert.doesNotMatch(directive.message, /support|correct answer|option/i);
});

test('consented support states can inform a reversible proposal but not a learner result', () => {
  const candidate = adaptiveCandidateForSummary({
    phase: 'read', metrics: {}, behaviour: { states: ['re-reading'] }
  });
  assert.equal(candidate?.id, 'reading-width-narrow');
  const signals = assessmentLearningSignals({ metrics: {}, support: {}, behaviour: { states: ['working-through-typing'] } });
  assert.equal(signals.supportState, 'expression');
  const ordered = prioritiseAssessmentItems({
    runId: 'safe-order', signals,
    items: [{ id: 'open', responseMode: 'open' }, { id: 'mcq', responseMode: 'mcq' }]
  });
  assert.equal(ordered[0], 'open');
});

test('behavioural partner routes Gemini first and does not select Mini', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"message":"Start with one sentence."}' }] } }],
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 7 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const provider = createModelProvider({
      geminiApiKeys: ['unit-key'], geminiFastModel: 'gemini-3.5-flash-lite', geminiHeavyModel: 'gemini-3.6-flash', geminiMaxOutputTokens: 120,
      openAiApiKey: 'openai-unit', openAiResponsesUrl: 'https://api.openai.com/v1/responses', openAiProvider: 'openai',
      openAiModel: 'gpt-5.4-nano', openAiMiniModel: 'gpt-5.4-mini', openAiTestModel: 'gpt-5.1'
    });
    const result = await provider.generate({ purpose: 'behavioural-partner', instructions: 'Return JSON.', input: '{}', maxOutputTokens: 80, jsonSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } });
    assert.equal(result.provider, 'gemini');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
    assert.match(calls[0].url, /gemini-3\.5-flash-lite/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('behavioural partner can use Nano only to repair a malformed Gemini contract', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    return new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"message":"Use one visible sentence first."}' }] }],
      usage: { input_tokens: 8, output_tokens: 7 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const provider = createModelProvider({
      geminiApiKeys: ['unit-key'], geminiFastModel: 'gemini-3.5-flash-lite', geminiHeavyModel: 'gemini-3.6-flash', geminiMaxOutputTokens: 120,
      openAiApiKey: 'openai-unit', openAiResponsesUrl: 'https://api.openai.com/v1/responses', openAiProvider: 'openai',
      openAiModel: 'gpt-5.4-nano', openAiMiniModel: 'gpt-5.4-mini', openAiTestModel: 'gpt-5.1'
    });
    const result = await provider.generate({ purpose: 'behavioural-partner', forceOpenAi: true, instructions: 'Return JSON.', input: '{}', maxOutputTokens: 80, jsonSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } });
    assert.equal(result.provider, 'openai');
    assert.equal(calls[0].body.model, 'gpt-5.4-nano');
  } finally {
    globalThis.fetch = previousFetch;
  }
});
