const BLINKING_IMAGE_URL = '/assets/2D%20Mascot/blinking.webp?v=20260803-2';
const WAVING_IMAGE_URL = '/assets/2D%20Mascot/waving.webp?v=20260803-1';
const DESKTOP_QUERY = '(min-width: 1181px)';

const supportsDesktopMascot = () => window.matchMedia?.(DESKTOP_QUERY)?.matches;

// This controller deliberately matches the public interface of mascot-3d.js.
// Course and setup dialogue continue to be driven by their existing state;
// only the rendering surface has changed to the supplied transparent WebP.
export const createCourseMascot = () => {
  let target = null;
  let image = null;
  let presentation = { scene: '' };
  let currentAnimation = BLINKING_IMAGE_URL;
  let waveTimer = null;

  const animationForScene = (sceneName) => [
    'dashboard',
    'browse',
    'saved',
    'course-preview',
    'course-exam-intro'
  ].includes(sceneName) ? WAVING_IMAGE_URL : BLINKING_IMAGE_URL;

  const setAnimation = (nextAnimation) => {
    currentAnimation = nextAnimation;
    if (!image || image.dataset.mascotAnimation === nextAnimation) return;
    image.dataset.mascotAnimation = nextAnimation;
    image.src = nextAnimation;
  };

  const clearWaveTimer = () => {
    if (!waveTimer) return;
    window.clearTimeout(waveTimer);
    waveTimer = null;
  };

  const showBlinking = () => {
    clearWaveTimer();
    setAnimation(BLINKING_IMAGE_URL);
  };

  const playWave = () => {
    clearWaveTimer();
    setAnimation(WAVING_IMAGE_URL);
    // A wave is a brief greeting or acknowledgement, never a persistent
    // distraction. The already-preloaded blink loop resumes immediately.
    waveTimer = window.setTimeout(() => {
      waveTimer = null;
      setAnimation(BLINKING_IMAGE_URL);
    }, 333);
  };

  const ensureImage = () => {
    if (!target?.isConnected) return;
    if (!image) {
      image = document.createElement('img');
      image.className = 'course-mascot-image learning-mascot-image';
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.decoding = 'async';
    }
    setAnimation(currentAnimation);
    if (image.parentElement !== target) target.replaceChildren(image);
  };

  return {
    mount(nextTarget, nextPresentation = {}) {
      if (!nextTarget || !supportsDesktopMascot()) {
        this.unmount();
        return;
      }
      target = nextTarget;
      presentation = { ...presentation, ...nextPresentation };
      currentAnimation = animationForScene(presentation.scene);
      ensureImage();
      if (currentAnimation === WAVING_IMAGE_URL) playWave();
      else showBlinking();
    },
    // The animated WebPs supply the visual response while the existing course
    // event and dialogue system continues to determine when a greeting fits.
    celebrate() { playWave(); },
    wave() { playWave(); },
    present(sceneName) {
      presentation.scene = sceneName;
      if (animationForScene(sceneName) === WAVING_IMAGE_URL) playWave();
      else showBlinking();
    },
    react(event) {
      if (['task-entry', 'section-complete', 'module-complete', 'course-complete', 'answer-correct'].includes(event?.kind)) {
        this.celebrate();
        return;
      }
      showBlinking();
    },
    unmount() {
      clearWaveTimer();
      target = null;
    },
    destroy() {
      clearWaveTimer();
      target = null;
      image?.remove();
      image = null;
    }
  };
};
