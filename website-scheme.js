(() => {
  'use strict';

  // Website presentation is deliberately separate from task-level colour,
  // layout, and encouragement controls. It changes the visual shell after a
  // learner signs in without changing their course, progress, or supports.
  const storageKey = 'type2learn-website-scheme';
  const modes = Object.freeze(['calm', 'playful']);
  const themeColors = Object.freeze({
    calm: '#F5FAFF',
    playful: '#8FDDF5',
  });

  // Existing learners chose "Balanced" before it was renamed Calm. Preserve
  // that familiar, unchanged presentation while migrating the saved value.
  const validMode = (value) => value === 'balanced'
    ? 'calm'
    : modes.includes(value) ? value : 'calm';
  const read = () => {
    try { return validMode(window.localStorage.getItem(storageKey)); } catch (_) { return 'balanced'; }
  };

  const apply = (value, persist = false) => {
    const mode = validMode(value);
    document.documentElement.dataset.websiteScheme = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[mode]);
    if (persist) {
      try { window.localStorage.setItem(storageKey, mode); } catch (_) { /* Keep this visit's scheme. */ }
    }
    window.dispatchEvent(new CustomEvent('type2learn:website-scheme', { detail: { mode } }));
    return mode;
  };

  window.Type2LearnWebsiteScheme = {
    modes,
    get: () => validMode(document.documentElement.dataset.websiteScheme || read()),
    set: (value, persist = true) => apply(value, persist)
  };

  // Run synchronously in the document head so the saved scheme does not flash
  // back to Calm while the authenticated app is starting. Persisting here also
  // converts the retired "balanced" value once, before either app renders.
  apply(read(), true);
})();
