import { getType2LearnAuth, signOutType2LearnUser, waitForType2LearnUser } from '/firebase-auth.js';
import { buildStructuredTheoryMarkdown } from '/course-authoring-form.js';

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
// This is a deliberately complete, valid file rather than a collection of
// browser-side string replacements. Administrators can safely begin from it,
// validate immediately, then replace the instructional text with reviewed
// bilingual content. The strict server parser remains the source of truth.
const reviewedTemplate = `---\nformat: type2learn-theory-course/v1\nid: new-theory-course\nversion: 1.0.0\ntitle.en: New theory course\ntitle.ur: نیا نظریاتی کورس\nlabel.en: Introduction\nlabel.ur: تعارف\nnotice.en: This course gives general educational information.\nnotice.ur: یہ کورس عمومی تعلیمی معلومات فراہم کرتا ہے۔\n---\n\n# Module: first-idea\n\n## English\n### Title\nOne small idea\n### Definition\nWrite a short, reviewed explanation.\n### Daily life\nDescribe one practical situation.\n### Strengths\nDescribe one possible strength without making assumptions about every learner.\n### Challenges\n- One possible challenge\n- Another possible challenge\n### Supports\n- One respectful support\n- Another respectful support\n### Simple\nWrite a plain-language version.\n### Example\nWrite one concrete example.\n### Hint\nWrite one optional, brief hint.\n### Typing\nlevel: Key idea typing\nprompt: Type the key idea.\ntarget: A short reviewed key idea.\n### Check\nquestion: Which statement is correct?\n- [x] The reviewed correct response\n- [ ] A plausible but incorrect response\n- [ ] Another incorrect response\n- [ ] Another incorrect response\n\n## Urdu\n### Title\nایک چھوٹا خیال\n### Definition\nمختصر، جائزہ شدہ وضاحت لکھیں۔\n### Daily life\nروزمرہ کی ایک عملی صورت بیان کریں۔\n### Strengths\nہر سیکھنے والے کے بارے میں مفروضہ کیے بغیر ایک ممکنہ طاقت لکھیں۔\n### Challenges\n- ایک ممکنہ مشکل\n- دوسری ممکنہ مشکل\n### Supports\n- ایک باعزت مدد\n- دوسری باعزت مدد\n### Simple\nسادہ زبان میں وضاحت لکھیں۔\n### Example\nایک واضح مثال لکھیں۔\n### Hint\nایک مختصر اختیاری اشارہ لکھیں۔\n### Typing\nlevel: Key idea typing\nprompt: اہم خیال لکھیں۔\ntarget: ایک مختصر جائزہ شدہ اہم خیال۔\n### Check\nquestion: درست بیان کون سا ہے؟\n- [x] جائزہ شدہ درست جواب\n- [ ] بظاہر درست مگر غلط جواب\n- [ ] ایک اور غلط جواب\n- [ ] ایک اور غلط جواب\n\n# Final exam\n\n## English\n### Question 1\nquestion: What is the key idea?\n- [x] The reviewed correct response\n- [ ] A plausible but incorrect response\n- [ ] Another incorrect response\n- [ ] Another incorrect response\n\n## Urdu\n### Question 1\nquestion: اہم خیال کیا ہے؟\n- [x] جائزہ شدہ درست جواب\n- [ ] بظاہر درست مگر غلط جواب\n- [ ] ایک اور غلط جواب\n- [ ] ایک اور غلط جواب\n`;

