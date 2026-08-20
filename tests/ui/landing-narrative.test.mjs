import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the dynamic landing copy states the active-learning loop rather than presenting Type2Learn as a speed product', async () => {
  const app = await read('app.js');
  assert.match(app, /Type2Learn turns a lesson into evidence of understanding/);
  assert.match(app, /It is not a speed test\./);
  assert.match(app, /Read an idea\. Bring it back in your own words\./);
  assert.match(app, /Show what you understand — not how fast you can type\./);
});

test('the landing identifies learner-owned controls as presentation support rather than a lower academic expectation', async () => {
  const app = await read('app.js');
  assert.match(app, /These controls change presentation and support — not the objective or what counts as learning\./);
  assert.match(app, /Bounded, human-accountable AI/);
  assert.match(app, /Ask for an explanation, example, or smaller next action — without a hidden score\./);
});

test('the landing keeps early participation evidence distinct from formal co-design and clinical claims', async () => {
  const [app, staticLanding] = await Promise.all([read('app.js'), read('index.html')]);
  assert.match(app, /Product decisions, participation evidence, and formal claims stay separate\./);
  assert.match(app, /not presented as a completed formal co-design study, clinical validation, or endorsement/);
  assert.match(staticLanding, /does not claim that this early record is a completed formal co-design study, clinical validation, endorsement/);
});

test('the public landing presents the human-reviewed course-publishing path', async () => {
  const [app, staticLanding] = await Promise.all([read('app.js'), read('index.html')]);
  assert.match(app, /Reviewed course publishing/);
  assert.match(app, /Teachers and institutes submit source material/);
  assert.match(staticLanding, /human-approved publication/);
  assert.match(staticLanding, /testable lesson package/);
});

test('English and Urdu landing documents retain a precise, indexable product narrative', async () => {
  const [english, urdu, app] = await Promise.all([read('index.html'), read('ur/index.html'), read('app.js')]);
  assert.match(english, /Type2Learn is an active-learning platform/);
  assert.match(urdu, /فعال سیکھنے/);
  assert.match(app, /سمجھ کے ثبوت میں بدلتا ہے/);
  assert.match(app, /مصنوعات کے فیصلے، شرکت کے شواہد اور رسمی دعوے الگ رکھے جاتے ہیں/);
});

test('the team deck includes Lameea as a clearly marked non-human UI UX design profile', async () => {
  const [app, team] = await Promise.all([read('app.js'), read('team/index.html')]);
  assert.match(app, /Lameea Mubashir Khan/);
  assert.match(app, /UI\/UX Design Lead/);
  assert.match(app, /lameea-mubashir-khan-figure\.png/);
  assert.match(app, /Clearly non-human grey 3D editorial figure/);
  assert.match(team, /Lameea Mubashir Khan/);
});
