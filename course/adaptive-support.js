// Presentation only. The server decides whether a proposal exists; this module
// never derives a diagnosis or changes learner settings by itself.
export const adaptiveProposalMarkup = ({ proposal, escapeHtml, courseUi }) => {
  if (!proposal || proposal.status !== 'active') return '';
  const why = proposal.reason ? '<details><summary>' + escapeHtml(courseUi('Why this suggestion?', 'یہ تجویز کیوں؟')) + '</summary><p>' + escapeHtml(proposal.reason) + '</p></details>' : '';
  return '<aside class="course-adaptive-proposal" data-adaptive-proposal data-proposal-id="' + escapeHtml(proposal.id) + '" role="status" aria-live="polite"><p class="course-eyebrow">' + escapeHtml(courseUi('OPTIONAL SUPPORT', 'اختیاری مدد')) + '</p><h3>' + escapeHtml(proposal.title) + '</h3><p>' + escapeHtml(proposal.description) + '</p><div class="course-adaptive-proposal-actions"><button class="course-primary-button" type="button" data-action="accept-adaptive-proposal">' + escapeHtml(courseUi('Try it next module', 'اگلے ماڈیول میں آزمائیں')) + '</button><button class="course-secondary-button" type="button" data-action="decline-adaptive-proposal">' + escapeHtml(courseUi('Keep my settings', 'میری ترتیبات رکھیں')) + '</button></div>' + why + '</aside>';
};

export const taskInitiationMarkup = ({ active, escapeHtml, courseUi }) => active
  ? '<aside class="course-task-initiation" data-task-initiation role="note"><strong>' + escapeHtml(courseUi('Start one small step', 'ایک چھوٹا قدم شروع کریں')) + '</strong><p>' + escapeHtml(courseUi('Begin with the first bold question. You can take the rest one part at a time.', 'پہلے نمایاں سوال سے شروع کریں۔ باقی کام ایک ایک حصے میں کریں۔')) + '</p><div><button class="course-primary-button" type="button" data-action="dismiss-task-initiation">' + escapeHtml(courseUi('I’m ready', 'میں تیار ہوں')) + '</button><button class="course-secondary-button" type="button" data-action="dismiss-task-initiation">' + escapeHtml(courseUi('Not now', 'ابھی نہیں')) + '</button></div></aside>'
  : '';
