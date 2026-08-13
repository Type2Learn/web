import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workspaceUrl = new URL('../../workspace.js', import.meta.url);
const adminUrl = new URL('../../admin/index.html', import.meta.url);

test('private educator upload controls use the same source and narration field names as the server', async () => {
  const [workspace, admin] = await Promise.all([readFile(workspaceUrl, 'utf8'), readFile(adminUrl, 'utf8')]);
  assert.match(admin, /name="audioFile"/);
  assert.match(admin, /name="sectionId"/);
  assert.match(admin, /data-narration-section-hint/);
  assert.match(admin, /data-mcq-draft-form/);
  assert.match(admin, /name="distractor3"/);
  assert.match(workspace, /form\.get\('sourceFile'\)\?\.size/);
  assert.match(workspace, /form\.get\('audioFile'\)\?\.size/);
  assert.doesNotMatch(workspace, /form\.get\('audio'\)\?\.size/);
  assert.match(workspace, /window\.open\(destination\.href/);
  assert.match(workspace, /courseId', course\.courseId/);
  assert.match(workspace, /form\.get\('answer'\)/);
  assert.match(workspace, /distractors: \['distractor1', 'distractor2', 'distractor3'\]/);
  assert.doesNotMatch(workspace, /prompt: 'Which answer best matches the reviewed key idea\?'/);
});