// ADMIN COURSE FORM BUILDER -------------------------------------------------
// Administrators should not have to hand-author a semi-structured file just to
// publish a theory course. This local, deterministic form produces the exact
// reviewed Markdown contract that the server parser validates. Markdown stays
// available for a direct import or an expert final review; the form is simply
// the safer default authoring surface.
const builderStarter = () => ({
  course: {
    id: 'new-theory-course', version: '1.0.0',
    titleEn: 'New theory course', titleUr: 'نیا نظریاتی کورس',
    labelEn: 'Introduction', labelUr: 'تعارف',
    noticeEn: 'This course gives general educational information.',
    noticeUr: 'یہ کورس عمومی تعلیمی معلومات فراہم کرتا ہے۔'
  },
  modules: [{
    id: 'first-idea',
    en: {
      title: 'One small idea', definition: 'Write a short, reviewed explanation.', dailyLife: 'Describe one practical situation.',
      strengths: 'Describe one possible strength without making assumptions about every learner.',
      challenges: 'One possible challenge\nAnother possible challenge', supports: 'One respectful support\nAnother respectful support',
      simple: 'Write a plain-language version.', example: 'Write one concrete example.', hint: 'Write one optional, brief hint.',
      typingLevel: 'Key idea typing', typingPrompt: 'Type the key idea.', typingTarget: 'A short reviewed key idea.',
      checkQuestion: 'Which statement is correct?', checkCorrect: 'The reviewed correct response',
      checkAlternative1: 'A plausible but incorrect response', checkAlternative2: 'Another incorrect response', checkAlternative3: 'Another incorrect response'
    },
    ur: {
      title: 'ایک چھوٹا خیال', definition: 'مختصر، جائزہ شدہ وضاحت لکھیں۔', dailyLife: 'روزمرہ کی ایک عملی صورت بیان کریں۔',
      strengths: 'ہر سیکھنے والے کے بارے میں مفروضہ کیے بغیر ایک ممکنہ طاقت لکھیں۔',
      challenges: 'ایک ممکنہ مشکل\nدوسری ممکنہ مشکل', supports: 'ایک باعزت مدد\nدوسری باعزت مدد',
      simple: 'سادہ زبان میں وضاحت لکھیں۔', example: 'ایک واضح مثال لکھیں۔', hint: 'ایک مختصر اختیاری اشارہ لکھیں۔',
      // Stored values remain canonical while Urdu labels are localized in the
      // selector below, matching the strict server-side Markdown contract.
      typingLevel: 'Key idea typing', typingPrompt: 'اہم خیال لکھیں۔', typingTarget: 'ایک مختصر جائزہ شدہ اہم خیال۔',
      checkQuestion: 'درست بیان کون سا ہے؟', checkCorrect: 'جائزہ شدہ درست جواب',
      checkAlternative1: 'بظاہر درست مگر غلط جواب', checkAlternative2: 'ایک اور غلط جواب', checkAlternative3: 'ایک اور غلط جواب'
    }
  }],
  finalQuestions: [{
    en: { question: 'What is the key idea?', correct: 'The reviewed correct response', alternative1: 'A plausible but incorrect response', alternative2: 'Another incorrect response', alternative3: 'Another incorrect response' },
    ur: { question: 'اہم خیال کیا ہے؟', correct: 'جائزہ شدہ درست جواب', alternative1: 'بظاہر درست مگر غلط جواب', alternative2: 'ایک اور غلط جواب', alternative3: 'ایک اور غلط جواب' }
  }]
});
const builderCopy = (value) => JSON.parse(JSON.stringify(value));
const builderText = (value) => String(value ?? '').replace(/\r/g, '').trim();
const builderLine = (value) => builderText(value).replace(/\s+/g, ' ');
const builderIdentifier = (value, fallback = '') => builderLine(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || fallback;
const builderParagraph = (value) => builderText(value).split('\n').map((line) => builderLine(line)).filter(Boolean).join(' ');
const builderList = (value) => builderText(value).split('\n').map((line) => builderLine(line.replace(/^[-*]\s*/, ''))).filter(Boolean);
const builderField = ({ label, key, value = '', help = '', multiline = false, direction = 'auto' }) => `<label class="workspace-field">${escapeHtml(label)}${help ? `<span>${escapeHtml(help)}</span>` : ''}${multiline ? `<textarea data-builder-field="${escapeHtml(key)}" dir="${direction}">${escapeHtml(value)}</textarea>` : `<input data-builder-field="${escapeHtml(key)}" dir="${direction}" value="${escapeHtml(value)}">`}</label>`;
const builderTypingLevelField = ({ language, value, direction }) => {
  const labels = language === 'ur'
    ? [['Key idea typing', 'اہم خیال لکھنا'], ['Guided typing', 'رہنمائی کے ساتھ لکھنا'], ['Recall typing', 'یاد سے لکھنا']]
    : [['Key idea typing', 'Key idea typing'], ['Guided typing', 'Guided typing'], ['Recall typing', 'Recall typing']];
  const title = language === 'ur' ? 'Urdu — typing activity' : 'English — typing activity';
  return `<label class="workspace-field">${title}<span>Choose the learner activity. Its valid course value is set automatically.</span><select data-builder-field="${language}.typingLevel" dir="${direction}">${labels.map(([stored, label]) => `<option value="${stored}"${stored === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>`;
};
const builderLanguageFields = (language, fields) => {
  const urdu = language === 'ur';
  const suffix = urdu ? 'Urdu' : 'English';
  const direction = urdu ? 'rtl' : 'auto';
  const label = (name) => `${suffix} — ${name}`;
  return `<div class="authoring-language" dir="${direction}">
    <h4>${escapeHtml(suffix)}</h4>
    <div class="workspace-grid">
      ${builderField({ label: label('module title'), key: `${language}.title`, value: fields.title, direction })}
      ${builderField({ label: label('definition'), key: `${language}.definition`, value: fields.definition, multiline: true, direction })}
      ${builderField({ label: label('daily-life context'), key: `${language}.dailyLife`, value: fields.dailyLife, multiline: true, direction })}
      ${builderField({ label: label('strengths'), key: `${language}.strengths`, value: fields.strengths, multiline: true, direction })}
      ${builderField({ label: label('challenges'), key: `${language}.challenges`, value: fields.challenges, help: 'One item per line.', multiline: true, direction })}
      ${builderField({ label: label('supports'), key: `${language}.supports`, value: fields.supports, help: 'One item per line.', multiline: true, direction })}
      ${builderField({ label: label('plain-language explanation'), key: `${language}.simple`, value: fields.simple, multiline: true, direction })}
      ${builderField({ label: label('concrete example'), key: `${language}.example`, value: fields.example, multiline: true, direction })}
      ${builderField({ label: label('optional hint'), key: `${language}.hint`, value: fields.hint, multiline: true, direction })}
      ${builderTypingLevelField({ language, value: fields.typingLevel, direction })}
      ${builderField({ label: label('typing instruction'), key: `${language}.typingPrompt`, value: fields.typingPrompt, multiline: true, direction })}
      ${builderField({ label: label('reviewed typing target'), key: `${language}.typingTarget`, value: fields.typingTarget, multiline: true, direction })}
    </div>
    <div class="authoring-question">
      <h5>${escapeHtml(label('four-choice check'))}</h5>
      <div class="workspace-grid">
        ${builderField({ label: label('question'), key: `${language}.checkQuestion`, value: fields.checkQuestion, multiline: true, direction })}
        ${builderField({ label: label('correct answer'), key: `${language}.checkCorrect`, value: fields.checkCorrect, direction })}
        ${builderField({ label: label('alternative one'), key: `${language}.checkAlternative1`, value: fields.checkAlternative1, direction })}
        ${builderField({ label: label('alternative two'), key: `${language}.checkAlternative2`, value: fields.checkAlternative2, direction })}
        ${builderField({ label: label('alternative three'), key: `${language}.checkAlternative3`, value: fields.checkAlternative3, direction })}
      </div>
    </div>
  </div>`;
};
const builderModuleMarkup = (module, index) => `<article class="authoring-module" data-builder-module>
  <div class="authoring-module-heading"><div><p class="workspace-eyebrow">Module ${index + 1}</p><h3>Reviewed bilingual lesson</h3></div><button class="workspace-button workspace-button--quiet" type="button" data-remove-builder-module>Remove module</button></div>
  <div class="workspace-grid">${builderField({ label: 'Module ID', key: 'id', value: module.id, help: 'Lowercase letters, numbers, and hyphens. It becomes the stable course section ID.' })}</div>
  ${builderLanguageFields('en', module.en)}
  ${builderLanguageFields('ur', module.ur)}
</article>`;
const builderFinalQuestionMarkup = (question, index) => `<article class="authoring-final-question" data-builder-final-question>
  <div class="authoring-module-heading"><div><p class="workspace-eyebrow">Final check ${index + 1}</p><h3>Reviewed bilingual four-choice question</h3></div><button class="workspace-button workspace-button--quiet" type="button" data-remove-builder-final-question>Remove question</button></div>
  <div class="workspace-grid">
    ${builderField({ label: 'English question', key: 'en.question', value: question.en.question, multiline: true })}
    ${builderField({ label: 'English correct answer', key: 'en.correct', value: question.en.correct })}
    ${builderField({ label: 'English alternative one', key: 'en.alternative1', value: question.en.alternative1 })}
    ${builderField({ label: 'English alternative two', key: 'en.alternative2', value: question.en.alternative2 })}
    ${builderField({ label: 'English alternative three', key: 'en.alternative3', value: question.en.alternative3 })}
  </div>
  <div class="workspace-grid" dir="rtl">
    ${builderField({ label: 'اردو سوال', key: 'ur.question', value: question.ur.question, multiline: true, direction: 'rtl' })}
    ${builderField({ label: 'اردو درست جواب', key: 'ur.correct', value: question.ur.correct, direction: 'rtl' })}
    ${builderField({ label: 'اردو متبادل ایک', key: 'ur.alternative1', value: question.ur.alternative1, direction: 'rtl' })}
    ${builderField({ label: 'اردو متبادل دو', key: 'ur.alternative2', value: question.ur.alternative2, direction: 'rtl' })}
    ${builderField({ label: 'اردو متبادل تین', key: 'ur.alternative3', value: question.ur.alternative3, direction: 'rtl' })}
  </div>
</article>`;
const builderFieldValue = (root, key) => root.querySelector(`[data-builder-field="${CSS.escape(key)}"]`)?.value || '';
const builderModuleFromNode = (node, index, errors) => {
  const need = (key, label, format = builderParagraph) => {
    const value = format(builderFieldValue(node, key));
    if (!value) errors.push(`Module ${index + 1}: ${label} is required.`);
    return value;
  };
  const language = (prefix, readable) => {
    const challenges = builderList(builderFieldValue(node, `${prefix}.challenges`));
    const supports = builderList(builderFieldValue(node, `${prefix}.supports`));
    if (!challenges.length) errors.push(`Module ${index + 1}: ${readable} challenges need at least one line.`);
    if (!supports.length) errors.push(`Module ${index + 1}: ${readable} supports need at least one line.`);
    const typingLevel = need(`${prefix}.typingLevel`, `${readable} typing activity label`);
    const typingTarget = builderParagraph(builderFieldValue(node, `${prefix}.typingTarget`));
    if (typingLevel !== 'Recall typing' && !typingTarget) errors.push(`Module ${index + 1}: ${readable} typing target is required unless the activity is Recall typing.`);
    return {
      title: need(`${prefix}.title`, `${readable} title`), definition: need(`${prefix}.definition`, `${readable} definition`), dailyLife: need(`${prefix}.dailyLife`, `${readable} daily-life context`), strengths: need(`${prefix}.strengths`, `${readable} strengths`),
      challenges, supports, simple: need(`${prefix}.simple`, `${readable} plain-language explanation`), example: need(`${prefix}.example`, `${readable} example`), hint: need(`${prefix}.hint`, `${readable} hint`),
      typingLevel, typingPrompt: need(`${prefix}.typingPrompt`, `${readable} typing instruction`), typingTarget,
      checkQuestion: need(`${prefix}.checkQuestion`, `${readable} check question`), checkCorrect: need(`${prefix}.checkCorrect`, `${readable} correct answer`),
      checkAlternative1: need(`${prefix}.checkAlternative1`, `${readable} alternative one`), checkAlternative2: need(`${prefix}.checkAlternative2`, `${readable} alternative two`), checkAlternative3: need(`${prefix}.checkAlternative3`, `${readable} alternative three`)
    };
  };
  const id = builderIdentifier(builderFieldValue(node, 'id'));
  if (!id) errors.push(`Module ${index + 1}: a module ID is required.`);
  return { id, en: language('en', 'English'), ur: language('ur', 'Urdu') };
};
const builderFinalQuestionFromNode = (node, index, errors) => {
  const language = (prefix, readable) => {
    const get = (key, label) => {
      const value = builderParagraph(builderFieldValue(node, `${prefix}.${key}`));
      if (!value) errors.push(`Final check ${index + 1}: ${readable} ${label} is required.`);
      return value;
    };
    return { question: get('question', 'question'), correct: get('correct', 'correct answer'), alternative1: get('alternative1', 'alternative one'), alternative2: get('alternative2', 'alternative two'), alternative3: get('alternative3', 'alternative three') };
  };
  return { en: language('en', 'English'), ur: language('ur', 'Urdu') };
};
const markdownForBuilder = (root) => {
  const errors = [];
  const course = {
    id: builderIdentifier(builderFieldValue(root, 'course.id')),
    version: builderLine(builderFieldValue(root, 'course.version')),
    titleEn: builderParagraph(builderFieldValue(root, 'course.titleEn')), titleUr: builderParagraph(builderFieldValue(root, 'course.titleUr')),
    labelEn: builderParagraph(builderFieldValue(root, 'course.labelEn')), labelUr: builderParagraph(builderFieldValue(root, 'course.labelUr')),
    noticeEn: builderParagraph(builderFieldValue(root, 'course.noticeEn')), noticeUr: builderParagraph(builderFieldValue(root, 'course.noticeUr'))
  };
  [['id', 'course ID'], ['version', 'version'], ['titleEn', 'English title'], ['titleUr', 'Urdu title'], ['labelEn', 'English label'], ['labelUr', 'Urdu label'], ['noticeEn', 'English notice'], ['noticeUr', 'Urdu notice']].forEach(([key, label]) => { if (!course[key]) errors.push(`Course ${label} is required.`); });
  const modules = $$('[data-builder-module]', root).map((node, index) => builderModuleFromNode(node, index, errors));
  if (!modules.length) errors.push('Add at least one module.');
  const uniqueModuleIds = new Set();
  modules.forEach((module) => { if (module.id && uniqueModuleIds.has(module.id)) errors.push(`Module ID "${module.id}" is used more than once.`); uniqueModuleIds.add(module.id); });
  const finalQuestions = $$('[data-builder-final-question]', root).map((node, index) => builderFinalQuestionFromNode(node, index, errors));
  if (!finalQuestions.length) errors.push('Add at least one bilingual final-check question.');
  if (finalQuestions.length > 21) errors.push('A final check can contain at most 21 questions.');
  if (errors.length) return { errors, markdown: '' };
  // Run the exact deterministic compiler used by automated tests. This is a
  // second local guard before the server parser validates and stores the same
  // reviewed Markdown.
  return buildStructuredTheoryMarkdown({ course, modules, finalQuestions });
};

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
// Do not reveal any private workspace markup until Firebase identity and the
// corresponding server-managed role have both been checked. The static page
// therefore never flashes an administrator workflow to a guest.
const setWorkspaceGate = (mode = 'pending', message = 'Checking private workspace access…') => {
  const gate = $('[data-workspace-gate]');
  const gateMessage = $('[data-workspace-gate-message]');
  const shell = $('[data-workspace-shell]');
  if (gateMessage) gateMessage.textContent = message;
  if (gate) gate.setAttribute('aria-busy', String(mode === 'pending'));
  document.body.classList.toggle('workspace-auth-pending', mode === 'pending');
  document.body.classList.toggle('workspace-access-denied', mode === 'denied');
  if (mode === 'ready') {
    shell?.removeAttribute('aria-hidden');
    shell?.removeAttribute('inert');
  } else {
    shell?.setAttribute('aria-hidden', 'true');
    shell?.setAttribute('inert', '');
  }
};
const revealWorkspace = () => setWorkspaceGate('ready');

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
  list.innerHTML = submissions.map((entry) => {
    const goal = String(entry.authoringBrief?.learningGoal || '').trim();
    return `<li><div><strong>${escapeHtml(entry.submittedTitle || entry.source?.originalName || 'Untitled source submission')}</strong><small>Submission ${escapeHtml(entry.submissionId)} · ${escapeHtml(entry.type)} · ${escapeHtml(entry.source?.extraction || 'private source')} · Organisation ${escapeHtml(entry.ownerOrganisationId || 'not set')} · Updated ${escapeHtml(entry.updatedAt || 'just now')}</small>${goal ? `<small>Teaching goal: ${escapeHtml(goal)}</small>` : ''}</div><span class="workspace-tag" data-state="${escapeHtml(entry.status)}">${escapeHtml(humanise(entry.status))}</span>${PAGE === 'admin' ? `<button class="workspace-button workspace-button--quiet" type="button" data-review-submission="${escapeHtml(entry.submissionId)}">Review source</button>` : ''}</li>`;
  }).join('');
};
const renderCourses = () => {
  const options = `<option value="">Choose a validated course</option>${courses.map((entry) => `<option value="${escapeHtml(entry.courseId)}@${escapeHtml(entry.version)}">${escapeHtml(entry.title?.en || entry.courseId)} · ${escapeHtml(entry.version)}</option>`).join('')}`;
  $$('[data-course-select]').forEach((select) => { const previous = select.value; select.innerHTML = options; select.value = courses.some((entry) => `${entry.courseId}@${entry.version}` === previous) ? previous : ''; });
  renderNarrationSectionHint();
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
const selectedCourseRecord = () => {
  const selected = selectedCourse();
  return courses.find((entry) => entry.courseId === selected.courseId && entry.version === selected.version) || null;
};
const renderNarrationSectionHint = () => {
  const target = $('[data-narration-section-hint]');
  if (!target) return;
  try {
    const sections = selectedCourseRecord()?.narrationSections || [];
    target.textContent = sections.length
      ? `Reviewed module IDs: ${sections.map((section) => section.id).join(', ')}`
      : 'Choose a validated course to see its reviewed module IDs.';
  } catch (_) {
    target.textContent = 'Choose a validated course to see its reviewed module IDs.';
  }
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
    renderNarrationSectionHint();
  }));
};
const bindRoleCodes = () => {
  const refreshCodes = async () => {
    const list = $('[data-code-list]');
    if (!list) return;
    try {
      const result = await api('/api/v1/access/codes');
      const codes = result.codes || [];
      list.innerHTML = codes.length ? codes.map((entry) => {
        const state = entry.revokedAt ? 'Revoked' : entry.redeemedAt ? 'Redeemed' : 'Ready to use';
        const canRevoke = !entry.revokedAt && !entry.redeemedAt;
        return `<li><div><strong>${escapeHtml(humanise(entry.kind))}</strong><small>Code reference ${escapeHtml(entry.codeId.slice(0, 12))} · ${escapeHtml(state)} · Expires ${escapeHtml(entry.expiresAt || 'not set')}</small></div>${canRevoke ? `<button class="workspace-button workspace-button--quiet" data-revoke-code="${escapeHtml(entry.codeId)}" type="button">Revoke code</button>` : ''}</li>`;
      }).join('') : '<li class="workspace-empty">No active or past codes are visible to this workspace yet.</li>';
    } catch (error) { status(error.message, 'error'); }
  };
  $('[data-role-code-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api('/api/v1/access/codes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: form.get('kind'), organisationName: form.get('organisationName'), organisationId: form.get('organisationId'), expiresInHours: form.get('expiresInHours') }) });
      $('[data-generated-code]').textContent = result.code;
      $('[data-generated-code-wrap]').hidden = false;
      status('One-use access code created. Copy it now; the raw code is never stored.', 'success');
      await refreshCodes();
    } catch (error) { status(error.message, 'error'); }
  });
  $('[data-learner-code-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await api('/api/v1/access/codes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'learner', organisationId: primaryOrganisation(), expiresInHours: new FormData(event.currentTarget).get('expiresInHours') }) });
      $('[data-generated-code]').textContent = result.code;
      $('[data-generated-code-wrap]').hidden = false;
      status('One-use learner invite created. It expires automatically and can be revoked.', 'success');
      await refreshCodes();
    } catch (error) { status(error.message, 'error'); }
  });
  $('[data-code-list]')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-revoke-code]');
    if (!button) return;
    if (!confirm('Revoke this unused access code? It cannot be redeemed afterwards.')) return;
    try {
      await api(`/api/v1/access/codes/${encodeURIComponent(button.dataset.revokeCode)}/revoke`, { method: 'POST' });
      status('Access code revoked. It can no longer be redeemed.', 'success');
      await refreshCodes();
    } catch (error) { status(error.message, 'error'); }
  });
  if (!DEMO) refreshCodes();
};
const bindSubmission = () => {
  $$('[data-course-type]').forEach((button) => button.addEventListener('click', () => {
    if (button.disabled) { status('Only theory courses are supported at this stage. This type is intentionally locked.', 'warning'); return; }
    $$('[data-course-type]').forEach((item) => item.closest('.workspace-card')?.classList.remove('is-selected'));
    button.closest('.workspace-card')?.classList.add('is-selected');
    $('[data-course-type-input]').value = button.dataset.courseType;
  }));
  const teacherSourceForm = $('[data-source-form]');
  teacherSourceForm?.querySelector('[name="sourceFile"]')?.addEventListener('change', (event) => {
    const file = event.currentTarget.files?.[0];
    const summary = $('[data-source-file-summary]');
    if (!summary) return;
    if (!file) { event.currentTarget.setCustomValidity(''); summary.textContent = 'No file chosen yet. Maximum file size: 25 MB.'; return; }
    const megabytes = (Number(file.size || 0) / (1024 * 1024)).toFixed(1);
    const extension = String(file.name || '').split('.').pop()?.toUpperCase() || 'FILE';
    const tooLarge = Number(file.size || 0) > 25 * 1024 * 1024;
    event.currentTarget.setCustomValidity(tooLarge ? 'Choose a file that is 25 MB or smaller.' : '');
    if (tooLarge) {
      summary.textContent = `${file.name} · ${megabytes} MB. This is larger than the 25 MB private-source limit; choose a smaller export before sending it.`;
      return;
    }
    summary.textContent = `${file.name} · ${megabytes} MB · ${extension}. It will remain private while the review workflow checks whether safe text can be extracted.`;
    const title = teacherSourceForm.querySelector('[name="title"]');
    if (title && !title.value.trim()) title.value = String(file.name || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  });
  teacherSourceForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!form.get('sourceFile')?.size) { status('Choose source material to submit privately.', 'error'); return; }
    try {
      const result = await api('/api/v1/course-authoring/source', { method: 'POST', body: form });
      const submission = result.submission || {};
      const next = $('[data-source-next-step]');
      if (next) {
        next.hidden = false;
        next.dataset.kind = submission.source?.extraction === 'requires-admin-transcription' ? 'warning' : 'success';
        next.textContent = submission.source?.extraction === 'requires-admin-transcription'
          ? `Sent privately as ${submission.submissionId}. This source will need administrator transcription before it can become a course draft. You can track the review state in Overview.`
          : `Sent privately as ${submission.submissionId}. Safe text is available for authorised review. Next, the reviewer prepares a bilingual Type2Learn course and you will see its status in Overview.`;
      }
      status(`Source submitted as ${submission.submissionId}. ${submission.source?.extraction === 'requires-admin-transcription' ? 'It is private and requires administrator transcription.' : 'Its safe text is ready for review.'}`, 'success');
      event.currentTarget.reset();
      $('[data-source-file-summary]')?.replaceChildren(document.createTextNode('No file chosen yet. Maximum file size: 25 MB.'));
      await loadSubmissions();
    } catch (error) { status(error.message, 'error'); }
  });
  $('[data-admin-source-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!form.get('sourceFile')?.size) { status('Choose a private PDF, text, or document source first.', 'error'); return; }
    try {
      const result = await api('/api/v1/course-authoring/source', { method: 'POST', body: form });
      const submission = result.submission || {};
      $('[data-authoring-submission]').value = submission.submissionId || '';
      // A platform administrator has already made the explicit source-upload
      // decision. For safely extracted text, take them straight into the
      // private draft workflow instead of making them repeat the same intent
      // with a second "convert" click. Scanned and unsupported files still
      // stop at the visible transcription review gate.
      if (['safe-pdf-text-extracted', 'safe-presentation-text-extracted', 'safe-text-extracted'].includes(submission.source?.extraction)) {
        const suggestedCourseId = builderIdentifier(submission.submittedTitle || submission.source?.originalName, 'new-theory-course');
        if ($('[data-authoring-course-id]')) $('[data-authoring-course-id]').value = suggestedCourseId;
        if ($('[data-authoring-version]')) $('[data-authoring-version]').value = '1.0.0';
      }
      event.currentTarget.reset();
      await loadSubmissions();
      show('review');
      const extracted = ['safe-pdf-text-extracted', 'safe-presentation-text-extracted', 'safe-text-extracted'].includes(submission.source?.extraction);
      // Reuse the secure review handler and its background conversion route;
      // extracted text never enters a learner page or a second browser cache.
      window.dispatchEvent(new CustomEvent('type2learn:admin-source-added', { detail: { submissionId: submission.submissionId, extracted } }));
      status(extracted
        ? 'Source text was extracted privately. Type2Learn is preparing a reviewed Markdown draft now; you can inspect or edit it before compiling.'
        : 'Private source added. Review it before creating any learner-facing material.', 'success');
    } catch (error) { status(error.message, 'error'); }
  });
};
const bindAuthoring = () => {
  const template = $('[data-markdown]');
  const builder = $('[data-course-builder]');
  $$('[data-authoring-jump]').forEach((button) => button.addEventListener('click', () => {
    const destination = String(button.dataset.authoringJump || '');
    const target = $(`[data-authoring-anchor="${CSS.escape(destination)}"]`);
    if (!target) return;
    $$('[data-authoring-jump]').forEach((item) => item.setAttribute('aria-current', String(item === button ? 'location' : 'false')));
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  const renderBuilder = () => {
    if (!builder) return;
    const starter = builderCopy(builderStarter());
    builder.innerHTML = `<section class="authoring-builder" aria-labelledby="course-builder-title">
      <div class="authoring-builder-heading"><div><p class="workspace-eyebrow">Structured authoring</p><h3 id="course-builder-title">Build a reviewed theory course</h3><p>Complete each bilingual section. Type2Learn converts it into the same validated course format automatically; you can inspect the generated Markdown before compiling.</p></div><button class="workspace-button workspace-button--quiet" type="button" data-reset-course-builder>Reset starter</button></div>
      <div class="workspace-grid authoring-course-fields">
        ${builderField({ label: 'Course ID', key: 'course.id', value: starter.course.id, help: 'Lowercase letters, numbers, and hyphens. This is the permanent course identifier.' })}
        ${builderField({ label: 'Version', key: 'course.version', value: starter.course.version, help: 'For example 1.0.0. Create a new version when reviewed learning content changes.' })}
        ${builderField({ label: 'English course title', key: 'course.titleEn', value: starter.course.titleEn })}
        ${builderField({ label: 'اردو کورس کا عنوان', key: 'course.titleUr', value: starter.course.titleUr, direction: 'rtl' })}
        ${builderField({ label: 'English course label', key: 'course.labelEn', value: starter.course.labelEn })}
        ${builderField({ label: 'اردو کورس لیبل', key: 'course.labelUr', value: starter.course.labelUr, direction: 'rtl' })}
        ${builderField({ label: 'English educational notice', key: 'course.noticeEn', value: starter.course.noticeEn, multiline: true })}
        ${builderField({ label: 'اردو تعلیمی نوٹس', key: 'course.noticeUr', value: starter.course.noticeUr, multiline: true, direction: 'rtl' })}
      </div>
      <div data-builder-modules>${starter.modules.map(builderModuleMarkup).join('')}</div>
      <div class="workspace-row authoring-builder-actions"><button class="workspace-button workspace-button--quiet" type="button" data-add-builder-module>Add another module</button></div>
      <div data-builder-final-questions>${starter.finalQuestions.map(builderFinalQuestionMarkup).join('')}</div>
      <div class="workspace-row authoring-builder-actions"><button class="workspace-button workspace-button--quiet" type="button" data-add-builder-final-question>Add final-check question</button><button class="workspace-button workspace-button--quiet" type="button" data-build-reviewed-markdown>Build reviewed Markdown</button><button class="workspace-button workspace-button--primary" type="button" data-build-and-validate-course>Build &amp; validate course</button></div>
      <div class="workspace-status" data-builder-errors hidden aria-live="polite"></div>
    </section>`;
  };
  const renumberBuilder = () => {
    $$('[data-builder-module]', builder).forEach((node, index) => {
      const eyebrow = $('.workspace-eyebrow', node);
      if (eyebrow) eyebrow.textContent = `Module ${index + 1}`;
    });
    $$('[data-builder-final-question]', builder).forEach((node, index) => {
      const eyebrow = $('.workspace-eyebrow', node);
      if (eyebrow) eyebrow.textContent = `Final check ${index + 1}`;
    });
  };
  const displayBuilderErrors = (errors = []) => {
    const output = $('[data-builder-errors]', builder);
    if (!output) return;
    output.hidden = !errors.length;
    output.dataset.kind = errors.length ? 'warning' : 'success';
    output.innerHTML = errors.length
      ? `<strong>Nothing was compiled yet.</strong><ul>${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>`
      : 'The form has produced reviewed Markdown. Inspect it below, then validate and compile.';
  };
  const syncAuthoringMetadata = (markdown) => {
    const get = (key) => String(markdown || '').match(new RegExp(`^${key.replace('.', '\\.')}:\\s*(.+)$`, 'm'))?.[1]?.trim() || '';
    const courseId = get('id');
    const version = get('version');
    if (courseId && $('[data-authoring-course-id]')) $('[data-authoring-course-id]').value = courseId;
    if (version && $('[data-authoring-version]')) $('[data-authoring-version]').value = version;
  };
  const renderLearnerPreview = (manifest) => {
    const preview = $('[data-learner-preview]');
    if (!preview || !manifest) return;
    const module = manifest.modules?.[0] || null;
    const en = module?.en || {};
    preview.innerHTML = `<div class="workspace-preview-bar"><span>Preview only · learner-safe content</span><span>Module 1 of ${escapeHtml(String(manifest.modules?.length || 0))}</span></div>
      <div class="workspace-preview-content"><p class="workspace-eyebrow">${escapeHtml(manifest.label?.en || 'Educational course')}</p><h3>${escapeHtml(en.title || manifest.title?.en || 'Reviewed course')}</h3><p>${escapeHtml(en.definition || 'The learner preview will show reviewed module content here.')}</p>${en.example ? `<div class="workspace-note"><strong>Example</strong><p>${escapeHtml(en.example)}</p></div>` : ''}<p class="workspace-input-help">This is the exact learner-safe manifest generated by the server. Answer keys, rubrics, source uploads, and private review notes are not included.</p><button class="workspace-button workspace-button--primary" type="button" disabled>Continue in learner course</button></div>`;
  };
  if (builder) {
    renderBuilder();
    builder.addEventListener('click', (event) => {
      const action = event.target.closest('button');
      if (!action) return;
      const buildStructuredCourse = () => {
        const built = markdownForBuilder(builder);
        displayBuilderErrors(built.errors);
        if (built.errors.length) { status('Complete the listed course details before generating Markdown.', 'warning'); return false; }
        if (template) {
          template.value = built.markdown;
          template.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        syncAuthoringMetadata(built.markdown);
        status('The form is compiler-valid. Inspect the generated Markdown, then validate and compile it, or use Build & validate course.', 'success');
        return true;
      };
      if (action.matches('[data-reset-course-builder]')) { renderBuilder(); return; }
      if (action.matches('[data-add-builder-module]')) {
        const next = builderCopy(builderStarter().modules[0]);
        const number = $$('[data-builder-module]', builder).length + 1;
        next.id = `module-${number}`;
        next.en.title = `Module ${number} title`;
        next.ur.title = `ماڈیول ${number} کا عنوان`;
        $('[data-builder-modules]', builder)?.insertAdjacentHTML('beforeend', builderModuleMarkup(next, number - 1));
        renumberBuilder();
        return;
      }
      if (action.matches('[data-remove-builder-module]')) {
        if ($$('[data-builder-module]', builder).length <= 1) { status('A theory course needs at least one module.', 'warning'); return; }
        action.closest('[data-builder-module]')?.remove();
        renumberBuilder();
        return;
      }
      if (action.matches('[data-add-builder-final-question]')) {
        const next = builderCopy(builderStarter().finalQuestions[0]);
        const number = $$('[data-builder-final-question]', builder).length + 1;
        $('[data-builder-final-questions]', builder)?.insertAdjacentHTML('beforeend', builderFinalQuestionMarkup(next, number - 1));
        renumberBuilder();
        return;
      }
      if (action.matches('[data-remove-builder-final-question]')) {
        if ($$('[data-builder-final-question]', builder).length <= 1) { status('A course needs at least one bilingual final-check question.', 'warning'); return; }
        action.closest('[data-builder-final-question]')?.remove();
        renumberBuilder();
        return;
      }
      if (action.matches('[data-build-reviewed-markdown]')) {
        buildStructuredCourse();
        return;
      }
      if (action.matches('[data-build-and-validate-course]')) {
        if (!buildStructuredCourse()) return;
        $('[data-markdown-form]')?.requestSubmit();
      }
    });
  }
  const openSourceReview = async (requestedSubmissionId = '') => {
    const submissionId = String(requestedSubmissionId || $('[data-authoring-submission]')?.value || '').trim();
    if (!submissionId) { status('Enter the private source submission ID first.', 'warning'); return; }
    try {
      const result = await api(`/api/v1/course-authoring/submission-review?submissionId=${encodeURIComponent(submissionId)}`);
      $('[data-authoring-submission]').value = result.submission?.submissionId || submissionId;
      const brief = result.submission?.authoringBrief || {};
      const briefLines = [
        brief.learningGoal ? `Teacher learning goal: ${brief.learningGoal}` : '',
        brief.intendedLearners ? `Intended learners: ${brief.intendedLearners}` : '',
        brief.sourceLanguage ? `Source language: ${brief.sourceLanguage === 'bilingual' ? 'English and Urdu' : brief.sourceLanguage === 'ur' ? 'Urdu' : 'English'}` : ''
      ].filter(Boolean);
      const sourceReview = result.requiresAdminTranscription
        ? 'This private source needs administrator transcription before it can become reviewed Markdown. Download the original source only if you need it for review.'
        : result.extractedText || 'No safe text was extracted.';
      $('[data-source-review-output]').textContent = `${briefLines.length ? `${briefLines.join('\n')}\n\n` : ''}${sourceReview}`;
      const conversionOutput = $('[data-source-conversion-output]');
      const conversion = result.conversion || null;
      if (conversionOutput && conversion) {
        if (conversion.state === 'running') {
          conversionOutput.textContent = 'Conversion is running securely in the background. This source remains private. Keep this page open or return shortly to review the saved Markdown draft.';
          const convertButton = $('[data-convert-source]');
          if (convertButton) convertButton.disabled = true;
          window.setTimeout(() => {
            if (String($('[data-authoring-submission]')?.value || '') === submissionId) openSourceReview(submissionId);
          }, 5000);
        } else if (conversion.state === 'failed') {
          conversionOutput.textContent = conversion.failure || 'Automated conversion did not complete. Re-open the source review and retry, or use the guided form and reviewed Markdown template.';
        } else {
          const summary = {
            state: conversion.state || 'complete',
            readyForHumanReview: Boolean(conversion.readyForHumanReview),
            provider: conversion.provider || 'deterministic',
            startedAt: conversion.startedAt || '',
            durationMs: Number(conversion.durationMs || 0),
            validation: conversion.validation,
            checks: conversion.checks,
            critic: conversion.critic,
            updatedAt: conversion.updatedAt
          };
          conversionOutput.textContent = `Saved conversion draft — still requires human review:\n${JSON.stringify(summary, null, 2)}`;
          if (conversion.markdown && template) {
            template.value = conversion.markdown;
            syncAuthoringMetadata(conversion.markdown);
          }
        }
      } else if (conversionOutput) {
        conversionOutput.textContent = result.requiresAdminTranscription
          ? 'This source needs transcription before it can be converted. The original stays private.'
          : 'Conversion runs only when an administrator requests it. It uses extracted text, strict canonical validation, an AI repair when needed, and a separate critique. The resulting Markdown still requires human review before compiling or publishing.';
      }
      const convertButton = $('[data-convert-source]');
      if (convertButton) convertButton.disabled = Boolean(result.requiresAdminTranscription || !result.extractedText || conversion?.state === 'running');
      if ($('[data-ai-source-excerpt]') && result.extractedText) $('[data-ai-source-excerpt]').value = result.extractedText.slice(0, 12000);
      if ($('[data-authoring-organisation]') && !($('[data-authoring-organisation]').value)) $('[data-authoring-organisation]').value = result.submission?.ownerOrganisationId || '';
      const reviewMessage = conversion?.state === 'running'
        ? 'The conversion is still running. Type2Learn will show the draft or a clear review message when it finishes.'
        : conversion?.state === 'failed'
          ? 'The automated conversion did not complete. Your private source is still safe and available for review.'
          : 'Private source review opened for the administrator. It is never exposed to learner pages.';
      status(reviewMessage, conversion?.state === 'running' || conversion?.state === 'failed' ? 'warning' : 'success');
      await loadSubmissions();
    } catch (error) { status(error.message, 'error'); }
  };
  const moduleSlice = (markdown, moduleId) => {
    const escaped = String(moduleId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const source = String(markdown || '');
    const heading = new RegExp(`^#\\s+Module:\\s*${escaped}\\s*$`, 'mi').exec(source);
    if (!heading || heading.index === undefined) return null;
    const start = heading.index;
    const rest = source.slice(start + 1);
    const following = /^#\s+(?:Module:|Final exam\s*$)/mi.exec(rest);
    const end = following?.index === undefined ? source.length : start + 1 + following.index;
    return { start, end, text: source.slice(start, end).trimEnd() };
  };
  const setReviewEditor = (moduleId) => {
    const output = $('[data-course-review]');
    const slice = moduleSlice(template?.value || '', moduleId);
    if (!output || !slice) { status('This reviewed module could not be located in the current course source.', 'warning'); return; }
    const editor = $('[data-review-editor]', output);
    if (!editor) return;
    editor.dataset.moduleId = moduleId;
    editor.dataset.start = String(slice.start);
    editor.dataset.end = String(slice.end);
    editor.value = slice.text;
    $('[data-review-editor-title]', output).textContent = `Editing module: ${moduleId}`;
    $('[data-review-editor-wrap]', output).hidden = false;
    editor.focus();
  };
  const renderFullCourseReview = (result) => {
    const output = $('[data-course-review]');
    if (!output) return;
    const manifest = result?.learnerManifest;
    if (!manifest) { output.hidden = false; output.innerHTML = '<p class="workspace-empty">Validate the course first so the learner-safe module review can be generated.</p>'; return; }
    if (template) template.value = result.markdown || template.value;
    const modules = manifest.modules || [];
    output.hidden = false;
    output.innerHTML = `<div class="admin-course-review-heading"><div><p class="workspace-eyebrow">Full learner-safe review</p><h3>${escapeHtml(manifest.title?.en || result.course?.courseId || 'Reviewed course')}</h3><p>${modules.length} module${modules.length === 1 ? '' : 's'} · English and Urdu content are compiled from the canonical course source. Use a pencil to edit one module without losing your place.</p></div><button class="workspace-button workspace-button--quiet" type="button" data-close-course-review>Close review</button></div>
      <div class="admin-review-module-grid">${modules.map((module, index) => `<article class="admin-review-module" data-review-module="${escapeHtml(module.id)}"><div class="admin-review-module-head"><p class="workspace-eyebrow">Module ${index + 1}</p><button class="workspace-icon-button" type="button" data-edit-module="${escapeHtml(module.id)}" aria-label="Edit ${escapeHtml(module.en?.title || module.id)}">✎</button></div><h4>${escapeHtml(module.en?.title || module.id)}</h4><p>${escapeHtml(module.en?.content?.definition || '')}</p><dl><div><dt>Everyday context</dt><dd>${escapeHtml(module.en?.content?.dailyLife || '')}</dd></div><div><dt>Urdu title</dt><dd dir="rtl">${escapeHtml(module.ur?.title || '')}</dd></div></dl><button class="workspace-button workspace-button--quiet" type="button" data-edit-module="${escapeHtml(module.id)}">Edit this module</button></article>`).join('')}</div>
      <section class="admin-module-editor" data-review-editor-wrap hidden><div class="admin-review-module-head"><div><p class="workspace-eyebrow">One module at a time</p><h4 data-review-editor-title>Editing module</h4></div><button class="workspace-button workspace-button--quiet" type="button" data-cancel-module-edit>Cancel</button></div><p>Keep the visible headings and bilingual structure. Saving validates the complete course before it can replace this reviewed draft.</p><textarea data-review-editor spellcheck="true" aria-label="Editable reviewed module"></textarea><div class="workspace-row"><button class="workspace-button workspace-button--primary" type="button" data-save-reviewed-module>Save and validate this module</button><button class="workspace-button workspace-button--quiet" type="button" data-copy-module-markdown>Copy module text</button></div></section>`;
  };
  const saveReviewModule = async () => {
    const output = $('[data-course-review]');
    const editor = $('[data-review-editor]', output);
    const current = String(template?.value || '');
    const start = Number(editor?.dataset.start);
    const end = Number(editor?.dataset.end);
    const replacement = String(editor?.value || '').trim();
    if (!Number.isInteger(start) || !Number.isInteger(end) || !replacement) throw new Error('Make a complete module edit before saving.');
    const updated = current.slice(0, start) + replacement + current.slice(end);
    const result = await api('/api/v1/course-authoring/markdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: $('[data-authoring-course-id]')?.value, version: $('[data-authoring-version]')?.value, ownerOrganisationId: $('[data-authoring-organisation]')?.value, submissionId: $('[data-authoring-submission]')?.value, markdown: updated }) });
    if (!result.validation?.valid) throw new Error(`The module was not saved: ${(result.validation?.errors || []).join(' ')}`);
    if (template) template.value = updated;
    syncAuthoringMetadata(updated);
    renderFullCourseReview({ ...result, markdown: updated });
    status('Module saved and the complete bilingual course revalidated. Review another module or continue to narration.', 'success');
    await loadCourses();
  };
  $('[data-use-template]')?.addEventListener('click', () => { if (template) { template.value = reviewedTemplate; syncAuthoringMetadata(reviewedTemplate); } });
  $('[data-ai-draft-from-source]')?.addEventListener('click', () => {
    const source = String($('[data-source-review-output]')?.textContent || '').trim();
    if (!source || source.startsWith('Source review opens') || source.startsWith('This private source')) { status('Open an extracted text or PDF source first.', 'warning'); return; }
    const target = $('[data-ai-source-excerpt]');
    if (target) target.value = source.slice(0, 12000);
    $('[data-ai-draft-form]')?.requestSubmit();
  });
  $('[data-translation-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const values = new FormData(event.currentTarget);
      const result = await api('/api/v1/course-authoring/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceLanguage: values.get('sourceLanguage'), text: values.get('text') }) });
      $('[data-ai-draft-output]').textContent = `${result.sourceLanguage === 'ur' ? 'English' : 'Urdu'} review draft (check before inserting):\n\n${result.translation}`;
      status('Translation draft created. Review it and copy it into its matching bilingual field; no course content changed automatically.', 'success');
    } catch (error) { status(error.message, 'error'); }
  });
  $('[data-open-course-review]')?.addEventListener('click', async () => {
    try {
      const { courseId, version } = selectedCourse();
      const result = await api(`/api/v1/course-authoring/review?courseId=${encodeURIComponent(courseId)}&version=${encodeURIComponent(version)}`);
      renderFullCourseReview(result);
      $('[data-course-review]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      status('Full course review is ready. Pencil buttons open only the selected module.', 'success');
    } catch (error) { status(error.message, 'warning'); }
  });
  $('[data-course-review]')?.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-module]');
    if (edit) { setReviewEditor(edit.dataset.editModule); return; }
    if (event.target.closest('[data-close-course-review]')) { $('[data-course-review]').hidden = true; return; }
    if (event.target.closest('[data-cancel-module-edit]')) { $('[data-review-editor-wrap]', $('[data-course-review]')).hidden = true; return; }
    if (event.target.closest('[data-copy-module-markdown]')) {
      const text = $('[data-review-editor]', $('[data-course-review]'))?.value || '';
      try { await navigator.clipboard.writeText(text); status('Module Markdown copied for review.', 'success'); } catch { status('Copy is unavailable in this browser. Select the module text and copy it manually.', 'warning'); }
      return;
    }
    if (event.target.closest('[data-save-reviewed-module]')) { try { await saveReviewModule(); } catch (error) { status(error.message, 'error'); } }
  });
  $('[data-markdown-file]')?.addEventListener('change', async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const name = String(file.name || '').toLowerCase();
    if (!/\.(md|markdown|txt)$/.test(name)) {
      event.currentTarget.value = '';
      status('Choose a reviewed .md, .markdown, or .txt file. Other source formats should use the private source-review path.', 'warning');
      return;
    }
    if (file.size > 220000) {
      event.currentTarget.value = '';
      status('Reviewed Markdown must be 220 KB or smaller.', 'warning');
      return;
    }
    try {
      const markdown = await file.text();
      if (template) template.value = markdown;
      syncAuthoringMetadata(markdown);
      status('Reviewed Markdown loaded locally. Validate and compile it when you are ready.', 'success');
    } catch (error) {
      status(error.message || 'The reviewed Markdown file could not be opened.', 'error');
    }
  });
  $('[data-preview-reviewed-course]')?.addEventListener('click', async () => {
    try {
      const { courseId, version } = selectedCourse();
      if (DEMO) {
        const built = builder ? markdownForBuilder(builder) : { errors: ['No builder available.'] };
        if (built.errors?.length) throw new Error('Build the reviewed Markdown before previewing it.');
        status('Preview mode shows the generated form output only. Sign in as an administrator to inspect a saved course.', 'warning');
        return;
      }
      const result = await api(`/api/v1/course-authoring/course?courseId=${encodeURIComponent(courseId)}&version=${encodeURIComponent(version)}`);
      if (!result.learnerManifest) throw new Error('This course does not have a valid learner-safe manifest yet. Validate and compile it first.');
      renderLearnerPreview(result.learnerManifest);
      show('audit');
      status('The safe learner preview is open. It uses the compiled course manifest without answer keys or private source material.', 'success');
    } catch (error) { status(error.message, 'warning'); }
  });
  const startSourceConversion = async (requestedSubmissionId = '') => {
    const submissionId = String(requestedSubmissionId || $('[data-authoring-submission]')?.value || '').trim();
    if (!submissionId) { status('Open a private source review first.', 'warning'); return; }
    const output = $('[data-source-conversion-output]');
    const button = $('[data-convert-source]');
    if (button) button.disabled = true;
    if (output) output.textContent = 'Converting extracted source into a private canonical Markdown draft. This can take a little longer than a short AI suggestion…';
    try {
      const result = await api('/api/v1/course-authoring/source-convert', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId,
          courseId: $('[data-authoring-course-id]')?.value,
          version: $('[data-authoring-version]')?.value,
          // A complete bilingual course can take longer than a gateway's
          // request window. The server persists a visible running state and
          // finishes this explicit admin job without leaving the review stuck.
          background: true
        })
      });
      if (result.queued) {
        if (output) output.textContent = 'Conversion is running securely in the background. The source remains private; this page will refresh the review when a draft is ready.';
        status('Conversion started. You can continue reviewing other material while the Markdown draft is prepared.', 'success');
        window.setTimeout(() => openSourceReview(submissionId), 2500);
        return;
      }
      if (template && result.markdown) {
        template.value = result.markdown;
        syncAuthoringMetadata(result.markdown);
      }
      if (output) output.textContent = JSON.stringify({
        readyForHumanReview: result.readyForHumanReview,
        reviewRequired: result.reviewRequired,
        validation: result.validation,
        checks: result.checks,
        critic: result.critic,
        stages: result.stages
      }, null, 2);
      status(result.readyForHumanReview
        ? 'Canonical Markdown draft is ready for your review. Inspect it, edit anything needed, then validate and compile it.'
        : 'A Markdown draft was created, but its automated checks found issues. Review the report and edit it before validating.', result.readyForHumanReview ? 'success' : 'warning');
      await loadSubmissions();
    } catch (error) {
      if (output) output.textContent = `Conversion was not completed: ${error.message}`;
      status(error.message, 'error');
    } finally {
      if (button) button.disabled = false;
    }
  };
  $('[data-open-source-review]')?.addEventListener('click', () => { openSourceReview(); });
  $('[data-convert-source]')?.addEventListener('click', () => { void startSourceConversion(); });
  window.addEventListener('type2learn:admin-source-added', async (event) => {
    const submissionId = String(event.detail?.submissionId || '').trim();
    if (!submissionId || !event.detail?.extracted) return;
    await openSourceReview(submissionId);
    if ($('[data-convert-source]')?.disabled) {
      status('The source was stored privately, but its safe text is not ready for automatic conversion. Review the clear transcription notice before continuing.', 'warning');
      return;
    }
    await startSourceConversion(submissionId);
  });
  $('[data-submission-list]')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-review-submission]');
    if (!button) return;
    $('[data-authoring-submission]').value = button.dataset.reviewSubmission || '';
    show('review');
    openSourceReview(button.dataset.reviewSubmission);
  });
  $('[data-download-source]')?.addEventListener('click', async () => {
    const submissionId = String($('[data-authoring-submission]')?.value || '').trim();
    if (!submissionId) { status('Enter the private source submission ID first.', 'warning'); return; }
    try {
      const response = await api(`/api/v1/course-authoring/source-download?submissionId=${encodeURIComponent(submissionId)}`);
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] || 'course-source';
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
      status('The original source was downloaded privately for administrator review.', 'success');
    } catch (error) { status(error.message, 'error'); }
  });
  $('[data-markdown-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await api('/api/v1/course-authoring/markdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: $('[data-authoring-course-id]')?.value, version: $('[data-authoring-version]')?.value, ownerOrganisationId: $('[data-authoring-organisation]')?.value, submissionId: $('[data-authoring-submission]')?.value, markdown: template?.value || '' }) });
      if (result.validation?.valid && result.learnerManifest) {
        renderLearnerPreview(result.learnerManifest);
        const value = `${result.course?.courseId || ''}@${result.course?.version || ''}`;
        $$('[data-course-select]').forEach((select) => { select.value = value; });
      }
      status(result.validation?.valid ? 'Markdown is valid. The learner-safe and private authoring manifests are ready for review; the generated course is ready to inspect.' : `Markdown needs attention: ${(result.validation?.errors || []).join(' ')}`, result.validation?.valid ? 'success' : 'warning');
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
  $('[data-mcq-draft-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const { courseId, version } = selectedCourse();
      const form = new FormData(event.currentTarget);
      const result = await api('/api/v1/course-authoring/deterministic-mcq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          version,
          prompt: form.get('prompt'),
          answer: form.get('answer'),
          distractors: ['distractor1', 'distractor2', 'distractor3'].map((name) => form.get(name))
        })
      });
      $('[data-ai-draft-output]').textContent = JSON.stringify(result, null, 2);
      status('Fallback MCQ draft created from the reviewed facts. Copy only approved wording into Markdown and validate it again.', 'success');
    } catch (error) { status(error.message, 'error'); }
  });
  // ASSESSMENT BANK REVIEW: assessment generation is intentionally separated
  // from course Markdown authoring. The server keeps keys/rubrics private to
  // authorised reviewers; learners only ever receive public question DTOs.
  const assessmentRequest = () => {
    const form = $('[data-assessment-draft-form]');
    const values = form ? new FormData(form) : new FormData();
    const selected = selectedCourse();
    const scope = values.get('scope') === 'final' ? 'final' : 'module';
    const moduleNumber = Number(values.get('moduleNumber'));
    if (scope !== 'final' && (!Number.isInteger(moduleNumber) || moduleNumber < 1 || moduleNumber > 21)) {
      throw new Error('Choose a module number from 1 to 21.');
    }
    return {
      ...selected,
      scope,
      moduleIndex: scope === 'final' ? 'final' : moduleNumber - 1,
      language: values.get('language') === 'ur' ? 'ur' : 'en'
    };
  };
  const displayAssessmentDraft = (draft) => {
    const output = $('[data-assessment-draft-output]');
    if (!output) return;
    output.textContent = JSON.stringify({
      id: draft?.id,
      status: draft?.status,
      provider: draft?.provider || 'reviewed reserve',
      model: draft?.model || 'deterministic',
      course: `${draft?.courseId || ''}@${draft?.courseVersion || ''}`,
      scope: draft?.scope,
      moduleIndex: draft?.moduleIndex,
      language: draft?.language,
      items: (draft?.bank?.items || []).map((item) => ({
        id: item.id,
        mode: item.responseMode,
        objectiveIds: item.objectiveIds,
        prompt: item.prompt,
        options: item.options,
        correctOptionIndex: item.correctOptionIndex,
        answerGuide: item.answerGuide,
        rubric: item.rubric,
        feedback: item.feedback
      }))
    }, null, 2);
  };
  const moduleWrap = $('[data-assessment-module-wrap]');
  $('[data-assessment-draft-form] [name="scope"]')?.addEventListener('change', (event) => {
    if (moduleWrap) moduleWrap.hidden = event.currentTarget.value === 'final';
  });
  $('[data-assessment-draft-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const request = assessmentRequest();
      if (DEMO) {
        const draft = { id: 'preview-review-only-bank', status: 'preview-only', ...request, bank: { items: [] } };
        $('[data-assessment-draft-id]').value = draft.id;
        displayAssessmentDraft(draft);
        status('Preview mode shows the human-review workflow only; it cannot generate or publish a bank.', 'warning');
        return;
      }
      const result = await api('/api/v1/assessment/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
      const draft = result.draft || {};
      $('[data-assessment-draft-id]').value = draft.id || '';
      $('[data-assessment-draft-output]').textContent = `Candidate ${draft.id || 'created'} is awaiting human review. Open it to inspect every question, answer guide, and rubric before publishing.`;
      status('Assessment candidate created. It is still private and not learner-visible.', 'success');
    } catch (error) { status(error.message, 'error'); }
  });
  $('[data-open-assessment-draft]')?.addEventListener('click', async () => {
    try {
      const request = assessmentRequest();
      const draftId = String($('[data-assessment-draft-id]')?.value || '').trim();
      if (!draftId) throw new Error('Enter the reviewed assessment draft ID first.');
      if (DEMO) {
        displayAssessmentDraft({ id: draftId, status: 'preview-only', ...request, bank: { items: [] } });
        return;
      }
      const query = new URLSearchParams({ ...request, draftId });
      const result = await api(`/api/v1/assessment/drafts?${query.toString()}`);
      displayAssessmentDraft(result.draft);
      status('Assessment candidate opened for human review. It remains unpublished.', 'success');
    } catch (error) { status(error.message, 'error'); }
  });
  $('[data-publish-assessment-draft]')?.addEventListener('click', async () => {
    try {
      const request = assessmentRequest();
      const draftId = String($('[data-assessment-draft-id]')?.value || '').trim();
      if (!draftId) throw new Error('Open and review a draft before publishing it.');
      if (DEMO) { status('Preview mode cannot publish an assessment bank.', 'warning'); return; }
      if (!confirm('Publish this reviewed assessment bank? Learners will receive questions but never its answer keys or score.')) return;
      const result = await api('/api/v1/assessment/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, draftId }) });
      status(`Reviewed ${result.itemCount}-question assessment bank published. Learners still see no score or answer key.`, 'success');
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
    if (!form.get('audioFile')?.size) { status('Choose a human narration file, or retain the clearly labelled device text-to-speech fallback.', 'warning'); return; }
    try { const selected = selectedCourse(); form.set('courseId', selected.courseId); form.set('version', selected.version); await api('/api/v1/course-authoring/narration', { method: 'POST', body: form }); status('Private human narration uploaded for administrator review.', 'success'); } catch (error) { status(error.message, 'error'); }
  });
  $('[data-generate-narration]')?.addEventListener('click', async () => {
    const form = $('[data-narration-form]');
    const values = form ? new FormData(form) : new FormData();
    try {
      const selected = selectedCourse();
      const sectionId = String(values.get('sectionId') || '').trim();
      if (!sectionId) throw new Error('Enter one reviewed module ID before generating narration.');
      const result = await api('/api/v1/course-authoring/narration/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selected, sectionId, locale: values.get('locale') }) });
      const output = $('[data-generated-narration-output]');
      if (output) { output.hidden = false; output.textContent = `Private narration created from reviewed text. Script preview:\n\n${result.scriptPreview || ''}`; }
      status('Private narration was generated from the reviewed module. You can still upload a human recording to replace it.', 'success');
      await loadCourses();
    } catch (error) { status(error.message, 'error'); }
  });
  $('[data-verify-backups]')?.addEventListener('click', async () => {
    try { const result = await api('/api/v1/course-authoring/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selectedCourse()) }); status(result.exportReady ? 'GitHub and Supabase backups verified. Download the immutable ZIP next to acknowledge it.' : 'Backup verification needs attention.', result.exportReady ? 'success' : 'warning'); await loadSubmissions(); } catch (error) { status(error.message, 'error'); }
  });
  $('[data-ready-for-backup]')?.addEventListener('click', async () => {
    try { await api('/api/v1/course-authoring/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selectedCourse(), status: 'backups-pending', reviewNote: 'Administrator completed review and selected the device text-to-speech fallback or reviewed narration.' }) }); status('Review is complete. GitHub and Supabase receipts can now be verified.', 'success'); await loadCourses(); } catch (error) { status(error.message, 'error'); }
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
  $('[data-delete-course]')?.addEventListener('click', async () => {
    try {
      const selected = selectedCourse();
      const course = selectedCourseRecord();
      const title = course?.title?.en || selected.courseId;
      if (DEMO) { status('Preview mode cannot remove a course. A signed-in administrator must type DELETE before the protected endpoint will remove it.', 'warning'); return; }
      if (!confirm(`Remove “${title}” (${selected.version}) from the workspace and learner catalogue? Its private source, immutable backup receipt, audit trail, and learner data will be retained.`)) return;
      if (prompt('Type DELETE to remove this course version.') !== 'DELETE') {
        status('Course removal was cancelled. The confirmation text did not match.', 'warning');
        return;
      }
      const result = await api('/api/v1/course-authoring/course', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selected, confirmation: 'DELETE' }) });
      courses = courses.filter((entry) => !(entry.courseId === selected.courseId && entry.version === selected.version));
      renderCourses();
      const markdown = $('[data-markdown]');
      if (markdown) markdown.value = '';
      const sourceSubmission = $('[data-authoring-submission]');
      if (sourceSubmission) sourceSubmission.value = '';
      status(`${result.courseId}@${result.version} was removed from the workspace and learner catalogue. Its source and immutable records were retained.`, 'success');
      await loadSubmissions();
      await loadCourses();
      show('overview');
    } catch (error) { status(error.message, 'error'); }
  });
};
const bindRoster = () => {
  const loadRoster = async () => {
    try { const data = await api(`/api/v1/access/roster?organisationId=${encodeURIComponent(primaryOrganisation())}`); const list = $('[data-roster-list]'); list.innerHTML = data.members.length ? data.members.map((member) => `<li><div><strong>${escapeHtml(member.membershipRole)}</strong><small>Member ID: ${escapeHtml(member.memberId)} · Joined ${escapeHtml(member.joinedAt)}</small></div>${member.memberId === user?.uid ? '' : `<button class="workspace-button workspace-button--quiet" data-revoke-member="${escapeHtml(member.memberId)}" type="button">Remove access</button>`}</li>`).join('') : '<li class="workspace-empty">No active members yet. Create a learner invite to build this private roster.</li>'; } catch (error) { status(error.message, 'error'); }
  };
  $('[data-load-roster]')?.addEventListener('click', loadRoster);
  $('[data-roster-list]')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-revoke-member]');
    if (!button) return;
    const memberId = button.dataset.revokeMember;
    if (!memberId || !confirm('Remove this member from the organisation? Their protected access will stop immediately.')) return;
    try {
      await api('/api/v1/access/memberships/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organisationId: primaryOrganisation(), memberId }) });
      status('Organisation membership revoked. The member can no longer use protected workspace or course actions.', 'success');
      await loadRoster();
    } catch (error) { status(error.message, 'error'); }
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
  $('[data-view-learner]')?.addEventListener('click', () => {
    try {
      const course = selectedCourseRecord();
      if (!course || course.status !== 'published') throw new Error('Select a published course first. Draft and review stages retain the safe visual preview until publication.');
      const destination = new URL('/course/', window.location.origin);
      destination.searchParams.set('courseId', course.courseId);
      destination.searchParams.set('version', course.version);
      destination.searchParams.set('start', 'course');
      window.open(destination.href, '_blank', 'noopener,noreferrer');
      status('Opening the published learner course in a new tab. It uses the same rich course UI and learner-safe manifest.', 'success');
    } catch (error) {
      $('[data-learner-preview]')?.classList.toggle('workspace-hidden');
      status(error.message || 'Open a published course to use the real learner view.', 'warning');
    }
  });
};

const initialise = async () => {
  bindNavigation(); bindCourseSelectors(); bindShared(); bindRoleCodes(); bindSubmission(); bindAuthoring(); bindPublishing(); bindRoster(); bindDistribution(); bindBootstrap(); bindRedeem();
  if (DEMO) { account = demoAccount(); revealWorkspace(); renderIdentity(); renderWorkspace(); await loadSubmissions(); status('Preview mode shows the interface only. It cannot access a learner record or call protected APIs.', 'warning'); return; }
  user = await waitForType2LearnUser();
  if (!user) {
    setWorkspaceGate('pending', 'Sign in is required before opening this private workspace.');
    location.replace(`/login/?next=${encodeURIComponent(location.pathname + location.hash)}`);
    return;
  }
  try {
    await refreshRole();
    if (!allowedForPage()) {
      setWorkspaceGate('denied', 'This account does not have access to this workspace. Returning to learning…');
      window.setTimeout(() => location.replace('/course/'), 450);
      return;
    }
    revealWorkspace();
    renderWorkspace();
    await loadSubmissions();
    await loadCourses();
  } catch (_) {
    setWorkspaceGate('denied', 'Private workspace access could not be verified. Please sign in again.');
  }
};
initialise();
