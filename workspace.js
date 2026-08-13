import { getType2LearnAuth, signOutType2LearnUser, waitForType2LearnUser } from '/firebase-auth.js';

const PAGE = document.body.dataset.workspace || 'teacher';
const DEMO = new URLSearchParams(window.location.search).get('demo') === '1';
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));
const status = (message, kind = 'info') => {
  const target = $('[data-workspace-status]');
  if (!target) return;
  target.hidden = false;
  target.dataset.kind = kind;
  target.textContent = message;
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const humanise = (value) => String(value || '').replace(/-/g, ' ');
const defaultTemplate = `---\nformat: type2learn-theory-course/v1\nid: new-theory-course\nversion: 1.0.0\ntitle.en: New theory course\ntitle.ur: نیا نظریاتی کورس\nlabel.en: Introduction\nlabel.ur: تعارف\nnotice.en: This course gives general educational information.\nnotice.ur: یہ کورس عمومی تعلیمی معلومات فراہم کرتا ہے۔\n---\n\n# Module: First idea\n\n## English\n### Definition\nWrite a short explanation.\n### Daily life\nDescribe a practical situation.\n### Strengths\nDescribe a strength.\n### Challenges\nDescribe a challenge.\n### Supports\nDescribe a support.\n### Simple\nWrite a plain-language version.\n### Example\nWrite one example.\n### Hint\nWrite a short hint.\n### Typing\nlevel: Key idea\nprompt: Type the key idea.\ntarget: A short key idea.\n### Check\nquestion: Which statement is correct?\n- [x] Correct answer\n- [ ] Incorrect answer one\n- [ ] Incorrect answer two\n- [ ] Incorrect answer three\n\n## Urdu\n### Definition\nمختصر وضاحت لکھیں۔\n### Daily life\nروزمرہ کی مثال لکھیں۔\n### Strengths\nایک خوبی لکھیں۔\n### Challenges\nایک چیلنج لکھیں۔\n### Supports\nایک مدد لکھیں۔\n### Simple\nسادہ وضاحت لکھیں۔\n### Example\nایک مثال لکھیں۔\n### Hint\nمختصر اشارہ لکھیں۔\n### Typing\nlevel: Key idea\nprompt: اہم بات لکھیں۔\ntarget: ایک مختصر اہم بات۔\n### Check\nquestion: درست بیان کون سا ہے؟\n- [x] درست جواب\n- [ ] غلط جواب ایک\n- [ ] غلط جواب دو\n- [ ] غلط جواب تین\n\n# Final exam\n## English\n### Question\nquestion: What is the key idea?\n- [x] Correct answer\n- [ ] Incorrect answer one\n- [ ] Incorrect answer two\n- [ ] Incorrect answer three\n## Urdu\n### Question\nquestion: اہم بات کیا ہے؟\n- [x] درست جواب\n- [ ] غلط جواب ایک\n- [ ] غلط جواب دو\n- [ ] غلط جواب تین\n`;
const reviewedTemplate = defaultTemplate
  .replace('## English\\n### Definition', '## English\\n### Title\\nOne small idea\\n### Definition')
  .replace('### Challenges\\nDescribe a challenge.\\n### Supports\\nDescribe a support.', '### Challenges\\n- One possible challenge\\n- Another possible challenge\\n### Supports\\n- One respectful support\\n- Another respectful support.')
  .replace('level: Key idea\\n', 'level: Key idea typing\\n')
  .replace('## Urdu\\n### Definition', '## Urdu\\n### Title\\nایک چھوٹا خیال\\n### Definition')
  .replace('### Challenges\\nایک چیلنج لکھیں۔\\n### Supports\\nایک مدد لکھیں۔', '### Challenges\\n- ایک ممکنہ مشکل\\n- دوسری ممکنہ مشکل\\n### Supports\\n- ایک باعزت مدد\\n- دوسری باعزت مدد.')
  .replace('## English\\n### Question', '## English\\n### Question 1')
  .replace('## Urdu\\n### Question', '## Urdu\\n### Question 1');

let user = null;
let account = null;
let submissions = [];
let courses = [];

const token = async () => {
  if (!user) throw new Error('Sign in is required.');
  return user.getIdToken();
};
const api = async (path, options = {}) => {
  const bearer = await token();
  const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${bearer}`, ...(options.headers || {}) } });
  if (response.headers.get('content-type')?.includes('application/json')) {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || 'The request could not be completed.');
    return payload;
  }
  if (!response.ok) throw new Error('The request could not be completed.');
  return response;
};
const show = (name) => {
  $$('[data-panel]').forEach((panel) => panel.classList.toggle('workspace-hidden', panel.dataset.panel !== name));
  $$('[data-workspace-nav]').forEach((button) => button.setAttribute('aria-current', String(button.dataset.workspaceNav === name ? 'page' : 'false')));
  window.history.replaceState({}, '', `#${name}`);
};
const hasRole = (role) => Boolean(account?.roles?.includes(role));
const primaryOrganisation = () => account?.organisations?.find((organisation) => organisation.active !== false)?.organisationId || '';
const allowedForPage = () => PAGE === 'admin' ? hasRole('platform-admin') : PAGE === 'teacher' ? hasRole('teacher') || hasRole('platform-admin') : PAGE === 'institute' ? hasRole('institute-owner') || hasRole('platform-admin') : true;

const demoAccount = () => ({ roles: PAGE === 'admin' ? ['platform-admin'] : PAGE === 'institute' ? ['institute-owner'] : ['teacher'], organisations: [{ organisationId: 'demo-learning-group', membershipRole: PAGE === 'institute' ? 'institute-owner' : 'teacher', active: true }] });
const renderIdentity = () => {
  const name = user?.displayName || user?.email?.split('@')[0] || (DEMO ? 'Preview account' : 'Signed-in account');
  $('[data-account-name]')?.replaceChildren(document.createTextNode(name));
  $('[data-role-name]')?.replaceChildren(document.createTextNode(account?.roles?.map(humanise).join(' · ') || 'No workspace role'));
};
const renderSubmissions = () => {
  const list = $('[data-submission-list]');
  if (!list) return;
  if (!submissions.length) {
    list.innerHTML = '<li class="workspace-empty">No course submissions are visible yet. Theory-course source material stays private until an administrator reviews it.</li>';
    return;
  }
  list.innerHTML = submissions.map((entry) => `<li><div><strong>${escapeHtml(entry.submittedTitle || entry.source?.originalName || 'Untitled source submission')}</strong><small>Submission ${escapeHtml(entry.submissionId)} · ${escapeHtml(entry.type)} · ${escapeHtml(entry.source?.extraction || 'private source')} · Organisation ${escapeHtml(entry.ownerOrganisationId || 'not set')} · Updated ${escapeHtml(entry.updatedAt || 'just now')}</small></div><span class="workspace-tag" data-state="${escapeHtml(entry.status)}">${escapeHtml(humanise(entry.status))}</span></li>`).join('');
};
const renderCourses = () => {
  const options = `<option value="">Choose a validated course</option>${courses.map((entry) => `<option value="${escapeHtml(entry.courseId)}@${escapeHtml(entry.version)}">${escapeHtml(entry.title?.en || entry.courseId)} · ${escapeHtml(entry.version)}</option>`).join('')}`;
  $$('[data-course-select]').forEach((select) => { const previous = select.value; select.innerHTML = options; select.value = courses.some((entry) => `${entry.courseId}@${entry.version}` === previous) ? previous : ''; });
};
const loadSubmissions = async () => {
  if (DEMO) {
    submissions = [{ courseId: 'how-learning-works', version: '1.0.0', title: { en: 'How learning works', ur: 'سیکھنا کیسے کام کرتا ہے' }, status: 'admin-review', updatedAt: 'Preview only' }];
    submissions = [{ submissionId: 'sub_preview', submittedTitle: 'How learning works notes', type: 'theory', status: 'admin-review', updatedAt: 'Preview only', source: { originalName: 'learning-notes.docx', extraction: 'requires-admin-transcription' } }];
    courses = [{ courseId: 'how-learning-works', version: '1.0.0', title: { en: 'How learning works', ur: 'سیکھنا کیسے کام کرتا ہے' }, status: 'admin-review' }];
    renderSubmissions();
    renderCourses();
    return;
  }
  try {
    const data = await api('/api/v1/course-authoring/submissions');
    submissions = data.submissions || [];
    renderSubmissions();
  } catch (error) { status(error.message, 'warning'); }
};
const loadCourses = async () => {
  if (DEMO) return;
  try { const data = await api('/api/v1/course-authoring/courses'); courses = data.courses || []; renderCourses(); } catch (error) { status(error.message, 'warning'); }
};
const selectedCourse = () => {
  const [courseId, version] = String($$('[data-course-select]').find((select) => select.value)?.value || '').split('@');
  if (!courseId || !version) throw new Error('Choose a course first.');
  return { courseId, version };
};
const refreshRole = async () => {
  if (DEMO) { account = demoAccount(); renderIdentity(); return; }
  const data = await api('/api/v1/access/me');
  account = data.account;
  renderIdentity();
};
const renderWorkspace = () => {
  const restricted = $('[data-role-required]');
  if (restricted) restricted.hidden = allowedForPage();
  $$('[data-private-workspace]').forEach((node) => { node.hidden = !allowedForPage(); });
  if (!allowedForPage()) status('This signed-in account does not have access to this private workspace. Redeem an authorised role code or use the learner dashboard.', 'warning');
};

const bindNavigation = () => {
  $$('[data-workspace-nav]').forEach((button) => button.addEventListener('click', () => show(button.dataset.workspaceNav)));
  const hash = location.hash.slice(1);
  if (hash && $('[data-panel="' + CSS.escape(hash) + '"]')) show(hash);
};
const bindCourseSelectors = () => {
  $$('[data-course-select]').forEach((select) => select.addEventListener('change', () => {
    $$('[data-course-select]').forEach((other) => { if (other !== select) other.value = select.value; });
  }));
};
const bindRoleCodes = () => {
  $('[data-role-code-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api('/api/v1/access/codes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: form.get('kind'), organisationName: form.get('organisationName'), organisationId: form.get('organisationId'), expiresInHours: form.get('expiresInHours') }) });
      $('[data-generated-code]').textContent = result.code;
      $('[data-generated-code-wrap]').hidden = false;
      status('One-use access code created. Copy it now; the raw code is never stored.', 'success');
    } catch (error) { status(error.message, 'error'); }
  });
  $('[data-learner-code-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await api('/api/v1/access/codes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'learner', organisationId: primaryOrganisation(), expiresInHours: new FormData(event.currentTarget).get('expiresInHours') }) });
      $('[data-generated-code]').textContent = result.code;
      $('[data-generated-code-wrap]').hidden = false;
      status('One-use learner invite created. It expires automatically and can be revoked.', 'success');
    } catch (error) { status(error.message, 'error'); }
  });
};
const bindSubmission = () => {
  $$('[data-course-type]').forEach((button) => button.addEventListener('click', () => {
    if (button.disabled) { status('Only theory courses are supported at this stage. This type is intentionally locked.', 'warning'); return; }
    $$('[data-course-type]').forEach((item) => item.closest('.workspace-card')?.classList.remove('is-selected'));
    button.closest('.workspace-card')?.classList.add('is-selected');
    $('[data-course-type-input]').value = button.dataset.courseType;
  }));
  $('[data-source-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!form.get('source')?.size) { status('Choose source material to submit privately.', 'error'); return; }
    try {
      const result = await api('/api/v1/course-authoring/source', { method: 'POST', body: form });
      status(`Source submitted as ${result.submission?.submissionId}. ${result.submission?.source?.extraction === 'requires-admin-transcription' ? 'It is private and requires administrator transcription.' : 'Its safe text is ready for review.'}`, 'success');
      event.currentTarget.reset();
      await loadSubmissions();
    } catch (error) { status(error.message, 'error'); }
  });
};
const bindAuthoring = () => {
  const template = $('[data-markdown]');
  $('[data-use-template]')?.addEventListener('click', () => { if (template) template.value = reviewedTemplate; });
  $('[data-open-source-review]')?.addEventListener('click', async () => {
    const submissionId = String($('[data-authoring-submission]')?.value || '').trim();
    if (!submissionId) { status('Enter the private source submission ID first.', 'warning'); return; }
    try {
      const result = await api(`/api/v1/course-authoring/submission-review?submissionId=${encodeURIComponent(submissionId)}`);
      $('[data-source-review-output]').textContent = result.requiresAdminTranscription
        ? 'This private source needs administrator transcription before it can become reviewed Markdown. Its original upload remains private.'
        : result.extractedText || 'No safe text was extracted.';
      if ($('[data-ai-source-excerpt]') && result.extractedText) $('[data-ai-source-excerpt]').value = result.extractedText.slice(0, 12000);
      if ($('[data-authoring-organisation]') && !($('[data-authoring-organisation]').value)) $('[data-authoring-organisation]').value = result.submission?.ownerOrganisationId || '';
      status('Private source review opened for the administrator. It is never exposed to learner pages.', 'success');
    } catch (error) { status(error.message, 'error'); }
  });
  $('[data-markdown-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await api('/api/v1/course-authoring/markdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: $('[data-authoring-course-id]')?.value, version: $('[data-authoring-version]')?.value, ownerOrganisationId: $('[data-authoring-organisation]')?.value, submissionId: $('[data-authoring-submission]')?.value, markdown: template?.value || '' }) });
      status(result.validation?.valid ? 'Markdown is valid. The learner-safe and private authoring manifests are ready for review.' : `Markdown needs attention: ${(result.validation?.errors || []).join(' ')}`, result.validation?.valid ? 'success' : 'warning');
      await loadSubmissions();
      await loadCourses();
    } catch (error) { status(error.message, 'error'); }
  });
  $('[data-ai-draft-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const { courseId, version } = selectedCourse();
      const sourceExcerpt = new FormData(event.currentTarget).get('sourceExcerpt');
      const result = await api('/api/v1/course-authoring/ai-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId, version, sourceExcerpt }) });
      $('[data-ai-draft-output]').textContent = JSON.stringify(result.draft || result, null, 2);
      status('AI draft saved as review-only. It is not learner-visible until an administrator accepts each item.', 'success');
    } catch (error) { status(error.message, 'error'); }
  });
  $('[data-mcq-draft]')?.addEventListener('click', async () => {
    try {
      const { courseId, version } = selectedCourse();
      const result = await api('/api/v1/course-authoring/deterministic-mcq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId, version, prompt: 'Which answer best matches the reviewed key idea?' }) });
      $('[data-ai-draft-output]').textContent = JSON.stringify(result, null, 2);
      status('Fallback MCQ draft created for human review. It has four choices and cannot publish by itself.', 'success');
    } catch (error) { status(error.message, 'error'); }
  });
  $('[data-begin-admin-review]')?.addEventListener('click', async () => {
    try { await api('/api/v1/course-authoring/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selectedCourse(), status: 'admin-review', reviewNote: 'Administrator is reviewing source, bilingual Markdown, learner preview, accessibility, and MCQs.' }) }); status('The course is now in administrator review. Review each learner-facing element before continuing.', 'success'); await loadCourses(); } catch (error) { status(error.message, 'error'); }
  });
};
const bindPublishing = () => {
  $('[data-narration-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!form.get('audio')?.size) { status('Choose a human narration file, or retain the clearly labelled device text-to-speech fallback.', 'warning'); return; }
    try { const selected = selectedCourse(); form.set('courseId', selected.courseId); form.set('version', selected.version); await api('/api/v1/course-authoring/narration', { method: 'POST', body: form }); status('Private human narration uploaded for administrator review.', 'success'); } catch (error) { status(error.message, 'error'); }
  });
  $('[data-verify-backups]')?.addEventListener('click', async () => {
    try { const result = await api('/api/v1/course-authoring/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selectedCourse()) }); status(result.exportReady ? 'All three remote backups verified. Download the immutable ZIP next to acknowledge it.' : 'Backup verification needs attention.', result.exportReady ? 'success' : 'warning'); await loadSubmissions(); } catch (error) { status(error.message, 'error'); }
  });
  $('[data-ready-for-backup]')?.addEventListener('click', async () => {
    try { await api('/api/v1/course-authoring/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selectedCourse(), status: 'backups-pending', reviewNote: 'Administrator completed review and selected the device text-to-speech fallback or reviewed narration.' }) }); status('Review is complete. The four backup receipts can now be verified.', 'success'); await loadCourses(); } catch (error) { status(error.message, 'error'); }
  });
  $('[data-download-export]')?.addEventListener('click', async () => {
    try {
      const { courseId, version } = selectedCourse();
      const response = await api(`/api/v1/course-authoring/export?courseId=${encodeURIComponent(courseId)}&version=${encodeURIComponent(version)}`);
      const blob = await response.blob(); const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = `${courseId}-${version}.zip`; anchor.click(); URL.revokeObjectURL(anchor.href);
      status('ZIP export downloaded and acknowledged. The release gate can now be checked.', 'success');
    } catch (error) { status(error.message, 'error'); }
  });
  $('[data-publish-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { const result = await api('/api/v1/course-authoring/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selectedCourse(), audience: new FormData(event.currentTarget).get('audience') }) }); status(`${result.courseId} is published to ${result.audience === 'platform' ? 'the platform catalogue' : 'its organisation'} after all required backup checks.`, 'success'); await loadSubmissions(); } catch (error) { status(error.message, 'error'); }
  });
  $('[data-approve-course]')?.addEventListener('click', async () => {
    try { await api('/api/v1/course-authoring/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selectedCourse(), status: 'approved', reviewNote: 'Administrator approval after learner-preview, accessibility, MCQ, narration, and backup review.' }) }); status('Administrator approval recorded. The course can now pass through the final publication gate.', 'success'); await loadCourses(); } catch (error) { status(error.message, 'error'); }
  });
};
const bindRoster = () => {
  $('[data-load-roster]')?.addEventListener('click', async () => {
    try { const data = await api(`/api/v1/access/roster?organisationId=${encodeURIComponent(primaryOrganisation())}`); const list = $('[data-roster-list]'); list.innerHTML = data.members.length ? data.members.map((member) => `<li><div><strong>${escapeHtml(member.membershipRole)}</strong><small>Member ID: ${escapeHtml(member.memberId)} · Joined ${escapeHtml(member.joinedAt)}</small></div></li>`).join('') : '<li class="workspace-empty">No active members yet. Create a learner invite to build this private roster.</li>'; } catch (error) { status(error.message, 'error'); }
  });
};
const bindDistribution = () => {
  $('[data-set-organisation-distribution]')?.addEventListener('click', async () => {
    try { const result = await api('/api/v1/courses/distribution', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selectedCourse(), mode: 'organisation' }) }); status(`Course visibility is now set to the enrolled organisation roster (${result.distribution.mode}).`, 'success'); } catch (error) { status(error.message, 'error'); }
  });
  $('[data-set-assigned-distribution]')?.addEventListener('click', async () => {
    try {
      const learnerIds = String($('[data-assigned-learner-ids]')?.value || '').split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
      const result = await api('/api/v1/courses/distribution', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selectedCourse(), mode: 'assigned', learnerIds }) });
      status(`Course assigned to ${result.distribution.learnerCount} enrolled learner${result.distribution.learnerCount === 1 ? '' : 's'}.`, 'success');
    } catch (error) { status(error.message, 'error'); }
  });
  $('[data-request-platform-release]')?.addEventListener('click', async () => {
    try { const result = await api('/api/v1/courses/request-platform-release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selectedCourse()) }); status(`Platform-wide release request recorded as ${result.status}. It still needs administrator approval.`, 'success'); } catch (error) { status(error.message, 'error'); }
  });
};
const bindBootstrap = () => {
  $('[data-bootstrap-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { const result = await api('/api/v1/access/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setupCode: new FormData(event.currentTarget).get('setupCode') }) }); if (result.refreshToken) await getType2LearnAuth().currentUser?.getIdToken(true); await refreshRole(); renderWorkspace(); status('First administrator configured. The secret is now invalid and only its server-side hash was ever stored.', 'success'); } catch (error) { status(error.message, 'error'); }
  });
};
const bindRedeem = () => {
  $('[data-redeem-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { const result = await api('/api/v1/access/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: new FormData(event.currentTarget).get('code') }) }); if (result.refreshToken) await getType2LearnAuth().currentUser?.getIdToken(true); account = result.account; renderIdentity(); status('Code redeemed safely. Your workspace access is ready.', 'success'); const destination = account.roles.includes('platform-admin') ? '/admin/' : account.roles.includes('institute-owner') ? '/institute/' : account.roles.includes('teacher') ? '/teacher/' : '/courses/'; $('[data-continue-link]').href = destination; $('[data-continue-link]').hidden = false; } catch (error) { status(error.message, 'error'); }
  });
};
const bindShared = () => {
  $('[data-sign-out]')?.addEventListener('click', async () => { await signOutType2LearnUser(); location.assign('/'); });
  $('[data-view-learner]')?.addEventListener('click', () => { $('[data-learner-preview]')?.classList.toggle('workspace-hidden'); });
};

const initialise = async () => {
  bindNavigation(); bindCourseSelectors(); bindShared(); bindRoleCodes(); bindSubmission(); bindAuthoring(); bindPublishing(); bindRoster(); bindDistribution(); bindBootstrap(); bindRedeem();
  if (DEMO) { account = demoAccount(); renderIdentity(); renderWorkspace(); await loadSubmissions(); status('Preview mode shows the interface only. It cannot access a learner record or call protected APIs.', 'warning'); return; }
  user = await waitForType2LearnUser();
  if (!user) { location.assign(`/login/?next=${encodeURIComponent(location.pathname + location.hash)}`); return; }
  try { await refreshRole(); renderWorkspace(); await loadSubmissions(); await loadCourses(); } catch (error) { status(error.message, 'error'); }
};
initialise();
