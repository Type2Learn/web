# Type2Learn voice library

> A web-ready, named speech-asset library for future learner-controlled voice
> experiences.

This directory contains the supplied voice library in its delivery format. It
is an asset library, not an automatic soundtrack: the course does **not**
preload the collection or play these clips without a learner action.

## What is here

| Asset property | Delivery choice |
| --- | --- |
| Clip count | 7,561 individually addressable clips |
| Organisation | Original language / voice / word hierarchy is preserved |
| Format | Mono Opus, approximately 24 kbps |
| Loudness | Conservatively normalised for safe web playback |
| Size | 34,073,330 bytes (about 34 MB), reduced from about 255 MB of source MP3 |
| Example | `ENGLISH/FEMALE/ElvenVoiceFemale page 10to15/absence.opus` |

The library is compressed so a product can request exactly the clip it needs
without placing an unreasonable download on a learner’s connection.

## Integration contract

1. **Start only on a learner action.** Text-to-speech and mascot speech are
   opt-in; neither begins automatically on a course page.
2. **Fetch narrowly.** Request the active phrase or word only. After playback
   starts, it is acceptable to preload the immediately next clip—not the whole
   library.
3. **Respect volume and motion preferences.** Start at the learner’s selected
   safe volume. Normalisation protects against extreme source variance; it is
   not permission to raise playback volume.
4. **Keep provenance clear.** Preserve original paths when connecting authored
   course language to a voice clip, so content and voice selection can be
   reviewed.
5. **Always retain a text path.** A voice clip supplements written content; it
   cannot become the only way to receive instructions, feedback, or answers.
6. **Do not infer characteristics from voice use.** Choosing a voice or
   read-aloud should never create a learner label or reduce course access.

## Source integrity

The source archive is `VOICE LIBRARY(1).rar` with SHA-256:

```text
816804080bf7fd5183dd2f03e7e59c21b73e8aa11d6328c68dd9984dbbe70b70
```

For the wider narration and speech architecture, see
[`course/narration.js`](../../../course/narration.js),
[`course/course-audio-manifest.js`](../../../course/course-audio-manifest.js),
and the [main README](../../../README.md).
