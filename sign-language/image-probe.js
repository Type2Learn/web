/**
 * Browser-only diagnostic path for a local image or camera frame.
 *
 * No image bytes are uploaded. This module intentionally stops after landmark
 * extraction. A real PSL translation requires a separately evaluated temporal
 * PSL model manifest accepted by validatePslModelManifest().
 */
import { PSL_LANDMARK_CONTRACT, toAlignedTwoHandFrame } from './landmarks.js';

export const MEDIAPIPE_TASKS_VERSION = '0.10.22-rc.20250304';
export const MEDIAPIPE_VISION_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_TASKS_VERSION}`;
export const HAND_LANDMARKER_MODEL_URL = '/assets/models/mediapipe/hand_landmarker.task';

const loadVisionTasks = async () => import(MEDIAPIPE_VISION_CDN);

export const createLocalHandImageProbe = async ({ modelUrl = HAND_LANDMARKER_MODEL_URL, maxHands = 2 } = {}) => {
  const { FilesetResolver, HandLandmarker } = await loadVisionTasks();
  const vision = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_VISION_CDN}/wasm`);
  const landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: modelUrl },
    runningMode: 'IMAGE',
    numHands: Math.max(1, Math.min(2, Number(maxHands) || 2)),
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5
  });

  let closed = false;
  return Object.freeze({
    async probe(image) {
      if (closed) throw new Error('The local hand image probe is closed.');
      if (!image) throw new TypeError('An image, canvas, or ImageBitmap is required.');
      const result = landmarker.detect(image);
      const frame = toAlignedTwoHandFrame(result);
      return Object.freeze({
        origin: 'on-device',
        recognisedSign: null,
        translationAvailable: false,
        contractVersion: PSL_LANDMARK_CONTRACT.version,
        detectedHands: frame.detectedHands,
        hadUnknownHandedness: frame.hadUnknownHandedness,
        featureDimension: frame.features.length,
        features: frame.features
      });
    },
    close() {
      if (closed) return;
      closed = true;
      landmarker.close();
    }
  });
};
