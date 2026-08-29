import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createLearningAnalyticsService } from '../../server/learning-analytics-service.mjs';
import { sanitiseAssessmentResponseEvidence } from '../../server/assessment-service.mjs';
import { assessmentLearningSignals, prioritiseAssessmentItems } from '../../server/assessment-monitor.mjs';

const createConsentFirebase = (initial = {}) => {
  const profileData = { ...initial };
  const profileRef = {
    async get() { return { exists: Object.keys(profileData).length > 0, data: () => ({ ...profileData }) }; },
    async set(next) { Object.assign(profileData, next); },
    collection(name) {
      assert.equal(name, 'courses');
      return { get: async () => ({ docs: [] }) };
    }
  };
  return {
    available: true,
    firestore: {
      collection(name) {
        assert.equal(name, 'type2learnLearningProfiles');
        return { doc: () => profileRef };
      },
      batch() { return { delete() {}, async commit() {} }; }
    },
    verifyBearer: async () => ({ uid: 'learner-consent-test' }),
    profileData
  };
};

test('response evidence is separately off for old adaptive-learning consent records', async () => {
  const firebase = createConsentFirebase({ consentVersion: 1, adaptiveEnabled: true });
  const service = createLearningAnalyticsService({ config: { adaptiveLearningEnabled: true, adaptiveRetentionDays: 90 }, firebase });
  const consent = await service.getConsent({ authorization: 'Bearer test' });
  assert.equal(consent.enabled, true);
  assert.equal(consent.responseEvidenceEnabled, false);
});

test('a learner must explicitly enable response evidence and can turn it off independently', async () => {
  const firebase = createConsentFirebase({ consentVersion: 1, adaptiveEnabled: true });
  const service = createLearningAnalyticsService({ config: { adaptiveLearningEnabled: true, adaptiveRetentionDays: 90 }, firebase });
  const enabled = await service.setConsent({ authorization: 'Bearer test', body: { enabled: true, responseEvidenceEnabled: true } });
  assert.deepEqual(enabled, { enabled: true, responseEvidenceEnabled: true, consentVersion: 1 });
  const disabled = await service.setConsent({ authorization: 'Bearer test', body: { enabled: true, responseEvidenceEnabled: false } });
  assert.deepEqual(disabled, { enabled: true, responseEvidenceEnabled: false, consentVersion: 1 });
  assert.equal(firebase.profileData.adaptiveEnabled, true, 'aggregate support can remain enabled');
  assert.equal(firebase.profileData.responseEvidenceEnabled, false, 'response storage is independently disabled');
});

test('retained response evidence is bounded and strips contact details that are not learning evidence', () => {
  const clean = sanitiseAssessmentResponseEvidence('Attention can affect starting. Email me@example.com or call +92 300 1234567. See https://example.test/help');
  assert.equal(clean.text.includes('me@example.com'), false);
  assert.equal(clean.text.includes('1234567'), false);
  assert.equal(clean.text.includes('https://'), false);
  assert.match(clean.text, /Attention can affect starting/);
  assert.equal(clean.redacted, true);
  const bounded = sanitiseAssessmentResponseEvidence('a'.repeat(2000));
  assert.equal(bounded.responseLength, 1600);
  assert.equal(bounded.text.length, 1600);
});

test('expanded aggregate signals can shape question order without deciding an assessment outcome', () => {
  const signals = assessmentLearningSignals({
    metrics: {
      activeMs: 7 * 60 * 1000,
      taskRevisits: 2,
      supportOfferAcceptances: 2,
      supportOfferDismissals: 0,
      assessmentResponseRevisions: 4,
      visualActiveMs: 30_000,
      inputMethodChanges: 1,
      textPresentationChanges: 1
    },
    support: {},
    behaviour: { states: [] }
  });
  assert.equal(signals.courseInteraction, 'extended');
  assert.equal(signals.supportPreference, 'accepted');
  assert.equal(signals.expressionPattern, 're-entering');
  assert.equal(signals.presentationPreference, 'adjusted');
  const order = prioritiseAssessmentItems({
    runId: 'evidence-order',
    signals,
    items: [
      { id: 'choice', responseMode: 'mcq', objectiveIds: ['one'] },
      { id: 'open', responseMode: 'open', objectiveIds: ['one'] }
    ]
  });
  assert.equal(order[0], 'open');
  assert.equal(Object.hasOwn(signals, 'outcome'), false);
});

test('assessment service gates raw response retention to explicit consent and preserves a no-text run record', async () => {
  const source = await readFile(new URL('../../server/assessment-service.mjs', import.meta.url), 'utf8');
  const answerSection = source.slice(source.indexOf('const answer = async'), source.indexOf('const getRun = async'));
  assert.match(answerSection, /item\.responseMode === 'open' && responseEvidenceEnabled\(learnerProfile\)/);
  assert.match(answerSection, /await saveResponseEvidence\(/);
  assert.match(answerSection, /previousObjectiveEvidence\(/);
  assert.match(answerSection, /The normal assessment run never gets raw response prose/);
  assert.match(source, /expiresAt: runExpiry\(timestamp\)/);
});

test('course UI exposes response-evidence consent in first-run setup and the privacy settings menu', async () => {
  const [setup, player] = await Promise.all([
    readFile(new URL('../../learn/learn.js', import.meta.url), 'utf8'),
    readFile(new URL('../../course/course.js', import.meta.url), 'utf8')
  ]);
  assert.match(setup, /id: 'response-evidence'/);
  assert.match(setup, /Use response evidence \+ adaptive support/);
  assert.match(player, /settingsSwitch\('response-evidence'/);
  assert.match(player, /responseEvidenceEnabled/);
});
