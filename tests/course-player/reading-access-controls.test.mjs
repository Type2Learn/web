import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const courseSource = await readFile(new URL('../../course/course.js', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../../course/course.css', import.meta.url), 'utf8');
const setupSource = await readFile(new URL('../../learn/learn.js', import.meta.url), 'utf8');

test('reading access exposes independent rhythm and low-glare surface controls', () => {
  assert.match(courseSource, /settingsChoiceGroup\('reading-spacing', 'Reading rhythm'/);
  assert.match(courseSource, /settingsChoiceGroup\('reading-surface', 'Reading surface'/);
  assert.match(courseSource, /standard or roomier line and paragraph spacing/);
  assert.match(courseSource, /low-glare surface for lesson text/);
});

test('reading rhythm is an immediate resolved setting while surface remains course-scoped', () => {
  assert.match(courseSource, /key === 'reading-spacing' && \['standard', 'relaxed'\]\.includes\(value\)\) setCourseSetting\('spacing', value\)/);
  assert.match(courseSource, /'reading-surface': 'paper'/);
  assert.match(courseSource, /document\.body\.dataset\.courseReadingSurface/);
  assert.doesNotMatch(courseSource, /adaptiveLearning[^\n]{0,100}reading-surface/);
});

test('first-run preferences expose and persist the same reading choices as the profile menu', () => {
  ['reading-text-size', 'reading-spacing', 'reading-width', 'reading-contrast', 'reading-surface'].forEach((key) => {
    assert.match(setupSource, new RegExp("id: '" + key + "'"));
    assert.match(courseSource, new RegExp("'" + key + "':"));
  });
  assert.match(setupSource, /\{ id: 'reading-surface' \}/);
  assert.match(courseSource, /savedReadingChoices/);
  assert.match(courseSource, /setUserOverride\(sharedSettings, 'highContrast'/);
});

test('low-glare surfaces only restyle the lesson reading region and defer to high contrast', () => {
  assert.match(cssSource, /data-course-reading-surface="soft-blue"\] \.course-reading-copy/);
  assert.match(cssSource, /data-course-reading-surface="warm-cream"\] \.course-reading-copy/);
  assert.match(cssSource, /body\.course-high-contrast \.course-reading-copy/);
  assert.match(cssSource, /lesson-only presentation/);
});

test('background noise begins muted and keeps the learner-selected safe ceiling', () => {
  assert.match(setupSource, /const BACKGROUND_NOISE_MAX_PERCENT = 60/);
  assert.match(setupSource, /audio\.volume = 0;/);
  assert.match(courseSource, /const BACKGROUND_NOISE_MAX_VOLUME = 0\.6;/);
  assert.match(courseSource, /audio\.volume = 0;\n    try \{\n      await audio\.play\(\);/);
  assert.doesNotMatch(courseSource, /audio\.volume = Math\.min\(backgroundNoise\.volume, 0\.055\)/);
});
