import assert from 'node:assert/strict';
import test from 'node:test';

// LearningTelemetry is browser code. Supply the one small document contract it
// uses so this test can prove the cross-course privacy boundary in Node.
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const listeners = new Map();
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    visibilityState: 'visible',
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name) { listeners.delete(name); }
  }
});

const { LearningTelemetry } = await import('../../course/learning-telemetry.js');

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a reviewed-course change flushes under the original course identity before metrics reset', async () => {
  const summaries = [];
  const telemetry = new LearningTelemetry({ onFlush: async (summary) => summaries.push(summary) });
  telemetry.begin({ courseId: 'water-lab', courseVersion: '1.0.0', moduleIndex: 0, language: 'en', phase: 'read', enabled: true });
  telemetry.action('typing', { characters: 22, correctCharacters: 20, incorrectCharacters: 2 });
  telemetry.begin({ courseId: 'history-lab', courseVersion: '1.0.0', moduleIndex: 0, language: 'en', phase: 'read', enabled: true });
  await settle();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].courseId, 'water-lab');
  assert.equal(summaries[0].courseVersion, '1.0.0');
  assert.equal(summaries[0].moduleIndex, 0);
  assert.equal(summaries[0].metrics.typingCharacters, 22);
  assert.equal(telemetry.metrics.typingCharacters, 0);
  telemetry.dispose();
});

test('a phase change retains one module aggregate instead of emitting a task-level stream', async () => {
  const summaries = [];
  const telemetry = new LearningTelemetry({ onFlush: async (summary) => summaries.push(summary) });
  telemetry.begin({ courseId: 'water-lab', courseVersion: '1.0.0', moduleIndex: 0, language: 'en', phase: 'read', enabled: true });
  telemetry.action('typing', { characters: 14 });
  telemetry.begin({ courseId: 'water-lab', courseVersion: '1.0.0', moduleIndex: 0, language: 'en', phase: 'type', enabled: true });
  await settle();
  assert.equal(summaries.length, 0);
  assert.equal(telemetry.context.phase, 'type');
  assert.equal(telemetry.metrics.typingCharacters, 14);
  telemetry.dispose();
});

test.after(() => {
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else delete globalThis.document;
});
