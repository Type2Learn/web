const adminStatus = document.querySelector('[data-workspace-status]');
const adminRole = document.querySelector('[data-role-name]');

// ADMIN INFORMATION ARCHITECTURE -------------------------------------------
// The authoring controls use one shared course state and therefore must stay
// in the same document, but they do not need to be shown as one enormous page.
// Move the existing, already-bound controls into focused navigation panels.
// Moving nodes preserves every listener registered by workspace.js while
// making normal PDF intake a distinct first step.
const organiseAdministratorWorkspace = () => {
  if (document.documentElement.dataset.adminSectionsOrganised === 'true') return;
  const authoringPanel = document.querySelector('.admin-authoring-panel');
  const sourceSlot = document.querySelector('[data-admin-slot="source"]');
  const sourceActionsSlot = document.querySelector('[data-admin-slot="source-actions"]');
  const builderSlot = document.querySelector('[data-admin-slot="builder"]');
  const reviewSlot = document.querySelector('[data-admin-slot="review"]');
  const toolsSlot = document.querySelector('[data-admin-slot="tools"]');
  const assessmentsSlot = document.querySelector('[data-admin-slot="assessments"]');
  if (!authoringPanel || !sourceSlot || !sourceActionsSlot || !builderSlot || !reviewSlot || !toolsSlot || !assessmentsSlot) return;

  const sourceForm = authoringPanel.querySelector('[data-admin-source-form]');
  const markdownForm = authoringPanel.querySelector('[data-markdown-form]');
  const coursePicker = [...authoringPanel.children].find((node) => node.querySelector?.('[data-course-select]'));
  const courseActionRow = [...authoringPanel.children].find((node) => node.classList?.contains('workspace-row'));
  const templateButton = courseActionRow?.querySelector('[data-use-template]');
  const openCourseReviewButton = courseActionRow?.querySelector('[data-open-course-review]');
  const courseReview = authoringPanel.querySelector('[data-course-review]');

  // The manual Markdown form contains a few advanced source-review actions.
  // They remain fully functional, but appear with the uploaded source rather
  // than beside the manual typing controls.
  const sourceReviewRow = markdownForm?.querySelector('[data-open-source-review]')?.closest('.workspace-row');
  const sourceReviewOutput = markdownForm?.querySelector('[data-source-review-output]');
  const convertRow = markdownForm?.querySelector('[data-convert-source]')?.closest('.workspace-row');
  const conversionOutput = markdownForm?.querySelector('[data-source-conversion-output]');

  sourceActionsSlot.replaceChildren();
  sourceActionsSlot.insertAdjacentHTML('afterbegin', '<p class="workspace-eyebrow">Source review</p><h3>Inspect or convert an extracted source</h3><p>After upload, conversion starts automatically. These controls are for an administrator who needs to reopen a private source, inspect the extraction, or retry a review-only conversion.</p>');
  if (sourceForm) sourceSlot.append(sourceForm);
  [sourceReviewRow, sourceReviewOutput, convertRow, conversionOutput].filter(Boolean).forEach((node) => sourceActionsSlot.append(node));
  // Keep the template action with manual authoring, while the existing-course
  // picker and its review action stay together on the review page.
  if (templateButton) {
    const templateRow = document.createElement('div');
    templateRow.className = 'workspace-row';
    templateRow.append(templateButton);
    builderSlot.append(templateRow);
  }
  if (markdownForm) builderSlot.append(markdownForm);
  if (courseActionRow && !openCourseReviewButton) courseActionRow.remove();
  [coursePicker, courseActionRow, courseReview].filter(Boolean).forEach((node) => reviewSlot.append(node));
  authoringPanel.remove();

  const reviewTools = document.querySelector('[data-ai-draft-form]')?.closest('.workspace-panel');
  const assessmentPanel = document.querySelector('[data-assessment-draft-form]')?.closest('.workspace-panel');
  const fallbackMcqPanel = document.querySelector('[data-mcq-draft-form]')?.closest('.workspace-panel');
  if (reviewTools) toolsSlot.append(reviewTools);
  [assessmentPanel, fallbackMcqPanel].filter(Boolean).forEach((node) => assessmentsSlot.append(node));

  document.documentElement.dataset.adminSectionsOrganised = 'true';
};

organiseAdministratorWorkspace();

const clearStaleStartupAuthMessage = () => {
  if (!adminStatus || !adminRole) return;
  const workspaceReady =
    !document.body.classList.contains('workspace-auth-pending') &&
    !document.body.classList.contains('workspace-access-denied');
  const verifiedRole = adminRole.textContent.trim() && adminRole.textContent.trim() !== 'Checking access';
  const staleStartupMessage = adminStatus.textContent.trim() === 'Sign in is required.';

  if (workspaceReady && verifiedRole && staleStartupMessage) {
    adminStatus.hidden = true;
    adminStatus.textContent = '';
    delete adminStatus.dataset.kind;
  }
};

const adminUiObserver = new MutationObserver(clearStaleStartupAuthMessage);
adminUiObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
if (adminStatus) adminUiObserver.observe(adminStatus, { childList: true, characterData: true, subtree: true, attributes: true });
if (adminRole) adminUiObserver.observe(adminRole, { childList: true, characterData: true, subtree: true });

clearStaleStartupAuthMessage();
window.addEventListener('load', clearStaleStartupAuthMessage, { once: true });
