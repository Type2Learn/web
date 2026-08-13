export const COURSE_WORKFLOW_STATES = Object.freeze([
  'submitted', 'source-reviewed', 'markdown-draft', 'validation-ready', 'ai-draft-ready', 'admin-review',
  'audio-ready', 'backups-pending', 'backups-verified', 'approved', 'published', 'returned', 'rejected'
]);

const nextStates = Object.freeze({
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
});

export const isWorkflowState = (value) => COURSE_WORKFLOW_STATES.includes(String(value || ''));
export const canTransitionCourseWorkflow = (from, to) => isWorkflowState(from) && isWorkflowState(to) && nextStates[from].includes(to);
export const nextCourseWorkflowStates = (from) => isWorkflowState(from) ? [...nextStates[from]] : [];
