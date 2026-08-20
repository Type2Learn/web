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
      typingLevel: 'اہم خیال لکھنا', typingPrompt: 'اہم خیال لکھیں۔', typingTarget: 'ایک مختصر جائزہ شدہ اہم خیال۔',
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
      ${builderField({ label: label('typing activity label'), key: `${language}.typingLevel`, value: fields.typingLevel, direction })}
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
    return {
      title: need(`${prefix}.title`, `${readable} title`), definition: need(`${prefix}.definition`, `${readable} definition`), dailyLife: need(`${prefix}.dailyLife`, `${readable} daily-life context`), strengths: need(`${prefix}.strengths`, `${readable} strengths`),
      challenges, supports, simple: need(`${prefix}.simple`, `${readable} plain-language explanation`), example: need(`${prefix}.example`, `${readable} example`), hint: need(`${prefix}.hint`, `${readable} hint`),
      typingLevel: need(`${prefix}.typingLevel`, `${readable} typing activity label`), typingPrompt: need(`${prefix}.typingPrompt`, `${readable} typing instruction`), typingTarget: need(`${prefix}.typingTarget`, `${readable} typing target`),
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
  const moduleMarkdown = (module) => {
    const language = (name, item) => `## ${name}\n### Title\n${item.title}\n### Definition\n${item.definition}\n### Daily life\n${item.dailyLife}\n### Strengths\n${item.strengths}\n### Challenges\n${item.challenges.map((line) => `- ${line}`).join('\n')}\n### Supports\n${item.supports.map((line) => `- ${line}`).join('\n')}\n### Simple\n${item.simple}\n### Example\n${item.example}\n### Hint\n${item.hint}\n### Typing\nlevel: ${item.typingLevel}\nprompt: ${item.typingPrompt}\ntarget: ${item.typingTarget}\n### Check\nquestion: ${item.checkQuestion}\n- [x] ${item.checkCorrect}\n- [ ] ${item.checkAlternative1}\n- [ ] ${item.checkAlternative2}\n- [ ] ${item.checkAlternative3}`;
    return `# Module: ${module.id}\n\n${language('English', module.en)}\n\n${language('Urdu', module.ur)}`;
  };
  const finalMarkdown = (key) => finalQuestions.map((question, index) => {
    const item = question[key];
    return `### Question ${index + 1}\nquestion: ${item.question}\n- [x] ${item.correct}\n- [ ] ${item.alternative1}\n- [ ] ${item.alternative2}\n- [ ] ${item.alternative3}`;
  }).join('\n\n');
  return {
    errors: [],
    markdown: `---\nformat: type2learn-theory-course/v1\nid: ${course.id}\nversion: ${course.version}\ntitle.en: ${course.titleEn}\ntitle.ur: ${course.titleUr}\nlabel.en: ${course.labelEn}\nlabel.ur: ${course.labelUr}\nnotice.en: ${course.noticeEn}\nnotice.ur: ${course.noticeUr}\n---\n\n${modules.map(moduleMarkdown).join('\n\n')}\n\n# Final exam\n\n## English\n${finalMarkdown('en')}\n\n## Urdu\n${finalMarkdown('ur')}\n`
  };
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
  list.innerHTML = submissions.map((entry) => `<li><div><strong>${escapeHtml(entry.submittedTitle || entry.source?.originalName || 'Untitled source submission')}</strong><small>Submission ${escapeHtml(entry.submissionId)} · ${escapeHtml(entry.type)} · ${escapeHtml(entry.source?.extraction || 'private source')} · Organisation ${escapeHtml(entry.ownerOrganisationId || 'not set')} · Updated ${escapeHtml(entry.updatedAt || 'just now')}</small></div><span class="workspace-tag" data-state="${escapeHtml(entry.status)}">${escapeHtml(humanise(entry.status))}</span>${PAGE === 'admin' ? `<button class="workspace-button workspace-button--quiet" type="button" data-review-submission="${escapeHtml(entry.submissionId)}">Review source</button>` : ''}</li>`).join('');
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
  $('[data-source-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!form.get('sourceFile')?.size) { status('Choose source material to submit privately.', 'error'); return; }
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
  const builder = $('[data-course-builder]');
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
      <div class="workspace-row authoring-builder-actions"><button class="workspace-button workspace-button--quiet" type="button" data-add-builder-final-question>Add final-check question</button><button class="workspace-button workspace-button--primary" type="button" data-build-reviewed-markdown>Build reviewed Markdown</button></div>
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
        const built = markdownForBuilder(builder);
        displayBuilderErrors(built.errors);
        if (built.errors.length) { status('Complete the highlighted course details before generating Markdown.', 'warning'); return; }
        if (template) template.value = built.markdown;
        syncAuthoringMetadata(built.markdown);
        status('Reviewed Markdown was generated from the structured form. Inspect it below, then validate and compile it.', 'success');
      }
    });
  }
  const openSourceReview = async (requestedSubmissionId = '') => {
    const submissionId = String(requestedSubmissionId || $('[data-authoring-submission]')?.value || '').trim();
    if (!submissionId) { status('Enter the private source submission ID first.', 'warning'); return; }
    try {
      const result = await api(`/api/v1/course-authoring/submission-review?submissionId=${encodeURIComponent(submissionId)}`);
      $('[data-authoring-submission]').value = result.submission?.submissionId || submissionId;
      $('[data-source-review-output]').textContent = result.requiresAdminTranscription
        ? 'This private source needs administrator transcription before it can become reviewed Markdown. Download the original source only if you need it for review.'
        : result.extractedText || 'No safe text was extracted.';
      if ($('[data-ai-source-excerpt]') && result.extractedText) $('[data-ai-source-excerpt]').value = result.extractedText.slice(0, 12000);
      if ($('[data-authoring-organisation]') && !($('[data-authoring-organisation]').value)) $('[data-authoring-organisation]').value = result.submission?.ownerOrganisationId || '';
      status('Private source review opened for the administrator. It is never exposed to learner pages.', 'success');
      await loadSubmissions();
    } catch (error) { status(error.message, 'error'); }
  };
  $('[data-use-template]')?.addEventListener('click', () => { if (template) { template.value = reviewedTemplate; syncAuthoringMetadata(reviewedTemplate); } });
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
  $('[data-open-source-review]')?.addEventListener('click', () => { openSourceReview(); });
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
  if (DEMO) { account = demoAccount(); renderIdentity(); renderWorkspace(); await loadSubmissions(); status('Preview mode shows the interface only. It cannot access a learner record or call protected APIs.', 'warning'); return; }
  user = await waitForType2LearnUser();
  if (!user) { location.assign(`/login/?next=${encodeURIComponent(location.pathname + location.hash)}`); return; }
  try { await refreshRole(); renderWorkspace(); await loadSubmissions(); await loadCourses(); } catch (error) { status(error.message, 'error'); }
};
initialise();
