import { getType2LearnGuest } from '/guest-session.js?v=20260731-guest1';

const app = document.getElementById('learn-app');
const preferenceStoragePrefix = 'type2learn-course-preferences-v1:';
const legacyPreferenceStoragePrefix = 'type2learn-learning-preferences-v1:';
const supportedCourseIds = new Set(['course-1-neurodivergent-conditions-v2']);
const selectedCourseId = new URLSearchParams(window.location.search).get('course') || '';
const backgroundNoiseSources = {
  pink: '/assets/audio/background-noise/pink-noise-loop.mp3',
  white: '/assets/audio/background-noise/white-noise-loop.mp3',
  brown: '/assets/audio/background-noise/brown-noise-loop.mp3'
};
const backgroundNoisePreview = { audio: null, type: 'pink', volume: 0.15, playing: false, fadeFrame: null, playRequest: 0 };
const mascotModelUrl = '/assets/mascot/type2learn-companion.glb';
let mascotAssetsWarmed = false;
let mascotPreview = null;
let mascotPreviewLoad = null;
let setupStage = 'language';
let focusedStepIndex = 0;
let mascotLanguageExplicitlyChosen = false;
let layoutBeforeFocused = 'balanced';
let setupFeedbackTimer = 0;
let setupMotionSequence = 0;
const mascotScreenIsSupported = () => window.matchMedia?.('(min-width: 1181px)').matches;

const preferenceControls = [
  { id: 'layout', label: 'Page layout', description: 'How much space sits around one task.', choices: [['focused', 'Focused'], ['balanced', 'Balanced'], ['open', 'Open']] },
  { id: 'colours', label: 'Color style', description: 'How much color appears around the task.', choices: [['flat', 'Flat'], ['balanced', 'Balanced'], ['vivid', 'Vivid']] },
  { id: 'encouragement', label: 'Encouragement', description: 'How visible supportive moments feel.', choices: [['subtle', 'Subtle'], ['balanced', 'Balanced'], ['expressive', 'Expressive']] },
  { id: 'animations', label: 'Animations', description: 'How much supportive movement you would like to see.', choices: [['still', 'Still'], ['gentle', 'Gentle'], ['lively', 'Lively']] },
  { id: 'background-noise', label: 'Background noise', description: 'Optional looping sound, always off to start.', choices: [['off', 'Off'], ['on', 'On']] },
  { id: 'text-to-speech', label: 'Text to speech', description: 'Optional read-aloud support.', choices: [['off', 'Off'], ['on', 'On']] },
  { id: 'mascot', label: 'Mascot', description: 'A learning companion when you want one.', choices: [['off', 'Off'], ['on', 'On']] }
];

const defaultChoices = {
  ...Object.fromEntries(preferenceControls.map(({ id, choices }) => [id, id === 'colours' || id === 'layout' ? 'balanced' : id === 'animations' ? 'gentle' : choices[0][0]])),
  'learning-language': 'english',
  'mascot-language': 'english',
  'mascot-language-explicit': false,
  'mascot-voice': 'text',
  'mascot-behaviour': 'calm',
  'background-noise-type': 'pink',
  // A deliberately quiet starting point. The interface caps this at 35% so
  // background sound cannot jump to an unexpectedly loud browser volume.
  'background-noise-volume': '15'
};

const preferenceKey = (user, courseId) => preferenceStoragePrefix
  + encodeURIComponent(user?.uid || user?.email || 'learner')
  + ':' + encodeURIComponent(courseId);

const legacyPreferenceKey = (user) => legacyPreferenceStoragePrefix
  + encodeURIComponent(user?.uid || user?.email || 'learner');

const readPreferences = (user, courseId) => {
  try {
    const value = JSON.parse(window.localStorage.getItem(preferenceKey(user, courseId)) || 'null');
    if (value && typeof value === 'object') return value;
    // Existing general settings are used only to prefill this course once.
    // Continuing saves a separate, course-specific preference record.
    const legacy = JSON.parse(window.localStorage.getItem(legacyPreferenceKey(user)) || 'null');
    return legacy && typeof legacy === 'object' ? legacy : null;
  } catch (_) {
    return null;
  }
};
  try {
    return window.localStorage.getItem(sidebarStorageKey) !== 'false';
  } catch (_) {
    return true;
  }
};

const writeAutoHide = (value) => {
  try {
    window.localStorage.setItem(sidebarStorageKey, value ? 'true' : 'false');
  } catch (_) {
    /* The control still works for this visit if storage is blocked. */
  }
};

