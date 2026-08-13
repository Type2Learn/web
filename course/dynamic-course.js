import { signOutType2LearnUser, waitForType2LearnUser } from '/firebase-auth.js';
import { loadLearnerSettings, resolveSettings } from './learner-settings.js';

const params = new URLSearchParams(location.search);
const courseId = params.get('courseId') || '';
const version = params.get('version') || '';
const storageKey = `type2learn-dynamic-course:${courseId}@${version}`;
const state = { phase: 'read', moduleIndex: 0, readSectionIndex: 0, answer: '', checkAnswer: null, checkResult: '', finalIndex: 0, finalAnswer: null, finalResult: '', focus: false, tts: false, listening: false, alternativeMenu: false, paused: false, language: 'en', completed: false };
let user = null;
let manifest = null;
let supportSettings = {};
let recognition = null;

const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const api = async (path, options = {}) => {
  const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(options.headers || {}) }, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || 'This course action could not be completed.');
  return payload;
};
const activeModule = () => manifest.modules[state.moduleIndex];
const content = () => activeModule()?.[state.language] || activeModule()?.en || {};
const courseText = () => state.language === 'ur' ? manifest.title?.ur || manifest.title?.en : manifest.title?.en;
const setting = (key, fallback = false) => supportSettings[key] ?? fallback;
const localLoad = () => { try { const saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); Object.assign(state, saved?.state || {}); } catch (_) { /* Local resume is optional. */ } };
const localSave = () => { try { localStorage.setItem(storageKey, JSON.stringify({ state })); } catch (_) { /* Device storage is optional. */ } };
const cloudSave = async () => { localSave(); try { await api('/api/v1/course-progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: `${courseId}@${version}`, state, settings: { focus: state.focus, tts: state.tts, language: state.language }, choices: {} }) }); } catch (_) { /* Browser progress remains a safe resume fallback. */ } };
const readText = () => {
  if (state.phase === 'read' && setting('smallerSections')) {
    const chunks = readingChunks();
    const current = chunks[Math.min(state.readSectionIndex, Math.max(0, chunks.length - 1))];
    if (current) return [current.heading, current.body, ...(current.items || [])].filter(Boolean).join('. ');
  }
  const unit = content();
  return [unit.title, unit.content?.definitionHeading, unit.content?.definition, unit.content?.dailyLifeHeading, unit.content?.dailyLife, unit.content?.strengthsHeading, unit.content?.strengths, unit.simple, unit.example, unit.hint].filter(Boolean).join('. ');
};
const speak = () => {
  if (!state.tts || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(readText());
  utterance.lang = state.language === 'ur' ? 'ur-PK' : 'en-US';
  utterance.rate = Math.max(0.5, Math.min(2, Number(setting('narrationSpeed', '1')) || 1));
  utterance.volume = Math.max(0, Math.min(1, Number(setting('narrationVolume', '1')) || 1));
  window.speechSynthesis.speak(utterance);
};
const readingChunks = () => {
  const unit = content();
  const reading = unit.content || {};
  return [
    { id: 'definition', heading: reading.definitionHeading || 'What is it?', body: reading.definition },
    { id: 'daily-life', heading: reading.dailyLifeHeading || 'How might it affect learning or daily life?', body: reading.dailyLife },
    { id: 'strengths', heading: reading.strengthsHeading || 'What strengths might a person have?', body: reading.strengths },
    { id: 'challenges', heading: reading.challengesHeading || 'Possible challenges', items: reading.challenges || [] },
    { id: 'supports', heading: reading.supportsHeading || 'Helpful support', items: reading.supports || [] },
    ...(setting('simplerExplanations') && unit.simple ? [{ id: 'simple', heading: 'A simpler way to say it', body: unit.simple }] : []),
    ...(unit.example ? [{ id: 'example', heading: 'Example', body: unit.example }] : []),
    ...(setting('extraExamples') ? [{ id: 'extra-example', heading: 'One more way to use the idea', body: 'Try applying the same support in another familiar setting, such as at home, in class, or while working independently.' }] : []),
    ...(setting('recap') ? [{ id: 'recap', heading: 'Quick recap', body: unit.simple || unit.content?.definition || 'Keep one small idea in mind before moving to the response.' }] : [])
  ].filter((item) => item.body || item.items?.length);
};
const readingCard = (item, { current = false } = {}) => `<article class="dynamic-card ${current ? 'dynamic-current' : ''}" data-speakable><h2>${escapeHtml(item.heading)}</h2>${item.body ? `<p>${escapeHtml(item.body)}</p>` : `<ul>${item.items.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`}</article>`;
const speechRecognitionSupported = () => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
const stopSpeechInput = () => {
  state.listening = false;
  try { recognition?.stop?.(); } catch (_) { /* Browser already stopped. */ }
  recognition = null;
};
const startSpeechInput = () => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { showInlineHelp('Speech input is not supported by this browser. You can continue typing or choose another input method in Learning settings.'); return; }
  if (state.listening) { stopSpeechInput(); render(); return; }
  const input = document.querySelector('[data-typed-response]');
  let finalText = input?.value || state.answer || '';
  state.answer = finalText;
  state.listening = true;
  render();
  recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = state.language === 'ur' ? 'ur-PK' : 'en-US';
  recognition.onresult = (event) => {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0]?.transcript || '';
      if (event.results[index].isFinal) finalText += (finalText ? ' ' : '') + transcript.trim();
      else interim += transcript;
    }
    state.answer = finalText;
    const target = document.querySelector('[data-typed-response]');
    if (target) target.value = `${finalText}${interim ? `${finalText ? ' ' : ''}${interim}` : ''}`;
  };
  recognition.onerror = (event) => {
    if (event.error === 'no-speech') return;
    state.listening = false;
    recognition = null;
    render();
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') showInlineHelp('Microphone access is needed for speech input. You can allow it in your browser, then try again.');
    else if (event.error !== 'aborted') showInlineHelp('Speech input paused. Your typed response is still here. Try Speak again when ready.');
  };
  recognition.onend = () => {
    // Browsers often end a live recognition segment after a short pause. Keep
    // the same learner-requested session alive until they press Stop.
    if (!state.listening) return;
    window.setTimeout(() => { try { recognition?.start?.(); } catch (_) { /* Another segment is already starting. */ } }, 160);
  };
  try { recognition.start(); } catch (_) { state.listening = false; render(); showInlineHelp('Speech input could not start. Please try Speak again.'); }
};
const showInlineHelp = (message) => {
  const target = document.querySelector('[data-help]');
  if (!target) return;
  target.hidden = false;
  target.textContent = message;
};
const renderOptions = ({ question, options, selected, result, prefix }) => `<fieldset class="dynamic-options"><legend class="dynamic-copy"><strong>Question</strong><br>${escapeHtml(question)}</legend>${options.map((label, index) => `<button class="dynamic-option ${selected === index ? 'is-selected' : ''} ${result && selected === index ? (result === 'complete' ? 'is-correct' : 'is-incorrect') : ''}" data-answer="${prefix}:${index}" type="button" ${result ? 'disabled' : ''}><span aria-hidden="true">${selected === index ? '◉' : '○'}</span><span>${escapeHtml(label)}</span></button>`).join('')}</fieldset>`;
const header = () => `<header class="dynamic-header"><a class="dynamic-back" href="/courses/" aria-label="Back to approved courses">← Back</a><a class="dynamic-brand" href="/">TYPE2LEARN</a><button class="dynamic-back" data-action="signout" type="button">Sign out</button></header>`;
const toolbar = () => `<div class="dynamic-toolbar" aria-label="Learning support bar"><button data-action="focus" aria-pressed="${state.focus}" type="button">Focus mode: ${state.focus ? 'on' : 'off'}</button><button data-action="tts" aria-pressed="${state.tts}" type="button">Text to speech: ${state.tts ? 'on' : 'off'}</button><button data-action="listen" type="button" ${state.tts ? '' : 'disabled'}>Read this step</button><button data-action="language" type="button">${state.language === 'en' ? 'اردو' : 'English'}</button><button data-action="pause" type="button">${state.paused ? 'Resume' : 'Pause & save'}</button><a class="dynamic-button dynamic-button--quiet" href="/settings/">Learning settings</a><button data-action="help" type="button">I’m stuck</button></div>`;
const progress = () => { if (!setting('visibleProgress', true)) return '<p class="dynamic-meta">One small step at a time · Your progress is saved.</p>'; const total = manifest.modules.length + 1; const count = state.completed ? total : state.moduleIndex; return `<div class="dynamic-progress" aria-label="Course progress"><span style="width:${Math.round((count / total) * 100)}%"></span></div><p class="dynamic-meta">Step ${Math.min(state.moduleIndex + 1, manifest.modules.length)} of ${manifest.modules.length} · One small step at a time · Your progress is saved.</p>`; };
const readTask = () => {
  const unit = content(); const chunks = readingChunks(); const smaller = setting('smallerSections'); const index = Math.min(state.readSectionIndex, Math.max(0, chunks.length - 1)); const last = index === chunks.length - 1;
  const reading = smaller ? readingCard(chunks[index], { current: true }) : chunks.map((item, itemIndex) => readingCard(item, { current: itemIndex === 0 })).join('');
  const sectionControls = smaller ? `<div class="dynamic-actions"><button class="dynamic-button dynamic-button--quiet" data-action="previous-section" type="button" ${index === 0 ? 'disabled' : ''}>Previous section</button>${last ? '<button class="dynamic-button dynamic-button--primary" data-action="to-type" type="button">Continue to response →</button>' : `<button class="dynamic-button dynamic-button--primary" data-action="next-section" type="button">Next section (${index + 2} of ${chunks.length}) →</button>`}</div>` : '<div class="dynamic-actions"><button class="dynamic-button dynamic-button--primary" data-action="to-type" type="button">Continue to response →</button></div>';
  const instruction = setting('literalInstructions') ? 'Read the visible section. Then select Continue to response.' : 'Read this short explanation';
  return `<p class="dynamic-eyebrow">Current task</p><h1 class="dynamic-title">${instruction}</h1><p class="dynamic-meta">${escapeHtml(unit.title || activeModule()?.id || 'Module')} · About 3 minutes</p>${setting('visibleNextSteps', true) ? '<p class="dynamic-notice">Next: use one short response, then check your understanding. You can pause at any point.</p>' : ''}${progress()}${reading}<div class="dynamic-actions"><button class="dynamic-button dynamic-button--quiet" data-action="hint" type="button">${setting('extraHints') ? 'Show an extra hint' : 'Show a hint'}</button></div>${sectionControls}`;
};
const typeTask = () => {
  const unit = content();
  const typing = unit.typing || {};
  const copy = typing.level === 'Recall typing' ? typing.prompt : `${typing.prompt}\n\n${typing.target || ''}`;
  const voice = setting('speechToText') ? `<button class="dynamic-button" data-action="speak-input" type="button">${state.listening ? 'Stop speaking' : speechRecognitionSupported() ? 'Speak your response' : 'Speech input unavailable'}</button>` : '';
  const alternative = setting('alternativeInput') || setting('alternativeResponses') ? '<button class="dynamic-button dynamic-button--quiet" data-action="alternative-response" type="button">Use another response format</button>' : '';
  const alternativeMenu = state.alternativeMenu ? `<div class="dynamic-choice-menu" role="group" aria-label="Alternative response formats"><p>Choose a way to continue. Your written response stays available.</p><button class="dynamic-button dynamic-button--quiet" data-action="focus-response" type="button">Use the response field</button>${setting('speechToText') ? '<button class="dynamic-button dynamic-button--quiet" data-action="speak-input" type="button">Use speech input</button>' : ''}<button class="dynamic-button dynamic-button--quiet" data-action="close-alternative-response" type="button">Close choices</button></div>` : '';
  return `<p class="dynamic-eyebrow">Your response</p><h1 class="dynamic-title">Type or use your usual input method.</h1><p class="dynamic-meta">This is not ranked for speed. Press Continue when you are ready.</p>${progress()}<article class="dynamic-card dynamic-current"><h2>${escapeHtml(typing.level || 'Key idea typing')}</h2><p>${escapeHtml(copy)}</p><textarea class="dynamic-typing" data-typed-response aria-label="Your response" placeholder="Write your response here…">${escapeHtml(state.answer)}</textarea><div class="dynamic-actions">${voice}${alternative}</div>${alternativeMenu}</article><div class="dynamic-actions"><button class="dynamic-button dynamic-button--quiet" data-action="back-read" type="button">Back to reading</button><button class="dynamic-button dynamic-button--primary" data-action="to-check" type="button">Continue to check →</button></div>`;
};
const checkTask = () => { const unit = content(); const check = unit.check || {}; const feedback = state.checkResult ? `<div class="dynamic-notice">${state.checkResult === 'complete' ? 'That response fits the reviewed idea. You can continue.' : 'Try this section again or choose a different answer. You can use the hint or reread the explanation.'}</div>` : ''; return `<p class="dynamic-eyebrow">Quick check</p><h1 class="dynamic-title">Check one small idea.</h1><p class="dynamic-meta">Choose one response, then submit it when you are ready.</p>${progress()}${renderOptions({ question: check.question, options: check.options || [], selected: state.checkAnswer, result: state.checkResult, prefix: 'module' })}${feedback}<div class="dynamic-actions">${state.checkResult === 'complete' ? '<button class="dynamic-button dynamic-button--primary" data-action="next-module" type="button">Continue →</button>' : '<button class="dynamic-button dynamic-button--primary" data-action="submit-module" type="button">Submit answer</button>'}<button class="dynamic-button dynamic-button--quiet" data-action="back-type" type="button">Back to response</button></div>`; };
const finalTask = () => { const questions = manifest.finalExam?.[state.language] || manifest.finalExam?.en || []; const question = questions[state.finalIndex]; if (!question) return `<p class="dynamic-eyebrow">Course complete</p><h1 class="dynamic-title">You completed this course.</h1><p class="dynamic-copy">Your progress is saved. You can return to your approved courses whenever you’re ready.</p><div class="dynamic-actions"><a class="dynamic-button dynamic-button--primary" href="/courses/">Return to courses</a></div>`; const feedback = state.finalResult ? `<div class="dynamic-notice">${state.finalResult === 'complete' ? 'That response fits the reviewed course content.' : 'Try again, reread the course, or ask for a hint.'}</div>` : ''; return `<p class="dynamic-eyebrow">Final understanding check</p><h1 class="dynamic-title">One question at a time.</h1><p class="dynamic-meta">Question ${state.finalIndex + 1} of ${questions.length} · No timer · Four choices</p>${renderOptions({ question: question.question, options: question.options, selected: state.finalAnswer, result: state.finalResult, prefix: 'final' })}${feedback}<div class="dynamic-actions">${state.finalResult === 'complete' ? `<button class="dynamic-button dynamic-button--primary" data-action="next-final" type="button">${state.finalIndex + 1 === questions.length ? 'Finish course' : 'Next question'} →</button>` : '<button class="dynamic-button dynamic-button--primary" data-action="submit-final" type="button">Submit answer</button>'}</div>`; };
const task = () => state.completed || state.phase === 'final' ? finalTask() : state.phase === 'type' ? typeTask() : state.phase === 'check' ? checkTask() : readTask();
const render = () => {
  const reducedMotion = state.focus || setting('reducedMotion');
  const classes = ['dynamic-course', state.focus ? 'dynamic-focus' : '', setting('fewerDistractions') || setting('quietDisplay') ? 'dynamic-course--quiet' : '', setting('largerControls') ? 'dynamic-course--large-controls' : '', setting('highContrast') ? 'dynamic-course--high-contrast' : '', `dynamic-course--text-${setting('textSize', 'standard')}`, `dynamic-course--spacing-${setting('spacing', 'standard')}`, `dynamic-course--width-${setting('readingWidth', 'comfortable')}`].filter(Boolean).join(' ');
  const transitions = !reducedMotion && setting('contentTransitions') ? 'on' : 'off';
  document.body.innerHTML = `<div class="${classes}" data-motion="${reducedMotion ? 'reduced' : 'normal'}" data-transitions="${transitions}">${header()}<main class="dynamic-main">${toolbar()}<section class="dynamic-panel">${task()}</section><div class="dynamic-modal" data-help hidden></div></main></div>`;
  bind();
};
const go = async (phase) => { state.phase = phase; state.checkResult = ''; state.finalResult = ''; await cloudSave(); render(); };
const bind = () => {
  document.querySelectorAll('[data-answer]').forEach((button) => button.addEventListener('click', () => { const [scope, index] = button.dataset.answer.split(':'); if (scope === 'module') state.checkAnswer = Number(index); else state.finalAnswer = Number(index); render(); }));
  document.querySelector('[data-action="focus"]')?.addEventListener('click', async () => { state.focus = !state.focus; await cloudSave(); render(); });
  document.querySelector('[data-action="tts"]')?.addEventListener('click', async () => { state.tts = !state.tts; if (!state.tts) window.speechSynthesis?.cancel(); await cloudSave(); render(); });
  document.querySelector('[data-action="listen"]')?.addEventListener('click', speak);
  document.querySelector('[data-action="language"]')?.addEventListener('click', async () => { state.language = state.language === 'en' ? 'ur' : 'en'; state.readSectionIndex = 0; await cloudSave(); render(); });
  document.querySelector('[data-action="pause"]')?.addEventListener('click', async () => { state.paused = !state.paused; await cloudSave(); render(); });
  document.querySelector('[data-action="help"]')?.addEventListener('click', () => { const target = document.querySelector('[data-help]'); target.hidden = !target.hidden; target.innerHTML = '<strong>You have options.</strong><p>Show a simpler explanation, read this step aloud, take a short break, or return to the previous task. There is no penalty for pausing.</p>'; });
  document.querySelector('[data-action="hint"]')?.addEventListener('click', () => { const target = document.querySelector('[data-help]'); target.hidden = false; target.innerHTML = `<strong>Optional hint</strong><p>${escapeHtml(content().hint)}</p>`; });
  document.querySelector('[data-action="previous-section"]')?.addEventListener('click', async () => { state.readSectionIndex = Math.max(0, state.readSectionIndex - 1); await cloudSave(); render(); });
  document.querySelector('[data-action="next-section"]')?.addEventListener('click', async () => { state.readSectionIndex = Math.min(readingChunks().length - 1, state.readSectionIndex + 1); await cloudSave(); render(); });
  document.querySelector('[data-action="to-type"]')?.addEventListener('click', () => go('type'));
  document.querySelector('[data-action="back-read"]')?.addEventListener('click', () => go('read'));
  document.querySelector('[data-action="back-type"]')?.addEventListener('click', () => go('type'));
  document.querySelector('[data-action="speak-input"]')?.addEventListener('click', startSpeechInput);
  document.querySelector('[data-action="alternative-response"]')?.addEventListener('click', () => { state.alternativeMenu = !state.alternativeMenu; render(); });
  document.querySelector('[data-action="close-alternative-response"]')?.addEventListener('click', () => { state.alternativeMenu = false; render(); });
  document.querySelector('[data-action="focus-response"]')?.addEventListener('click', () => { state.alternativeMenu = false; render(); document.querySelector('[data-typed-response]')?.focus(); });
  document.querySelector('[data-action="to-check"]')?.addEventListener('click', async () => { stopSpeechInput(); state.answer = document.querySelector('[data-typed-response]')?.value || ''; await go('check'); });
  document.querySelector('[data-action="submit-module"]')?.addEventListener('click', async () => { try { if (!Number.isInteger(state.checkAnswer)) throw new Error('Choose one answer before submitting.'); const result = await api('/api/v1/courses/check-answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId, version, scope: 'module', moduleId: activeModule().id, language: state.language, selectedIndex: state.checkAnswer }) }); state.checkResult = result.result; await cloudSave(); render(); } catch (error) { const target = document.querySelector('[data-help]'); target.hidden = false; target.textContent = error.message; } });
  document.querySelector('[data-action="next-module"]')?.addEventListener('click', async () => { state.moduleIndex += 1; state.readSectionIndex = 0; state.answer = ''; state.checkAnswer = null; state.checkResult = ''; state.phase = state.moduleIndex >= manifest.modules.length ? 'final' : 'read'; await cloudSave(); render(); });
  document.querySelector('[data-action="submit-final"]')?.addEventListener('click', async () => { try { if (!Number.isInteger(state.finalAnswer)) throw new Error('Choose one answer before submitting.'); const result = await api('/api/v1/courses/check-answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId, version, scope: 'final', questionIndex: state.finalIndex, language: state.language, selectedIndex: state.finalAnswer }) }); state.finalResult = result.result; await cloudSave(); render(); } catch (error) { const target = document.querySelector('[data-help]'); target.hidden = false; target.textContent = error.message; } });
  document.querySelector('[data-action="next-final"]')?.addEventListener('click', async () => { state.finalIndex += 1; state.finalAnswer = null; state.finalResult = ''; if (state.finalIndex >= (manifest.finalExam?.[state.language] || manifest.finalExam?.en || []).length) state.completed = true; await cloudSave(); render(); });
  document.querySelector('[data-action="signout"]')?.addEventListener('click', async () => { await signOutType2LearnUser(); location.assign('/'); });
  document.querySelector('[data-speakable]')?.addEventListener('click', speak);
  document.querySelector('[data-typed-response]')?.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && setting('smallerSections')) { event.preventDefault(); document.querySelector('[data-action="to-check"]')?.click(); } });
};

const failure = (message) => { document.body.innerHTML = `<main class="dynamic-course"><div class="dynamic-main"><section class="dynamic-panel"><h1 class="dynamic-title">This course is not ready here.</h1><p class="dynamic-copy">${escapeHtml(message)}</p><a class="dynamic-button" href="/courses/">Back to approved courses</a></section></div></main>`; };
if (!courseId || !version) failure('Choose a reviewed course from your catalogue.');
else {
  user = await waitForType2LearnUser();
  if (!user) location.assign(`/login/?next=${encodeURIComponent(location.pathname + location.search)}`);
  else {
    try {
      const response = await api(`/api/v1/course-manifest?courseId=${encodeURIComponent(courseId)}&version=${encodeURIComponent(version)}`);
      if (response.legacy) location.assign('/course/');
      else { manifest = response.manifest; supportSettings = resolveSettings(loadLearnerSettings(user.uid)); localLoad(); try { const remote = await api(`/api/v1/course-progress?courseId=${encodeURIComponent(`${courseId}@${version}`)}`); if (remote.snapshot?.state && Number(remote.snapshot.updatedAtMs) > 0) Object.assign(state, remote.snapshot.state); } catch (_) { /* Browser resume remains available. */ } render(); }
    } catch (error) { failure(error.message); }
  }
}
