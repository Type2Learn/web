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
    },
    // The animated WebPs supply the visual response while the existing course
    // event and dialogue system continues to determine when a greeting fits.
    celebrate() { setAnimation(WAVING_IMAGE_URL); },
    wave() { setAnimation(WAVING_IMAGE_URL); },
    present(sceneName) {
      presentation.scene = sceneName;
      setAnimation(animationForScene(sceneName));
    },
    react(event) {
      if (['task-entry', 'section-complete', 'module-complete', 'course-complete', 'answer-correct'].includes(event?.kind)) {
        this.celebrate();
        return;
      }
      setAnimation(BLINKING_IMAGE_URL);
    },
    unmount() {
      target = null;
    },
    destroy() {
      target = null;
      image?.remove();
      image = null;
    }
  };
};
