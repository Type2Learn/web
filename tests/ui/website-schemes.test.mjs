import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('website schemes offer Calm and Playful without changing Urdu mode', async () => {
  const [schemeClient, schemeStyles, setup, course] = await Promise.all([
    readFile(new URL('../../website-scheme.js', import.meta.url), 'utf8'),
    readFile(new URL('../../website-scheme.css', import.meta.url), 'utf8'),
    readFile(new URL('../../learn/learn.js', import.meta.url), 'utf8'),
    readFile(new URL('../../course/course.js', import.meta.url), 'utf8')
  ]);

  assert.match(schemeClient, /\['calm', 'playful'\]/);
  assert.match(schemeClient, /value === 'balanced'\s*\?\s*'calm'/);
  assert.doesNotMatch(schemeStyles, /data-website-scheme="calm"/);
  assert.match(schemeStyles, /course-task-card \{[\s\S]*radial-gradient/);
  assert.match(setup, /data-preference="website-scheme"/);
  assert.doesNotMatch(setup, /data-preference="learning-language"/);
  assert.match(setup, /id: 'urdu-mode'/);
  assert.match(course, /settingsChoiceGroup\('website-scheme'/);
  assert.match(course, /Show the course and Course AI in Urdu/);
  assert.match(course, /const supportLanguage = \(\) => learningChoices\(\)\['urdu-mode'\] === 'on'/);
});
