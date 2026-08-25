import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [course, css, setup, mascot] = await Promise.all([
  read('../../course/course.js'),
  read('../../course/course.css'),
  read('../../learn/learn.js'),
  read('../../course/mascot-2d.js')
]);

test('profile settings use a modal with explicit categories and a backdrop close action', () => {
  assert.match(course, /course-settings-backdrop" data-action="close-settings-menu"/);
  assert.match(course, /tabButton\('general', 'General'/);
  assert.match(course, /tabButton\('reading', 'Reading & input'/);
  assert.match(course, /tabButton\('partner', 'Learning partner'/);
  assert.match(course, /tabButton\('privacy', 'Data & privacy'/);
  assert.match(course, /const settingsTab = event\.target\.closest\('\[data-settings-tab\]'/);
  assert.match(css, /\.course-settings-layout\s*\{/);
  assert.match(css, /grid-template-columns: 220px minmax\(0, 1fr\)/);
  assert.match(css, /\.course-settings-backdrop \.course-settings-menu[\s\S]*display: flex;[\s\S]*height: min\(720px, calc\(100dvh - 48px\)\)/);
  assert.match(css, /\.course-settings-layout[\s\S]*min-height: 0;[\s\S]*flex: 1 1 auto;[\s\S]*overflow: hidden/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.course-settings-backdrop \{ align-items: center; padding: 10px; \}/);
});

test('profile settings dialog is portalled outside the blurred sticky header so viewport centering is real', () => {
  const topbarStart = course.indexOf('const courseTopbar = () =>');
  const shellStart = course.indexOf('const renderShell = (content) =>');
  assert.ok(topbarStart >= 0 && shellStart > topbarStart, 'course shell declarations are present');
  const topbar = course.slice(topbarStart, shellStart);
  assert.doesNotMatch(topbar, /courseSettingsMenu\(\)/, 'the dialog must not be a descendant of the top bar backdrop-filter context');
  const shell = course.slice(shellStart, shellStart + 900);
  assert.match(shell, /course-page-content[\s\S]*courseSettingsMenu\(\)/, 'the dialog is rendered after page content as an app-shell sibling');
  assert.match(shell, /truly centered against the browser viewport/);
});

test('mascot dialogue Listen uses only the configured course voice for guests and signed learners', () => {
  assert.match(course, /const mascotSpeech = \{ controller: null, element: null, url: '', loading: false, text: '' \}/);
  assert.match(course, /const currentMascotSpeechText = \(\)/);
  assert.match(course, /const dialogue = currentMascotSpeechText\(\);/);
  assert.match(course, /const speakMascotDialogue = async/);
  assert.match(course, /synthesiseCourseAiReply\(\{/);
  assert.match(course, /mascotSpeech\.loading \? courseUi\('Loading audio…'/);
  assert.match(course, /mascotSpeech\.text === dialogue \? courseUi\('Stop audio'/);
  assert.match(course, /stopMascotSpeech\(\);/);
  assert.match(course, /const SILENT_AUDIO_UNLOCK_WAV/);
  assert.match(course, /const unlockMascotAudioFromClick/);
  assert.match(course, /mascotSpeech\.element = unlockMascotAudioFromClick\(\)/);
  assert.match(course, /const audio = mascotSpeech\.element \|\| new Audio\(\)/);
  assert.match(css, /\.course-mascot-dialogue[\s\S]*pointer-events: auto/);
  assert.match(css, /\.course-mascot-listen[\s\S]*touch-action: manipulation/);
  assert.match(course, /Turning text-to-speech off hides this optional control everywhere/);
  assert.doesNotMatch(course, /const speakMascotWithBrowser/);
  const mascotSpeechStart = course.indexOf('const speakMascotDialogue = async');
  const mascotSpeechEnd = course.indexOf('const mascotSpeechButtonMarkup');
  const mascotSpeech = course.slice(mascotSpeechStart, mascotSpeechEnd);
  assert.doesNotMatch(mascotSpeech, /SpeechSynthesisUtterance|speechSynthesis\\.speak/);
});

test('mascot is one language-following partner with a direct dock centred under its visual rail', () => {
  assert.doesNotMatch(course, /settingsChoiceGroup\('mascot-language'/);
  assert.doesNotMatch(course, /settingsChoiceGroup\('mascot-voice-language'/);
  assert.doesNotMatch(setup, /id: 'mascot-language'/);
  assert.doesNotMatch(setup, /id: 'mascot-voice-language'/);
  assert.match(course, /language: supportLanguage\(\)/);
  assert.match(course, /const dockMarkup = !showAiPanel && location === 'lesson'/);
  assert.match(course, /companionRole: partnerControls\(\)\.role/);
  assert.match(course, /behaviourPartner\.focusedOpen = true/);
  assert.match(css, /\.course-companion-dock[\s\S]*right: 57\.2%; bottom: clamp\(14px, 3\.4vh, 34px\)/);
  assert.match(css, /\.course-companion-dock[\s\S]*width: min\(560px, calc\(100% - 12px\)\)/);
  assert.match(css, /\.course-companion-dock[\s\S]*pointer-events: auto/);
  assert.match(course, /mascotSpeechButtonMarkup\(dialogue\)/);
});

test('approved published courses load into the normal learner course selection and preserve course-specific setup', () => {
  assert.match(course, /loadPublishedCourseCatalogue/);
  assert.match(course, /const reviewedCourseCatalogue = \{ status: 'idle'/);
  assert.match(course, /const refreshReviewedCourseCatalogue = async/);
  assert.match(course, /data-action="open-reviewed-course"/);
  assert.match(course, /const openReviewedCoursePreferences/);
  assert.match(course, /destination\.searchParams\.set\('version', version\)/);
  assert.match(course, /if \(!usesReviewedManifest\(\)\) void refreshReviewedCourseCatalogue\(\)/);
});

test('course entry points share the current cache-busted catalogue and mascot player', async () => {
  const [router, courseHtml] = await Promise.all([
    read('../../course/course-router.js'),
    read('../../course/index.html')
  ]);
  assert.match(router, /course\.js\?v=20260825-mascot-companion-route3/);
  assert.match(courseHtml, /course-router\.js\?v=20260825-mascot-companion-route3/);
  assert.match(courseHtml, /course\.css\?v=20260825-mascot-companion-route3/);
});

test('starting preferences show privacy-aware support and reveal mascot controls only after Mascot is enabled', () => {
  assert.match(setup, /id: 'adaptive-learning'/);
  assert.doesNotMatch(setup, /id: 'learning-partner'/);
  assert.match(setup, /const partnerRoleControl/);
  assert.match(setup, /const partnerPresenceControl/);
  assert.match(setup, /const partnerProactiveControl/);
  assert.match(setup, /if \(choices\.mascot === 'on'\) steps\.push\(\{ id: 'mascot-role' \}, \{ id: 'mascot-presence' \}, \{ id: 'mascot-proactive' \}\)/);
  assert.match(setup, /const mascotDetailsMarkup = \(choices\) => choices\.mascot === 'on'/);
  assert.match(setup, /label: 'Mascot personality'/);
  assert.match(setup, /label: 'Mascot offer'/);
});

test('mascot role selection changes its immediate visual state and written dialogue', () => {
  assert.match(course, /const mascotRolePreviewCopy/);
  assert.match(course, /refreshMascotRolePreview\(\)/);
  assert.match(mascot, /target\.dataset\.mascotRole = presentation\.behaviour/);
  assert.match(css, /data-mascot-role="learning-partner"/);
  assert.match(css, /data-mascot-role="self-challenge"/);
  assert.match(css, /data-mascot-role="visual-co-explorer"/);
});

test('mascot presence keeps encouragement inside the task rather than creating a popup', () => {
  assert.match(course, /const isPopup = .*?!mascotCanAppear\(\)/s);
  assert.match(course, /const popupPresentation = .*?!mascotCanAppear\(\)/s);
});

test('browser recognition failures stop clearly and never schedule a reconnect loop', () => {
  assert.match(course, /Live browser recognition lost its connection\. Try Speak again/);
  assert.match(course, /recognition\.onend = \(\) =>[\s\S]*Live browser recognition stopped/);
  assert.doesNotMatch(course, /scheduleVoiceRecognitionRestart/);
});