const sidebar = (user) => [
  '<aside class="learn-sidebar" aria-label="Learning navigation" data-learn-sidebar>',
  '<div class="learn-sidebar-inner">',
  '<a class="learn-brand" href="/learn/" aria-label="Type2Learn learning home"><img src="/assets/type2learn-logo-nav.webp" alt=""><span><strong>TYPE2LEARN</strong><span>Learn actively</span></span></a>',
  '<section class="sidebar-card" aria-label="Account"><small>Signed in</small><strong>' + escapeHtml(nameFor(user)) + '</strong></section>',
  '<nav class="learn-nav" aria-label="Temporary learning areas">',
  '<a href="/learn/" aria-current="page"><i aria-hidden="true"></i><span>Learning home</span></a>',
  '<a href="#next-step"><i aria-hidden="true"></i><span>Next step</span></a>',
  '<a href="#supports"><i aria-hidden="true"></i><span>Supports</span></a>',
  '<a href="#progress"><i aria-hidden="true"></i><span>Progress</span></a>',
  '<button class="sidebar-toggle" type="button" data-auto-hide-toggle><span>Auto-hide sidebar</span><span>On</span></button>',
  '</nav>',
  '<section class="sidebar-card" aria-label="Preview status"><small>Temporary app shell</small><strong>Course screens will connect here as the learner engine is imported.</strong></section>',
  '<button class="learn-signout" type="button" data-signout>Sign out</button>',
  '</div>',
  '</aside>',
  '<button class="sidebar-reveal-zone" type="button" data-sidebar-reveal aria-label="Show learning sidebar"><span aria-hidden="true"></span></button>'
].join('');

const mainContent = (user) => [
  '<main class="learn-main" id="learn-main">',
  '<div class="learn-topline">',
  '<span class="learn-pill"><i aria-hidden="true"></i> Private learning space</span>',
  '<span class="learn-user-chip"><span class="learn-avatar" aria-hidden="true">' + escapeHtml(initialsFor(user)) + '</span><span>' + escapeHtml(user?.email || 'Signed in to Type2Learn') + '</span></span>',
  '</div>',
  '<section class="welcome-stage" aria-labelledby="welcome-title">',
  '<div class="welcome-hero">',
  '<div class="welcome-copy">',
  '<aside class="inline-companion" aria-label="Type2Learn companion"><span class="mascot-illustration" aria-hidden="true"></span><p>Welcome back. Your learning space is ready.</p></aside>',
  '<h1 id="welcome-title">Welcome back, ' + escapeHtml(nameFor(user).split(/\s+/)[0]) + '.</h1>',
  '<p>Your next learning space is being built around one clear action, calm support controls, and saved progress. For now, this page gives us the after-login home that the course engine can plug into.</p>',
  '<div class="learn-actions">',
  '<a class="learn-action is-primary" href="#next-step"><i aria-hidden="true"></i> See the next step</a>',
  '<a class="learn-action" href="/pathways/"><i aria-hidden="true"></i> Explore pathways</a>',
  '</div>',
  '</div>',
  '<div class="welcome-visual" aria-hidden="true">',
  '<div class="learning-card-stack">',
  '<article class="learning-card"><strong>Read or hear.</strong><span>Meet one bounded idea with the objective visible.</span><small>01 Encounter</small></article>',
  '<article class="learning-card"><strong>Recall and type.</strong><span>Make thinking visible before the model answer appears.</span><small>02 Produce</small></article>',
  '<article class="learning-card"><strong>Correct, apply, return.</strong><span>Keep progress through useful evidence, not speed.</span><small>03 Keep</small></article>',
  '</div>',
  '</div>',
  '</div>',
  '</section>',
  '<section class="learn-panel-grid" aria-label="Learning home summary">',
  '<article class="learn-panel" id="next-step"><span class="metric-dot" aria-hidden="true"></span><h2>Start with one task.</h2><p>The first imported course screen will appear here. It should show one active action, a completion condition, and an accessible way to pause.</p></article>',
  '<article class="learn-panel" id="supports"><span class="metric-dot" aria-hidden="true"></span><h2>Keep supports private.</h2><p>Motion, spacing, audio, literal help, and pacing controls belong to the learner. They are not a diagnosis or a public score.</p></article>',
  '<article class="learn-panel" id="progress"><span class="metric-dot" aria-hidden="true"></span><h2>Save useful evidence.</h2><p>This shell is ready for resume state, corrections, application work, and return review once the lesson engine is connected.</p></article>',
  '</section>',
  '</main>'
].join('');

const render = (user) => {
  app.innerHTML = '<div class="learn-app" data-learn-app>' + sidebar(user) + mainContent(user) + '</div>';
};

