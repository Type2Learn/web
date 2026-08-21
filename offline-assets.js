/**
 * Public, non-sensitive assets for the explicit “Download for offline use”
 * action. Do not add `/api/`, Firebase tokens, teacher submissions, answer
 * keys, private course manifests, or user data to this list.
 */
export const OFFLINE_CACHE_VERSION = 'type2learn-offline-v2';

export const CORE_SHELL_URLS = Object.freeze([
  '/', '/index.html', '/offline.html', '/site.webmanifest',
  '/styles.css', '/app.js', '/locale-routing.js', '/color-mode.js',
  '/website-scheme.js', '/website-scheme.css', '/firebase-auth.js', '/guest-session.js',
  '/assets/type2learn-favicon.png', '/assets/type2learn-logo-nav.webp',
  '/assets/fonts/manrope-latin-wght-normal.woff2',
  '/assets/fonts/cormorant-garamond-latin-wght-normal.woff2',
  '/assets/fonts/noto-nastaliq-urdu.ttf', '/assets/fonts/noto-sans-arabic.ttf',
  '/how-it-works/', '/learning-together/', '/participation-trust/', '/team/',
  '/co-design/', '/community/', '/families/', '/learners/', '/pathways/', '/research/', '/schools/', '/trust/',
  '/privacy/', '/terms/', '/accessibility/', '/security/', '/support/',
  '/ur/', '/ur/co-design/', '/ur/community/', '/ur/families/', '/ur/how-it-works/',
  '/ur/learners/', '/ur/learning-together/', '/ur/participation-trust/', '/ur/pathways/',
  '/ur/schools/', '/ur/team/', '/ur/trust/'
]);

export const LEARNING_PACKAGE_URLS = Object.freeze([
  // Course shell and every first-party module required by the public course.
  // Query-string versioning is intentionally ignored by the service worker.
  '/course/', '/course/index.html', '/course/course.css', '/course/course-router.js',
  '/course/course.js', '/course/course-content.js', '/course/course-urdu.js',
  '/course/course-audio-manifest.js', '/course/course-audio-cues.js', '/course/narration.js',
  '/course/ai-client.js', '/course/reviewed-manifest.js', '/course/learning-telemetry.js',
  '/course/behaviour-context.js', '/course/learning-partner.js', '/course/adaptive-support.js',
  '/course/visual-explanations.js', '/course/voice-text.js', '/course/learner-settings.js',
  '/course/mascot-2d.js', '/course/mascot-3d.js', '/course/dynamic-course.js', '/course/dynamic-course.css',
  '/color-mode.js', '/website-scheme.js', '/website-scheme.css', '/mascot.css',
  '/vendor/three.module.min.js', '/vendor/GLTFLoader.js',
  '/learn/', '/learn/index.html', '/learn/learn.js', '/learn/learn.css',
  '/afterlogin/', '/afterlogin/index.html', '/mascot.css', '/mascot.js',
  '/assets/audio/background-noise/pink-noise-loop.mp3',
  '/assets/audio/background-noise/white-noise-loop.mp3',
  '/assets/audio/background-noise/brown-noise-loop.mp3',
  '/assets/2D%20Mascot/blinking.webp', '/assets/mascot/guest-profile-bunny.webp',
  '/assets/mascot/type2learn-companion.glb',
  '/assets/rewards/type2learn-module-medal.webp', '/assets/rewards/type2learn-section-medal.webp'
]);

export const allOfflineUrls = () => [...new Set([...CORE_SHELL_URLS, ...LEARNING_PACKAGE_URLS])];
