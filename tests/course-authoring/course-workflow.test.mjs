import assert from 'node:assert/strict';
import test from 'node:test';
import { COURSE_WORKFLOW_STATES, canTransitionCourseWorkflow, nextCourseWorkflowStates } from '../../server/course-workflow.mjs';

const expected = {
  submitted: ['source-reviewed', 'returned', 'rejected'],
  'source-reviewed': ['markdown-draft', 'returned', 'rejected'],
  'markdown-draft': ['validation-ready', 'returned', 'rejected'],
  'validation-ready': ['ai-draft-ready', 'admin-review', 'returned'],
  'ai-draft-ready': ['admin-review', 'markdown-draft', 'returned'],
  'admin-review': ['audio-ready', 'backups-pending', 'markdown-draft', 'returned'],
  'audio-ready': ['backups-pending', 'admin-review'],
  'backups-pending': ['backups-verified', 'admin-review'],
  'backups-verified': ['approved', 'admin-review'],
  approved: ['published', 'admin-review'],
  published: [],
  returned: ['markdown-draft', 'rejected'],
  rejected: []
};

for (const from of COURSE_WORKFLOW_STATES) {
  for (const to of COURSE_WORKFLOW_STATES) {
    test(`workflow ${from} → ${to} is ${expected[from].includes(to) ? 'allowed' : 'blocked'}`, () => {
      assert.equal(canTransitionCourseWorkflow(from, to), expected[from].includes(to));
    });
  }
}

test('workflow rejects unknown states and lists only the next human-review choices', () => {
  assert.equal(canTransitionCourseWorkflow('unknown', 'approved'), false);
  assert.deepEqual(nextCourseWorkflowStates('backups-verified'), ['approved', 'admin-review']);
  assert.deepEqual(nextCourseWorkflowStates('published'), []);
});
