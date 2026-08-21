import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../learn/learn.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../../learn/learn.css', import.meta.url), 'utf8');

test('first-run reading controls apply all five presentation values immediately', () => {
  [
    'setupTextSize',
    'setupSpacing',
    'setupReadingWidth',
    'setupReadingContrast',
    'setupReadingSurface'
  ].forEach((attribute) => {
    assert.match(source, new RegExp('document\\.body\\.dataset\\.' + attribute));
  });
  assert.match(source, /if \(readingPreferenceIds\.has\(preference\) \|\| preference === 'text-to-speech'\) \{\n\s*render\(choices\);/);
});

test('setup provides a real live reading sample rather than inert labels', () => {
  assert.match(source, /const readingPreviewMarkup/);
  assert.match(source, /This short lesson sample updates immediately/);
  assert.match(source, /data-learning-reading-preview/);
  assert.match(source, /control\.id === 'reading-surface' \? readingPreviewMarkup\(choices\)/);
});

test('each reading preview data state has a matching visible CSS treatment', () => {
  [
    'data-setup-text-size="large"',
    'data-setup-text-size="extra-large"',
    'data-setup-spacing="relaxed"',
    'data-setup-reading-width="narrow"',
    'data-setup-reading-width="wide"',
    'data-setup-reading-surface="soft-blue"',
    'data-setup-reading-surface="warm-cream"',
    'data-setup-reading-contrast="on"'
  ].forEach((selector) => assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  assert.match(css, /\.learning-reading-preview/);
});

test('text-to-speech preview is explicitly user-triggered and never auto-plays', () => {
  assert.match(source, /data-setup-tts-preview/);
  assert.match(source, /playSetupTextToSpeechPreview\(choices\)/);
  assert.match(source, /window\.speechSynthesis\.speak\(utterance\)/);
  assert.match(source, /Audio starts only after you choose this button/);
  assert.doesNotMatch(source, /render\(choices\)[\s\S]{0,180}speechSynthesis\.speak/);
});
