const MASCOT_IMAGE_URL = '/assets/2D%20Mascot/blinking.webp';
const DESKTOP_QUERY = '(min-width: 1181px)';

const supportsDesktopMascot = () => window.matchMedia?.(DESKTOP_QUERY)?.matches;

// This controller deliberately matches the public interface of mascot-3d.js.
// Course and setup dialogue continue to be driven by their existing state;
// only the rendering surface has changed to the supplied transparent WebP.
export const createCourseMascot = () => {
  let target = null;
  let image = null;

  const ensureImage = () => {
    if (!target?.isConnected) return;
    if (!image) {
      image = document.createElement('img');
      image.className = 'course-mascot-image learning-mascot-image';
      image.src = MASCOT_IMAGE_URL;
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.decoding = 'async';
    }
    if (image.parentElement !== target) target.replaceChildren(image);
  };

  return {
    mount(nextTarget) {
      if (!nextTarget || !supportsDesktopMascot()) {
        this.unmount();
        return;
      }
      target = nextTarget;
      ensureImage();
    },
    // The animated WebP supplies its own blink loop. These methods remain so
    // established course events and all dialogue calls keep working unchanged.
    celebrate() {},
    wave() {},
    present() {},
    react() {},
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
