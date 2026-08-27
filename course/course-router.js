// The established course UI is the compatibility player for both the
// historical route and selected reviewed courses. `course.js` obtains a
// learner-safe manifest when courseId/version are present, so its mature TTS,
// completion, settings, support, and accessibility behaviour remain shared.
// Keep the learner shell and the catalogue/voice fixes on the same immutable
// module URL. This matters for a returning learner with an older offline or
// browser cache: the new route must request the current course player.
// Keep the rich learner player and its CSS release in lockstep.  This query
// version is intentionally advanced with learner-facing fixes so a deployed
// browser or offline shell cannot keep an obsolete voice/mascot module.
await import('./course.js?v=20260827-live-companion2');
