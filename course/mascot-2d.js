const BLINKING_IMAGE_URL = '/assets/2D%20Mascot/blinking.webp?v=20260804-loop1';
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

  const setAnimation = (nextAnimation) => {
    currentAnimation = nextAnimation;
    if (!image || image.dataset.mascotAnimation === nextAnimation) return;
    image.dataset.mascotAnimation = nextAnimation;
    image.src = nextAnimation;
  };

  const showBlinking = () => {
    setAnimation(BLINKING_IMAGE_URL);
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
      // Keep one uninterrupted animated WebP source for every scene and
      // support event. It contains the intended blinking loop itself; never
      // replace it with a temporary pose or restart it between reactions.
      currentAnimation = BLINKING_IMAGE_URL;
      ensureImage();
      showBlinking();
    },
    // Preserve the controller's public event API, but each event keeps the
    // same continuous blinking animation rather than swapping to a wave.
    celebrate() { showBlinking(); },
    wave() { showBlinking(); },
    present(sceneName) {
      presentation.scene = sceneName;
      showBlinking();
    },
    react(event) {
      showBlinking();
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
