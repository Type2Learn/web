import { signOutType2LearnUser, waitForType2LearnUser } from '/firebase-auth.js';

const demo = new URLSearchParams(location.search).get('demo') === '1';
const status = (message, kind = 'info') => { const target = document.querySelector('[data-courses-status]'); target.hidden = false; target.dataset.kind = kind; target.textContent = message; };
const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const launchUrl = (course) => `/course/?courseId=${encodeURIComponent(course.courseId)}&version=${encodeURIComponent(course.version)}`;
const card = (course, primary = false) => `<article class="${primary ? 'courses-continue' : 'courses-course'}"><div><p class="workspace-eyebrow">${escapeHtml(course.label?.en || 'Educational course')}</p><h${primary ? '2' : '3'}>${escapeHtml(course.title?.en || course.courseId)}</h${primary ? '2' : '3'}><p>${course.modules} short module${course.modules === 1 ? '' : 's'} · ${course.availability === 'platform' ? 'Platform-approved' : 'Assigned to your learning group'}</p></div><a class="workspace-button workspace-button--primary" href="${launchUrl(course)}">${primary ? 'Continue' : 'Open course'} <span aria-hidden="true">→</span></a></article>`;
const render = (courses) => {
  const continueTarget = document.querySelector('[data-continue-course]');
  const list = document.querySelector('[data-course-list]');
  if (!courses.length) { continueTarget.innerHTML = '<h2>No course is assigned yet.</h2><p>Your teacher or institute can invite you to their private roster. You can return whenever you are ready.</p>'; list.innerHTML = '<div class="workspace-empty">There are no other approved courses available to this account.</div>'; return; }
  continueTarget.outerHTML = card(courses[0], true).replace('class="courses-continue"', 'class="courses-continue" data-continue-course');
  list.innerHTML = courses.slice(1).length ? courses.slice(1).map((course) => card(course)).join('') : '<div class="workspace-empty">This is your one clear course choice right now.</div>';
};
document.querySelector('[data-courses-signout]')?.addEventListener('click', async () => { await signOutType2LearnUser(); location.assign('/'); });

if (demo) {
  render([{ courseId: 'course-1-neurodivergent-conditions-v2', version: '1.1', title: { en: 'Introduction to Neurodivergent Conditions' }, label: { en: 'Educational course' }, modules: 11, availability: 'platform' }]);
  status('Preview mode is visual only. A real catalogue uses the signed-in account and server-side membership checks.', 'warning');
} else {
  const user = await waitForType2LearnUser();
  if (!user) location.assign(`/login/?next=${encodeURIComponent('/courses/')}`);
  else {
    try {
      const response = await fetch('/api/v1/courses', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || 'Your course catalogue is unavailable right now.');
      render(data.courses || []);
    } catch (error) { status(error.message, 'error'); render([]); }
  }
}
