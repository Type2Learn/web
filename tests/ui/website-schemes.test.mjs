import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('website schemes are a first-class post-login preference and Urdu mode is functional', async () => {
  const [schemeClient, setup, course] = await Promise.all([
    readFile(new URL('../../website-scheme.js', import.meta.url), 'utf8'),
    readFile(new URL('../../learn/learn.js', import.meta.url), 'utf8'),
    readFile(new URL('../../course/course.js', import.meta.url), 'utf8')
  ]);

  assert.match(schemeClient, /\['balanced', 'playful', 'calm'\]/);
  assert.match(setup, /data-preference="website-scheme"/);
  assert.doesNotMatch(setup, /data-preference="learning-language"/);
  assert.match(setup, /id: 'urdu-mode'/);
  assert.match(course, /settingsChoiceGroup\('website-scheme'/);
  assert.match(course, /Show the course and Course AI in Urdu/);
  assert.match(course, /const supportLanguage = \(\) => learningChoices\(\)\['urdu-mode'\] === 'on'/);
});
