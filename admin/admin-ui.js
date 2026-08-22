const adminStatus = document.querySelector('[data-workspace-status]');
const adminRole = document.querySelector('[data-role-name]');

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
