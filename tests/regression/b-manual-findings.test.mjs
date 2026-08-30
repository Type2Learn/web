import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [adminHtml, teacherHtml, workspaceJs, workspaceCss, courseJs, courseCss, learnJs, learnCss] = await Promise.all([
  read('../../admin/index.html'),
  read('../../teacher/index.html'),
  read('../../workspace.js'),
  read('../../workspace.css'),
  read('../../course/course.js'),
  read('../../course/course.css'),
  read('../../learn/learn.js'),
  read('../../learn/learn.css')
]);

test('B-01: administrator and teacher documents start behind private access gates', () => {
  assert.match(adminHtml, /<body data-workspace="admin" class="workspace-auth-pending">/);
  assert.match(adminHtml, /data-workspace-gate/);
  assert.match(adminHtml, /data-workspace-shell aria-hidden="true" inert/);
  assert.match(teacherHtml, /<body data-workspace="teacher" class="workspace-auth-pending">/);
  assert.match(teacherHtml, /data-workspace-gate/);
  assert.match(teacherHtml, /data-workspace-shell aria-hidden="true" inert/);
  assert.match(workspaceCss, /workspace-auth-pending \.workspace-shell[\s\S]*display: none !important/);
});

test('B-01: no role can reveal a workspace before its server role is verified', () => {
  assert.match(workspaceJs, /await refreshRole\(\);[\s\S]*if \(!allowedForPage\(\)\)[\s\S]*location\.replace\('\/course\/'\)/);
  assert.match(workspaceJs, /if \(!user\)[\s\S]*location\.replace\(`\/login/);
  assert.match(workspaceJs, /revealWorkspace\(\);[\s\S]*renderWorkspace\(\);/);
});

test('B-02: all three looping background-noise assets exist and are non-empty', async () => {
  for (const name of ['pink-noise-loop.mp3', 'white-noise-loop.mp3', 'brown-noise-loop.mp3']) {
    const asset = new URL('../../assets/audio/background-noise/' + name, import.meta.url);
    const [info, bytes] = await Promise.all([stat(asset), readFile(asset)]);
    assert.ok(info.size > 32_000, `${name} must be a real audio asset`);
    assert.equal(bytes.subarray(0, 3).toString('ascii'), 'ID3', `${name} must retain MP3 metadata`);
  }
});

test('B-02: Brown noise remains an explicit source in setup and course playback', () => {
  assert.match(learnJs, /brown:\s*'\/assets\/audio\/background-noise\/brown-noise-loop\.mp3'/);
  assert.match(courseJs, /brown:\s*'\/assets\/audio\/background-noise\/brown-noise-loop\.mp3'/);
  assert.match(courseJs, /requestId: 0/);
  assert.match(courseJs, /requestId !== backgroundNoise\.requestId \|\| audio !== backgroundNoise\.audio/);
});

test('B-02: enabling the mascot keeps preference controls inside a usable rail layout', () => {
  assert.match(learnCss, /padding-right: clamp\(430px, 36vw, 640px\)/);
  assert.match(learnCss, /width: clamp\(320px, 29vw, 500px\)/);
  assert.match(learnCss, /\.learning-mascot-details \{\s*grid-column: 1 \/ -1;\s*min-width: 0;/);
  assert.match(learnCss, /max-width: 1550px[\s\S]*learning-control-list \{ grid-template-columns: repeat\(2/);
});

test('B-03: guest learners can use the server-approved bounded public Course AI workflow', () => {
  assert.match(courseJs, /const courseAiAccessAllowed = \(\) => signedInLearner\(\)\s*\|\| Boolean\(authenticatedUser\?\.isGuest && aiChat\.connection\.guestAccess\)/);
  // The policy check is awaited before the surface opens. A guest must never
  // briefly land in a disabled composer while the health contract is loading.
  assert.match(courseJs, /if \(authenticatedUser\?\.isGuest && !aiChat\.connection\.checked\) await refreshAiConnection\(\);/);
  assert.match(courseJs, /if \(authenticatedUser\?\.isGuest && !courseAiAccessAllowed\(\)\) \{/);
  assert.match(courseJs, /guestAccess = Boolean\(status\?\.ai\?\.guestAccess \?\? status\?\.ai\?\.localGuestPreview\)/);
  assert.match(courseJs, /const courseAiHistory = \(\)/);
  assert.match(courseJs, /history, companionRole: partnerControls\(\)\.role/);
  assert.match(courseJs, /const canRequestAdaptiveRecall = \(\) => signedInLearner\(\);/);
});

test('B-03: mascot speech has an explicit learner-controlled Listen action', () => {
  assert.match(courseJs, /const mascotSpeechCanPlay/);
  assert.match(courseJs, /const speakMascotDialogue/);
  assert.match(courseJs, /data-action="mascot-speak"/);
  assert.match(courseJs, /case 'mascot-speak': speakMascotDialogue\(\);/);
  assert.match(courseCss, /\.course-mascot-listen/);
});

test('B-04: typed character state uses Unicode-safe arrays, not code-unit lengths', () => {
  assert.match(courseJs, /const previousCharacters = Array\.from\(state\.progress\.attempt\.response \|\| ''\);/);
  assert.match(courseJs, /const nextCharacters = Array\.from\(nextValue \|\| ''\);/);
  assert.match(courseJs, /const insertedCharacters = nextCharacters\.slice\(previousCharacters\.length\);/);
  assert.match(courseJs, /correctCharacters: newlyCorrect/);
  assert.match(courseJs, /incorrectCharacters: Math\.max\(0, insertedLength - newlyCorrect\)/);
});

test('B-04: audio-guided typing advances across fast input bursts and cues only the first mismatch', () => {
  assert.match(courseJs, /if \(insertedCharacters\.length > 1\) typingGuidance\.fastMode = true;/);
  assert.match(courseJs, /const mismatchPosition = firstMismatchOffset < 0 \? -1 : previous\.length \+ firstMismatchOffset;/);
  assert.match(courseJs, /typingGuidance\.expectedIndex = mismatchPosition >= 0 \? mismatchPosition : response\.length;/);
  assert.match(courseJs, /referenceCharacters\[mismatchPosition\]/);
});

test('B-05: I’m stuck opens barrier choices before requesting Adaptive Recall', () => {
  assert.match(courseJs, /case 'stuck':[\s\S]*clearAdaptiveRecall\(\);[\s\S]*openCourseModal\('help'/);
  assert.match(courseJs, /if \(state\.modal === 'help'\) return stuckModalMarkup\(\);/);
  assert.match(courseJs, /data-action="adaptive-barrier"/);
});

test('B-06: the support chooser explains that it only changes the current step', () => {
  assert.match(courseJs, /Support will adapt only this current step; it will not change your lesson\./);
  assert.match(courseJs, /Choose what is getting in the way\./);
  assert.match(courseJs, /Talk to Course AI/);
});

test('B-07: deterministic support varies with an entered response and a revision', () => {
  assert.match(courseJs, /const adaptiveFallback = \(barrier = '', response = '', previousResponse = ''\)/);
  assert.match(courseJs, /You have started\. Try adding one more complete sentence\./);
  assert.match(courseJs, /You changed your response\. Now connect it to the current idea\./);
  assert.match(courseJs, /const fallback = adaptiveFallback\(barrier, safeResponse, previousResponse\);/);
});

test('typing tasks offer an immediate return to reading without throwing away the active response', () => {
  assert.match(courseJs, /data-action="return-to-reading"/);
  assert.match(courseJs, /case 'return-to-reading':[\s\S]*state\.returnToTypingAfterReading = true;[\s\S]*state\.progress\.phase = 'read';/);
  assert.match(courseJs, /const returningToTyping = state\.returnToTypingAfterReading;[\s\S]*if \(!returningToTyping\) state\.progress\.attempt = blankAttempt\(\);/);
  assert.match(courseJs, /showCurrentTaskFromStart\('\[data-action="read-complete"\]'\)/);
  assert.match(courseJs, /const immediateBackAction = actions\.querySelector\('\[data-action="return-to-reading"\]'\);[\s\S]*actions\.insertBefore\(navigation, immediateBackAction \|\| primaryAction \|\| null\);/);
});

test('every course task receives one consistent non-destructive Go back route beside its forward action', () => {
  assert.match(courseJs, /const taskBackRoute = \(\) => \{/);
  assert.match(courseJs, /if \(state\.progress\.phase === 'preview'\) return 'return-to-course-selection';/);
  assert.match(courseJs, /if \(state\.progress\.phase === 'assessment'\) return 'return-from-understanding-check';/);
  assert.match(courseJs, /if \(state\.progress\.phase === 'exam'\) return 'previous-exam-question';/);
  assert.match(courseJs, /actions\.insertBefore\(back, forward\);/);
  assert.match(courseJs, /case 'return-to-previous-module-task':/);
  assert.match(courseJs, /case 'previous-exam-question':/);
  assert.match(courseCss, /course-task-actions \.course-task-back-button/);
});

test('completed understanding checks retain one explicit return path without malformed task-action markup', () => {
  assert.match(courseJs, /Understanding check complete[\s\S]*<div class="course-task-actions">[\s\S]*return-from-understanding-check/);
  assert.match(courseJs, /existing\.classList\.remove\('course-primary-button'\);[\s\S]*existing\.classList\.add\('course-secondary-button', 'course-task-back-button'\);/);
});
