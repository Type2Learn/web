import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseTheoryMarkdown, validateTheoryCourse } from '../../server/theory-course-markdown.mjs';

const workspaceSource = await readFile(new URL('../../workspace.js', import.meta.url), 'utf8');

const reviewedWorkspaceTemplate = () => {
  const start = workspaceSource.indexOf('const reviewedTemplate = `');
  const end = workspaceSource.indexOf('\n\nlet user = null;', start);
  assert.notEqual(start, -1, 'workspace needs an authoring template');
  assert.notEqual(end, -1, 'workspace template section must remain bounded');
  const templateSource = workspaceSource.slice(start, end);
  // The extracted declarations are literal template construction only. Running
  // this narrow slice verifies the exact browser template that an administrator
  // receives, rather than maintaining a separate test copy.
  return Function(templateSource + '; return reviewedTemplate;')();
};

test('admin template is a valid bilingual theory Markdown file before staff edit it', () => {
  const markdown = reviewedWorkspaceTemplate();
  const validation = validateTheoryCourse(parseTheoryMarkdown(markdown));
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  assert.equal(validation.modules.length, 1);
  assert.equal(validation.modules[0].id, 'first-idea');
});
