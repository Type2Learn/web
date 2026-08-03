# Type2Learn voice library — web-ready assets

This folder contains the supplied voice library in a delivery format. It is an
asset library only: the course does **not** currently load, select, or play any
of these files.

## Delivery format

- **7,561 named clips** preserved in their original language / voice / word
  hierarchy.
- **Opus**, mono, constrained to approximately **24 kbps** with speech
  loudness normalised to a conservative level.
- Total asset size: **34,073,330 bytes** (about 34 MB), reduced from about
  255 MB of source MP3 audio.
- Every clip remains individually addressable, for example:
  `ENGLISH/FEMALE/ElvenVoiceFemale page 10to15/absence.opus`.

## Future integration rules

1. Do not preload this entire folder. Fetch only the clip selected for the
   current phrase, with the immediate next clip optionally preloaded after a
   learner explicitly starts text-to-speech.
2. Text-to-speech and mascot speech must remain opt-in. No course page may
   start audio by itself.
3. Playback should use the explicit learner volume setting and begin at a
   safe low value. The asset normalisation is a fallback, not permission to
   raise playback volume.
4. Keep the original path names when mapping authored content to audio so
   voice choice and word provenance remain clear to reviewers.

Source archive: `VOICE LIBRARY(1).rar` (SHA-256
`816804080bf7fd5183dd2f03e7e59c21b73e8aa11d6328c68dd9984dbbe70b70`).
