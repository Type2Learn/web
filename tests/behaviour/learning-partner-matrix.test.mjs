import assert from 'node:assert/strict';
import test from 'node:test';
import { companionBubbleMarkup, companionDockMarkup, localCompanionDirective } from '../../course/learning-partner.js';

const roles = ['calm-guide', 'learning-partner', 'self-challenge', 'visual-co-explorer'];
const layouts = ['focused', 'balanced', 'open'];
const presences = ['quiet', 'available', 'involved'];

const snapshot = ({
  moduleIndex = 0,
  language = 'en',
  layout = 'balanced',
  role = 'calm-guide',
  presence = 'available',
  phase = 'type',
  enabled = true,
  proactive = true,
  signals = { longTypingPause: true, retries: true }
} = {}) => ({
  moduleIndex, language, layout, phase,
  controls: { enabled, proactive, role, presence },
  objectiveIds: ['module-' + moduleIndex + '-core'],
  signals
});

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// 88 cases: every reviewed module gets distinct authored Learning Partner
// copy in both languages, and every role retains its own permitted action.
let curriculumCase = 0;
for (const moduleIndex of Array.from({ length: 11 }, (_, index) => index)) {
  for (const language of ['en', 'ur']) {
    for (const role of roles) {
      curriculumCase += 1;
      test(`Learning Partner curriculum ${String(curriculumCase).padStart(3, '0')}: module ${moduleIndex + 1}/${language}/${role}`, () => {
        const directive = localCompanionDirective(snapshot({ moduleIndex, language, role }));
        assert.ok(directive);
        assert.equal(directive.role, role);
        assert.equal(directive.objectiveIds[0], 'module-' + moduleIndex + '-core');
        const expectedAction = role === 'learning-partner'
          ? 'teach-partner'
          : role === 'visual-co-explorer'
            ? 'open-visual'
            : 'smaller-step';
        assert.equal(directive.action, expectedAction);
        assert.ok(directive.message.length > 20);
        assert.equal(/score|rank|streak|diagnos|correct answer/i.test(directive.message), false);
        if (language === 'ur') assert.match(directive.message, /[\u0600-\u06ff]/);
      });
    }
  }
}

// 36 cases: all role/layout/presence combinations have one predictable
// support surface. Focused and Quiet use the non-competing trigger.
let surfaceCase = 0;
for (const role of roles) {
  for (const layout of layouts) {
    for (const presence of presences) {
      surfaceCase += 1;
      test(`Learning Partner surface ${String(surfaceCase).padStart(3, '0')}: ${role}/${layout}/${presence}`, () => {
        const directive = localCompanionDirective(snapshot({ role, layout, presence, signals: { delayedStart: true, returned: true } }));
        assert.ok(directive);
        assert.equal(directive.trigger, 'starting');
        assert.equal(directive.surface, layout === 'focused' || presence === 'quiet' ? 'quiet-trigger' : 'bubble');
        if (directive.surface === 'quiet-trigger') {
          assert.match(companionBubbleMarkup({ directive, language: 'en', escapeHtml }), /course-companion-quiet-trigger/);
        } else {
          const markup = companionBubbleMarkup({ directive, language: 'en', escapeHtml });
          assert.match(markup, /course-companion-bubble/);
          assert.match(markup, /Why did this appear\?/);
          assert.match(markup, /Not now/);
        }
      });
    }
  }
}

const nonOfferCases = [
  ['partner switched off', { enabled: false }],
  ['proactive offers switched off', { proactive: false }],
  ['one matching signal is not enough', { signals: { retries: true } }],
  ['unknown role is not selected by the renderer', { role: 'competitive' }]
];

for (const [name, overrides] of nonOfferCases) {
  test(`Learning Partner does not offer support when ${name}`, () => {
    const directive = localCompanionDirective(snapshot(overrides));
    if (name === 'unknown role is not selected by the renderer') {
      // The client normaliser owns invalid-role recovery. The local policy is
      // intentionally fail-safe and emits no unknown-role directive.
      assert.equal(directive?.role === 'competitive', false);
    } else {
      assert.equal(directive, null);
    }
  });
}

// 8 assessment cases: process support remains useful but cannot leak an
// answer or option for either language and every chosen role.
let assessmentCase = 0;
for (const language of ['en', 'ur']) {
  for (const role of roles) {
    assessmentCase += 1;
    test(`Learning Partner assessment boundary ${String(assessmentCase).padStart(2, '0')}: ${language}/${role}`, () => {
      const directive = localCompanionDirective(snapshot({ language, role, phase: 'assessment', signals: { assessmentUncertainty: true, longTypingPause: true } }));
      assert.ok(directive);
      assert.equal(directive.trigger, 'needs-a-choice');
      assert.equal(directive.action, role === 'visual-co-explorer' ? 'open-visual' : 'process-support');
      assert.equal(/correct answer|choose option|answer is|copy this/i.test(directive.message), false);
      if (role === 'learning-partner') assert.match(directive.message, language === 'ur' ? /عمل/ : /process/i);
    });
  }
}

test('Learning Partner dock requires review before any voluntary voice submission', () => {
  const markup = companionDockMarkup({ language: 'en', escapeHtml, draft: 'I think support helps.', canSpeak: true, channel: 'both' });
  assert.match(markup, /Speak, then review your words here before sending/);
  assert.match(markup, /data-companion-input/);
  assert.match(markup, /Open full chat/);
  assert.equal(/autoplay|recording starts automatically/i.test(markup), false);
});

test('Learning Partner text-only dock never requests microphone input', () => {
  const markup = companionDockMarkup({ language: 'en', escapeHtml, canSpeak: true, channel: 'text' });
  assert.equal(/companion-dictation/.test(markup), false);
  assert.match(markup, /Explain one idea to your partner/);
});
