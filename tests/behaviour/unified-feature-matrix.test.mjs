import assert from 'node:assert/strict';
import test from 'node:test';
import { COURSE_CONTENT } from '../../course/course-content.js';
import { adaptiveCandidateForSummary } from '../../server/adaptive-policy.mjs';
import { assessmentLearningSignals, prioritiseAssessmentItems } from '../../server/assessment-monitor.mjs';
import { adaptiveRecallContext } from '../../server/course-context.mjs';

const states = ['starting', 'returning', 're-reading', 'working-through-typing', 'using-support', 'ready-for-next-step', 'needs-a-choice'];
const proposalForState = {
  starting: 'start-one-small-step',
  returning: 'return-from-ai-one-step',
  're-reading': 'reading-width-narrow',
  'working-through-typing': 'layout-open',
  'using-support': null,
  'ready-for-next-step': null,
  'needs-a-choice': null
};

// 140 cases: every public Behaviour Context state is fed into the one-change
// proposal policy across harmless metric variations. Only the documented
// states can affect a reversible presentation proposal; none creates a score.
let proposalCase = 0;
for (const state of states) {
  for (let variation = 0; variation < 20; variation += 1) {
    proposalCase += 1;
    test(`Unified behaviour → proposal ${String(proposalCase).padStart(3, '0')}: ${state}/safe-metric-${variation + 1}`, () => {
      const candidate = adaptiveCandidateForSummary({
        phase: variation % 2 === 0 ? 'read' : 'type',
        metrics: { activeMs: variation * 1000, typingCharacters: variation * 3, returns: 0, rereads: 0 },
        behaviour: { states: [state] }
      });
      assert.equal(candidate?.id || null, proposalForState[state]);
      assert.equal(Object.hasOwn(candidate || {}, 'score'), false);
      assert.equal(Object.hasOwn(candidate || {}, 'learnerLabel'), false);
    });
  }
}

// Assessment sequencing consumes the same neutral state names but can only
// order question modes. It may not create a result, readiness decision, or
// answer hint from behaviour.
let assessmentCase = 0;
for (const state of states) {
  for (const rhythm of ['brief', 'typical', 'extended']) {
    assessmentCase += 1;
    test(`Unified behaviour → assessment order ${String(assessmentCase).padStart(3, '0')}: ${state}/${rhythm}`, () => {
      const metrics = rhythm === 'brief'
        ? { activeMs: 20_000, typingCharacters: 10, rereads: 0 }
        : rhythm === 'extended'
          ? { activeMs: 8 * 60_000, typingCharacters: 180, rereads: 2 }
          : { activeMs: 180_000, typingCharacters: 100, rereads: 0 };
      const signals = assessmentLearningSignals({ metrics, support: {}, behaviour: { states: [state] } });
      const expectedState = state === 'working-through-typing' ? 'expression' : state === 're-reading' ? 're-reading' : 'none';
      assert.equal(signals.supportState, expectedState);
      assert.equal(Object.hasOwn(signals, 'score'), false);
      const ordered = prioritiseAssessmentItems({
        runId: 'matrix-' + state + '-' + rhythm,
        signals,
        items: [{ id: 'open', responseMode: 'open' }, { id: 'mcq', responseMode: 'mcq' }]
      });
      assert.deepEqual([...ordered].sort(), ['mcq', 'open']);
      assert.equal(ordered.length, 2);
    });
  }
}

// 100 cases: Adaptive Recall only accepts the seven public state names. Any
// untrusted value is discarded before curriculum or model context is built.
for (let index = 0; index < 100; index += 1) {
  const included = states[index % states.length];
  const untrusted = 'hidden-profile-' + index + '<raw answer>';
  test(`Unified behaviour → Adaptive Recall context ${String(index + 1).padStart(3, '0')}`, () => {
    const context = adaptiveRecallContext({
      courseId: COURSE_CONTENT.id,
      page: { moduleIndex: index % COURSE_CONTENT.steps.length, phase: 'type' },
      language: index % 2 ? 'en' : 'ur',
      response: 'A short learner explanation.',
      behaviourStates: [untrusted, included, 'diagnosis', 'score-99']
    });
    assert.deepEqual(context.supportStates, [included]);
    const encoded = JSON.stringify(context);
    assert.equal(encoded.includes(untrusted), false);
    assert.equal(encoded.includes('score-99'), false);
    assert.equal(encoded.includes('diagnosis'), false);
  });
}
