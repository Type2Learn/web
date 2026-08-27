import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpeechService } from '../../server/speech-service.mjs';

const config = {
  speechmaticsApiKey: 'long-lived-provider-secret',
  speechmaticsCreditsPerMinute: 2,
  speechmaticsMonthlyCreditCap: 180,
  speechmaticsUserCreditCap: 12,
  speechmaticsRequestsPerMinute: 3,
  allowGuestAi: false
};

const firebase = { available: true, verifyBearer: async () => ({ uid: 'learner-1' }) };

test('realtime speech route issues only a short provider token and reserves a bounded allowance', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const ledgerCalls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ key_value: 'short-lived-realtime-token' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const ledger = {
    reserve: async (request) => { ledgerCalls.push(['reserve', request]); return { reservationId: 'r1', ...request.usage }; },
    settle: async (request) => { ledgerCalls.push(['settle', request]); },
    release: async (request) => { ledgerCalls.push(['release', request]); }
  };
  try {
    const speech = createSpeechService({ config, firebase, ledger });
    const token = await speech.createRealtimeToken({ authorization: 'Bearer authenticated', body: { language: 'en', purpose: 'typing' } });
    assert.equal(token.jwt, 'short-lived-realtime-token');
    assert.equal(token.endpoint, 'wss://global.rt.speechmatics.com/v2/');
    assert.equal(token.maxDurationMs, 45000);
    assert.equal(token.expiresInSeconds, 60);
    assert.equal(token.language, 'en');
    assert.equal(token.purpose, 'typing');
    assert.doesNotMatch(JSON.stringify(token), /long-lived-provider-secret/);
    assert.match(calls[0].url, /mp\.speechmatics\.com\/v1\/api_keys\?type=rt/);
    assert.equal(JSON.parse(calls[0].options.body).ttl, 60);
    assert.equal(ledgerCalls[0][0], 'reserve');
    assert.equal(ledgerCalls[0][1].kind, 'speechmatics-realtime');
    assert.equal(ledgerCalls[0][1].usage.credits, 1.5);
    assert.equal(ledgerCalls[1][0], 'settle');
    assert.equal(speech.status().realtime.directBrowserStream, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('realtime speech rejects unsupported purposes before it asks the provider for a key', async () => {
  const ledger = { reserve: async () => { throw new Error('must not reserve'); } };
  const speech = createSpeechService({ config, firebase, ledger });
  await assert.rejects(
    () => speech.createRealtimeToken({ authorization: 'Bearer authenticated', body: { purpose: 'anything-else' } }),
    (error) => error?.code === 'INVALID_SPEECH_PURPOSE'
  );
});

test('realtime token failure releases its budget reservation and never forwards the provider failure', async () => {
  const previousFetch = globalThis.fetch;
  let released = false;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'provider internals' }), { status: 500, headers: { 'content-type': 'application/json' } });
  const ledger = {
    reserve: async () => ({ reservationId: 'r2', credits: 1.5 }),
    settle: async () => { throw new Error('must not settle'); },
    release: async () => { released = true; }
  };
  try {
    const speech = createSpeechService({ config, firebase, ledger });
    await assert.rejects(
      () => speech.createRealtimeToken({ authorization: 'Bearer authenticated', body: { purpose: 'chat' } }),
      (error) => error?.code === 'SPEECH_REALTIME_TOKEN_ERROR' && !/provider internals/.test(error?.message || '')
    );
    assert.equal(released, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
