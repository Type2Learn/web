import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const courseSource = await readFile(new URL('../../course/course.js', import.meta.url), 'utf8');
const visualSource = await readFile(new URL('../../course/visual-explanations.js', import.meta.url), 'utf8');
const courseCss = await readFile(new URL('../../course/course.css', import.meta.url), 'utf8');

test('the authored visual is available for preview and reading without adaptive consent', () => {
  const start = courseSource.indexOf('const visualExplanationControl = () => {');
  const end = courseSource.indexOf('\n  // Open layout', start);
  const control = courseSource.slice(start, end);

  assert.match(control, /reviewed, authored course map/);
  assert.match(control, /\['preview', 'read'\]\.includes\(state\.progress\.phase\)/);
  assert.doesNotMatch(control, /adaptiveLearningIsActive\(\)/);
});

test('the visual returns to the lesson rather than assuming a mascot is present', () => {
  assert.match(visualSource, /Return to lesson/);
  assert.doesNotMatch(visualSource, /Return to Ava/);
});

test('the visual rail anchors to the task row instead of the module-strip row', () => {
  assert.match(courseCss, /course-mascot-rail--lesson\.course-mascot-rail--visual\s*\{[\s\S]*grid-row:\s*2;/);
  assert.match(courseSource, /course-visual-context/);
  assert.match(courseSource, /course-visual-task-region/);
  assert.match(courseCss, /course-workspace\.has-course-visual[\s\S]*grid-template-columns/);
  assert.match(courseCss, /course-visual-task-region[\s\S]*grid-row:\s*2;/);
  assert.match(courseCss, /course-visual-connection/);
  assert.match(visualSource, /Notice the idea/);
});