const setupSidebarAutoHide = () => {
  const shell = document.querySelector('[data-learn-app]');
  const sidebarElement = document.querySelector('[data-learn-sidebar]');
  const reveal = document.querySelector('[data-sidebar-reveal]');
  const toggle = document.querySelector('[data-auto-hide-toggle]');
  if (!shell || !sidebarElement || !reveal || !toggle) return;

  let autoHide = readAutoHide();
  let hidden = false;
  let hideTimer = 0;
  let revealTimer = 0;
  let insideSidebar = false;
  let pointerDown = false;
  let pointer = { x: 9999, y: 9999 };
  let outsideClicks = 0;
  let outsideTimer = 0;

  const enabled = () => autoHide && desktopQuery.matches && !reducedMotionQuery.matches;
  const clearHide = () => window.clearTimeout(hideTimer);
  const clearReveal = () => window.clearTimeout(revealTimer);
  const clearOutside = () => {
    outsideClicks = 0;
    window.clearTimeout(outsideTimer);
  };
  const apply = () => {
    shell.classList.toggle('is-sidebar-hidden', enabled() && hidden);
    reveal.classList.toggle('is-active', enabled() && hidden);
    toggle.setAttribute('aria-pressed', String(autoHide));
    toggle.querySelector('span:last-child').textContent = autoHide ? 'On' : 'Off';
  };
  const scheduleHide = (delay = 8500) => {
    clearHide();
    if (!enabled() || insideSidebar) return;
    hideTimer = window.setTimeout(() => {
      hidden = true;
      apply();
    }, delay);
  };
  const show = () => {
    clearReveal();
    hidden = false;
    clearOutside();
    apply();
    scheduleHide();
  };
  const scheduleReveal = () => {
    if (!enabled() || !hidden || pointerDown || revealTimer) return;
    revealTimer = window.setTimeout(show, 240);
  };

  toggle.addEventListener('click', () => {
    autoHide = !autoHide;
    writeAutoHide(autoHide);
    hidden = false;
    clearHide();
    clearReveal();
    clearOutside();
    apply();
    scheduleHide();
  });

  reveal.addEventListener('pointerenter', scheduleReveal, { passive: true });
  reveal.addEventListener('pointerleave', clearReveal, { passive: true });
  reveal.addEventListener('focus', scheduleReveal);
  reveal.addEventListener('blur', clearReveal);
  reveal.addEventListener('click', show);

  sidebarElement.addEventListener('pointerenter', () => {
    insideSidebar = true;
    clearHide();
    clearOutside();
  }, { passive: true });
  sidebarElement.addEventListener('pointerleave', () => {
    insideSidebar = false;
    scheduleHide();
  }, { passive: true });
  sidebarElement.addEventListener('focusin', () => {
    insideSidebar = true;
    clearHide();
  });
  sidebarElement.addEventListener('focusout', () => {
    insideSidebar = false;
    scheduleHide();
  });

  window.addEventListener('pointermove', (event) => {
    const previous = pointer;
    const dx = event.clientX - previous.x;
    const dy = Math.abs(event.clientY - previous.y);
    pointer = { x: event.clientX, y: event.clientY };
    if (!enabled() || !hidden || pointerDown) {
      clearReveal();
      return;
    }
    const safeY = event.clientY > 28 && event.clientY < window.innerHeight - 28;
    const hardEdge = event.clientX <= 10;
    const intentEdge = event.clientX <= 26 && dx < -0.7 && dy < 18;
    const edgeDwell = event.clientX <= 26 && Math.abs(dx) < 2.5 && dy < 10;
    if (safeY && (hardEdge || intentEdge || edgeDwell)) scheduleReveal();
    else if (event.clientX > 36) clearReveal();
  }, { passive: true });

  window.addEventListener('pointerdown', (event) => {
    pointerDown = true;
    clearReveal();
    if (!enabled() || hidden) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('[data-learn-sidebar], [data-sidebar-reveal]')) {
      clearOutside();
      return;
    }
    outsideClicks += 1;
    if (outsideClicks >= 2) {
      hidden = true;
      clearOutside();
      clearHide();
      apply();
      return;
    }
    window.clearTimeout(outsideTimer);
    outsideTimer = window.setTimeout(clearOutside, 2600);
  }, { passive: true });

  window.addEventListener('pointerup', () => {
    window.setTimeout(() => { pointerDown = false; }, 120);
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (!desktopQuery.matches) hidden = false;
    apply();
    scheduleHide();
  }, { passive: true });

  apply();
  scheduleHide();
};

const boot = async () => {
  let user = null;
  try {
    user = await waitForType2LearnUser();
  } catch (_) {
    user = null;
  }

  if (!user) {
    window.location.replace('/login/?next=%2Flearn%2F');
    return;
  }

  render(user);
  setupSidebarAutoHide();
  document.querySelector('[data-signout]')?.addEventListener('click', async () => {
    await signOutType2LearnUser();
    window.location.assign('/login/');
  });
  window.dispatchEvent(new CustomEvent('type2learn:companion-message', { detail: { event: 'learn-home' } }));
};

boot();
