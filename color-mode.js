(() => {
  'use strict';

  const storageKey = 'type2learn-color-mode';
  const modes = Object.freeze(['flat', 'balanced', 'vivid']);
  const themeColors = Object.freeze({
    flat: '#F5F4F0',
    balanced: '#F5FAFF',
    vivid: '#E6F6FF'
  });

  const validMode = (value) => modes.includes(value) ? value : 'balanced';
  const read = () => {
    try { return validMode(window.localStorage.getItem(storageKey)); } catch (_) { return 'balanced'; }
  };

  const apply = (value, persist = false) => {
    const mode = validMode(value);
    document.documentElement.dataset.colorMode = mode;
    document.documentElement.style.colorScheme = 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[mode]);
    if (persist) {
      try { window.localStorage.setItem(storageKey, mode); } catch (_) { /* Keep the choice for this visit. */ }
    }
    window.dispatchEvent(new CustomEvent('type2learn:color-mode', { detail: { mode } }));
    return mode;
  };

  window.Type2LearnColorMode = {
    modes,
    get: () => validMode(document.documentElement.dataset.colorMode || read()),
    set: (value, persist = true) => apply(value, persist)
  };

  apply(read(), false);
})();
