import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [course, partner, aiService] = await Promise.all([
  read('../../course/course.js'),
  read('../../course/learning-partner.js'),
  read('../../server/ai-service.mjs')
]);

test('mascot proactive bubble has one clear contextual action without diagnostic UI controls', () => {
  assert.match(partner, /'teach-partner': copy\(language, 'Help with this step'/);
  assert.doesNotMatch(partner, /data-action="companion-why"|data-action="companion-dismiss"/);
  assert.doesNotMatch(partner, /Why did this appear\?|Not now/);
  assert.match(partner, /directive\.source === 'companion-chat'/);
});

test('Help with this step reuses the compact mascot Course AI sender with an explicit guidance choice request', () => {
  assert.match(course, /const companionGuidancePrompt = \(\) => courseUi\(/);
  assert.match(course, /rephrase it, make the first part smaller, explain it in short chunks, or show one brief example/);
  assert.match(course, /const requestCompanionGuidance = async \(\)/);
  assert.match(course, /await sendCompanionMessage\(\);/);
  assert.match(course, /case 'companion-use':[\s\S]*partnerAction === 'teach-partner'[\s\S]*void requestCompanionGuidance\(\);/);
});

test('I’m stuck routes Talk to Course AI through the mascot on supported mascot layouts', () => {
  assert.match(course, /case 'help-open-ai':[\s\S]*mascotCanAppear\(\) && partnerControls\(\)\.enabled[\s\S]*void requestCompanionGuidance\(\);[\s\S]*else openCourseAi\(element\);/);
  assert.match(course, /state\.modal = '';/);
  assert.match(course, /partnerControls\(\)\.role/);
});

test('Course AI and mascot share one six-person CEME team fact set', () => {
  assert.match(aiService, /team of six CEME students/);
  for (const member of [
    'Muhammad Taha Bin Zaeem',
    'Muhammad Hamiz Bin Kashif',
    'Muhammad Fahad Younus',
    'Idrees Babar',
    'Alizay Hassan',
    'Lameea Mubashir Khan'
  ]) assert.match(aiService, new RegExp(member));
  assert.match(aiService, /UI\/UX Design Lead/);
  assert.doesNotMatch(aiService, /Type2Learn was founded by Muhammad Taha Bin Zaeem, Founder and Development Lead/);
});

test('current-page guidance is model-constrained before it can expose a task answer', () => {
  assert.match(aiService, /When the learner asks for help or guidance with the current page/);
  assert.match(aiService, /do not give them the task answer first/);
  assert.match(aiService, /Offer one clear choice: rephrase it, make the first part smaller, explain it in short chunks, or show one brief example/);
});
