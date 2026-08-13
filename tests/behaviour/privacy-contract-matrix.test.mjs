import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanContext, directiveForContext, validModelMessage } from '../../server/behavioural-partner-service.mjs';

const validBody = (overrides = {}) => ({
  moduleIndex: 0,
  phase: 'type',
  language: 'en',
  layout: 'balanced',
  controls: { enabled: true, role: 'learning-partner', presence: 'available', proactive: true },
  signals: { delayedStart: false, returned: false, rereads: false, longReading: false, longTypingPause: true, retries: true, aiRequests: false, noTaskMovement: false, completed: false, assessmentUncertainty: false },
  objectiveIds: ['module-0-core'],
  supportHistory: { accepted: 0, dismissed: 0 },
  ...overrides
});

const sensitiveKinds = [
  'rawResponse', 'typedWords', 'individualKeystrokes', 'keyLog', 'microphoneRecording', 'audioBlob', 'voiceTranscript', 'chatHistory', 'fullChatMessage', 'rawAssessmentAnswer',
  'correctOption', 'answerKey', 'score', 'percentage', 'rank', 'streak', 'deviceFingerprint', 'ipAddress', 'eyeTracking', 'psychologicalProfile'
];

// 100 independently named privacy cases: an endpoint payload may contain any
// unexpected field, but the Behaviour Context contract cannot carry it into
// policy or model wording.
for (let index = 0; index < 100; index += 1) {
  const key = sensitiveKinds[index % sensitiveKinds.length] + '_' + index;
  const sentinel = 'private-sentinel-' + index;
  test(`Behaviour privacy redaction ${String(index + 1).padStart(3, '0')}: ${key}`, () => {
    const clean = cleanContext({ ...validBody(), [key]: sentinel, nestedUntrusted: { [key]: sentinel } });
    const encoded = JSON.stringify(clean);
    assert.equal(encoded.includes(sentinel), false);
    assert.equal(Object.hasOwn(clean, key), false);
    assert.deepEqual(Object.keys(clean).sort(), ['courseId', 'courseVersion', 'dismissed', 'enabled', 'language', 'layout', 'moduleIndex', 'objectiveIds', 'phase', 'presence', 'proactive', 'role', 'schemaVersion', 'signals', 'supportHistory'].sort());
  });
}

const unsafeMessages = [
  'Your score is 90.', 'You rank above other learners.', 'Keep your streak alive.', 'You have a diagnosis.',
  'This disorder means you cannot continue.', 'You must finish now.', 'The correct answer is option B.', 'Choose option C.',
  'Copy this answer exactly.', 'A'.repeat(281), '', 'First. Second. Third.',
  'Your percentage improved.', 'You are faster than everyone.', 'A diagnosis is clear.', 'You must not pause.',
  'The correct answer is already visible.', 'Choose an option now.', 'Keep the streak going.', 'Your rank matters.'
];

for (const [index, message] of unsafeMessages.entries()) {
  test(`Behaviour model message guard ${String(index + 1).padStart(2, '0')}`, () => {
    assert.equal(validModelMessage(message), '');
  });
}

test('Behaviour model message guard accepts one or two calm, task-bound sentences', () => {
  assert.equal(validModelMessage('Start with the first visible sentence. You can choose what comes next.'), 'Start with the first visible sentence. You can choose what comes next.');
  assert.equal(validModelMessage('پہلے نظر آنے والے جملے سے شروع کریں۔'), 'پہلے نظر آنے والے جملے سے شروع کریں۔');
});

test('Behaviour contract clamps IDs, counters, and unknown enum values without carrying source text', () => {
  const clean = cleanContext(validBody({
    moduleIndex: 0,
    phase: 'not-a-phase',
    language: 'not-a-language',
    layout: 'overflow',
    controls: { enabled: true, role: 'competitive', presence: 'constant', proactive: 'yes' },
    objectiveIds: ['module-0-core; DROP TABLE', 'x'.repeat(200), 'okay_id'],
    supportHistory: { accepted: 999, dismissed: -5 }
  }));
  assert.equal(clean.phase, 'read');
  assert.equal(clean.language, 'en');
  assert.equal(clean.layout, 'balanced');
  assert.equal(clean.role, 'calm-guide');
  assert.equal(clean.presence, 'available');
  assert.deepEqual(clean.objectiveIds, ['module-0-coreDROPTABLE', 'x'.repeat(64), 'okay_id']);
  assert.deepEqual(clean.supportHistory, { accepted: 20, dismissed: 0 });
});

test('Behaviour policy cannot offer support after the learner disables the partner', () => {
  const clean = cleanContext(validBody({ controls: { enabled: false, role: 'learning-partner', presence: 'available', proactive: true } }));
  assert.equal(directiveForContext(clean), null);
});

test('Behaviour policy cannot offer support after that task offer was dismissed', () => {
  const clean = cleanContext(validBody({ dismissed: true }));
  assert.equal(directiveForContext(clean), null);
});
