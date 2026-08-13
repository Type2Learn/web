import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workspaceUrl = new URL('../../workspace.js', import.meta.url);
const adminUrl = new URL('../../admin/index.html', import.meta.url);

test('private educator upload controls use the same source and narration field names as the server', async () => {
  const [workspace, admin] = await Promise.all([readFile(workspaceUrl, 'utf8'), readFile(adminUrl, 'utf8')]);
  assert.match(admin, /name="audioFile"/);
  assert.match(workspace, /form\.get\('sourceFile'\)\?\.size/);
  assert.match(workspace, /form\.get\('audioFile'\)\?\.size/);
  assert.doesNotMatch(workspace, /form\.get\('audio'\)\?\.size/);
});
