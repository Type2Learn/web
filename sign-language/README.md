# On-device PSL input foundation

This is an internal Type2Learn foundation for a future Pakistan Sign Language
(PSL) learning interface. It is not exposed in the learner interface yet.

## What is ready

- Browser-local MediaPipe Hand Landmarker ingestion for images or future camera
  frames. The image is processed on-device and is never sent to Type2Learn.
- A stable `t2l-psl-landmarks-v1` contract: 30 frames × 126 values (two fixed
  left/right hand slots, 21 `x/y/z` landmarks per hand).
- Translation/scale-normalisation, temporal buffering, strict manifest
  validation, and a real browser image-ingestion test.
- A local model asset path, ready for a reviewed PSL temporal model.

## What is deliberately not claimed

This module does **not** translate signs yet. A single image can validate
landmark extraction, but sign language uses movement over time. We will only
enable recognition after a PSL temporal model has a documented permitted data
source, label map, held-out evaluation, accessibility review, and a valid local
model manifest. The ASL reference model is not shipped or used for PSL output.

## Privacy boundary

`image-probe.js` imports the browser vision task only after the diagnostic or a
future learner feature explicitly asks for it. It sends no images, camera
frames, landmarks, or translations to Type2Learn servers. Camera access must
remain opt-in and will be disabled on unsupported/small screens.

## Next integration gate

1. Obtain a community-reviewed and licensed PSL temporal landmark model.
2. Place it under `assets/models/psl/` with an evaluation-backed manifest.
3. Pass `validatePslModelManifest()` and motion/RTL/reduced-motion tests.
4. Add an explicit learner-controlled UI only after those gates pass.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for source lineage.
