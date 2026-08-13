import assert from 'node:assert/strict';
import test from 'node:test';

// This module normally runs in the course browser. The small DOM stub keeps
// its visibility accounting testable in Node without using a real learner
// session, browser storage, microphone, or network request.
const documentListeners = new Map();
globalThis.document = {
  visibilityState: 'visible',
  addEventListener(name, callback) { documentListeners.set(name, callback); },
  removeEventListener(name) { documentListeners.delete(name); }
};

const { BehaviourContext, deriveBehaviourSignals, normalisePartnerControls, supportStatesForSignals } = await import('../../course/behaviour-context.js');

const roles = ['calm-guide', 'learning-partner', 'self-challenge', 'visual-co-explorer'];
const presences = ['quiet', 'available', 'involved'];
const channels = ['text', 'speech', 'both'];

// 144 independently named cases: every learner-controlled partner choice is
// normalised without any inference about the learner.
let controlCase = 0;
for (const role of roles) {
  for (const presence of presences) {
    for (const enabled of [false, true]) {
      for (const proactive of [false, true]) {
        for (const channel of channels) {
          controlCase += 1;
          test(`Behaviour Context controls ${String(controlCase).padStart(3, '0')}: ${role}/${presence}/${enabled}/${proactive}/${channel}`, () => {
            const controls = normalisePartnerControls({ role, presence, enabled, proactive, channel, rawAnswer: 'never carried' });
            assert.deepEqual(controls, { role, presence, enabled, proactive, channel });
            assert.equal(Object.hasOwn(controls, 'rawAnswer'), false);
          });
        }
      }
    }
  }
}

test('Behaviour Context defaults unknown controls to safe, non-diagnostic values', () => {
  assert.deepEqual(normalisePartnerControls({ role: 'competitive-profile', presence: 'always', channel: 'record-everything' }), {
    enabled: false, role: 'calm-guide', presence: 'available', proactive: true, channel: 'text'
  });
});

const signalCases = [
  ['no matched pattern remains neutral', {}, []],
  ['delayed start alone remains neutral', { delayedStart: true }, []],
  ['delayed start and return become starting', { delayedStart: true, returned: true }, ['starting']],
  ['AI use alone is a support state only', { aiRequests: true }, ['using-support']],
  ['AI use and no movement are returning', { aiRequests: true, noTaskMovement: true }, ['returning', 'using-support']],
  ['rereading needs both rereads and long reading', { rereads: true, longReading: true }, ['re-reading']],
  ['typing support needs a pause and retry', { longTypingPause: true, retries: true }, ['working-through-typing']],
  ['completion is a next-step state', { completed: true }, ['ready-for-next-step']],
  ['assessment uncertainty is a choice state', { assessmentUncertainty: true }, ['needs-a-choice']],
  ['multiple temporary states preserve their public order', { delayedStart: true, returned: true, rereads: true, longReading: true, completed: true }, ['starting', 're-reading', 'ready-for-next-step']]
];

for (const [name, signals, expected] of signalCases) {
  test(`Behaviour Context semantic state: ${name}`, () => {
    assert.deepEqual(supportStatesForSignals(signals), expected);
  });
}

const thresholdCases = [
  ['delayed start stays false below 90 seconds', { firstActionMs: 89_999 }, 'read', {}, 'delayedStart', false],
  ['delayed start activates at 90 seconds', { firstActionMs: 90_000 }, 'read', {}, 'delayedStart', true],
  ['long reading stays false below eight minutes', { activeMs: 479_999 }, 'read', {}, 'longReading', false],
  ['long reading activates at eight minutes', { activeMs: 480_000 }, 'read', {}, 'longReading', true],
  ['typing pause stays false below 45 seconds', { typingLongestPauseMs: 44_999 }, 'type', {}, 'longTypingPause', false],
  ['typing pause activates at 45 seconds', { typingLongestPauseMs: 45_000 }, 'type', {}, 'longTypingPause', true],
  ['retries stay false without abandonment or corrections', { typingBackspaces: 7, typingAbandons: 0 }, 'type', {}, 'retries', false],
  ['correction threshold activates retries', { typingBackspaces: 8, typingAbandons: 0 }, 'type', {}, 'retries', true],
  ['an abandoned typing attempt activates retries', { typingBackspaces: 0, typingAbandons: 1 }, 'type', {}, 'retries', true],
  ['assessment uncertainty stays off outside assessment', { typingLongestPauseMs: 60_000 }, 'type', {}, 'assessmentUncertainty', false],
  ['assessment uncertainty activates after a long assessment pause', { typingLongestPauseMs: 45_000 }, 'assessment', {}, 'assessmentUncertainty', true],
  ['assessment help activates assessment uncertainty', {}, 'assessment', { assessmentHelp: true }, 'assessmentUncertainty', true]
];

for (const [name, metrics, phase, support, key, expected] of thresholdCases) {
  test(`Behaviour Context threshold: ${name}`, () => {
    assert.equal(deriveBehaviourSignals({ metrics, phase, support })[key], expected);
  });
}

test('Behaviour Context retains aggregates but never a response, transcript, recording, or score', () => {
  const context = new BehaviourContext();
  context.begin({ moduleIndex: 2, phase: 'type', language: 'en', layout: 'balanced', objectiveIds: ['module-2-core'], controls: { enabled: true, role: 'learning-partner' } });
  context.action('typing', { characters: 42, correctCharacters: 37, incorrectCharacters: 5, backspaces: 2, pauseMs: 1_500 });
  context.action('ai-request');
  const snapshot = context.snapshot();
  const serialized = JSON.stringify(snapshot);
  assert.equal(snapshot.metrics.typingCharacters, 42);
  assert.equal(snapshot.metrics.typingCorrectCharacters, 37);
  for (const forbidden of ['response', 'transcript', 'recording', 'keystroke', 'score', 'rawAnswer', 'password']) assert.equal(serialized.includes(forbidden), false);
  context.dispose();
});

test('Behaviour Context resets aggregates and dismissed offers for a new module', () => {
  const context = new BehaviourContext();
  context.begin({ moduleIndex: 0, phase: 'type', language: 'en', layout: 'open', objectiveIds: ['module-0-core'], controls: { enabled: true } });
  context.action('typing', { characters: 17, correctCharacters: 17 });
  context.dismiss('working-through-typing');
  context.begin({ moduleIndex: 1, phase: 'read', language: 'en', layout: 'open', objectiveIds: ['module-1-core'], controls: { enabled: true } });
  const snapshot = context.snapshot();
  assert.equal(snapshot.metrics.typingCharacters, 0);
  assert.equal(snapshot.supportHistory.dismissed, 0);
  assert.equal(context.isDismissed('working-through-typing'), false);
  context.dispose();
});

test('Behaviour Context records visibility only as an aggregate count', () => {
  const context = new BehaviourContext();
  const listener = documentListeners.get('visibilitychange');
  listener?.();
  listener?.();
  assert.equal(context.snapshot().metrics.visibilityChanges >= 2, true);
  context.dispose();
});
