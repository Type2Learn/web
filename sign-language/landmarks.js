/**
 * Type2Learn on-device sign-language input contract.
 *
 * This module deliberately does not classify a sign. It converts MediaPipe
 * hand results into a stable, versioned temporal feature format that a
 * separately evaluated Pakistan Sign Language (PSL) model can consume.
 *
 * Landmark normalisation is adapted from the MIT-licensed landmark approach
 * in kmist70/asl-translator. Type2Learn fixes its detector-order ambiguity by
 * placing left/right hands in deterministic slots before flattening.
 * See sign-language/THIRD_PARTY_NOTICES.md.
 */

export const PSL_LANDMARK_CONTRACT = Object.freeze({
  version: 't2l-psl-landmarks-v1',
  language: 'psl',
  hands: 2,
  landmarksPerHand: 21,
  coordinatesPerLandmark: 3,
  featureDimension: 126,
  sequenceLength: 30,
  coordinateOrder: Object.freeze(['x', 'y', 'z']),
  handOrder: Object.freeze(['left', 'right'])
});

const FEATURES_PER_HAND = PSL_LANDMARK_CONTRACT.landmarksPerHand * PSL_LANDMARK_CONTRACT.coordinatesPerLandmark;
const EPSILON = 1e-7;

const asFiniteNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

const emptyHand = () => new Float32Array(FEATURES_PER_HAND);

export const isHandLandmarkSet = (landmarks) => Array.isArray(landmarks)
  && landmarks.length === PSL_LANDMARK_CONTRACT.landmarksPerHand
  && landmarks.every((point) => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)) && Number.isFinite(Number(point.z)));

/**
 * Centre the wrist and divide by wrist-to-middle-MCP distance. The returned
 * vector never contains NaN/Infinity; unusable input becomes a zero vector.
 */
export const normaliseHandLandmarks = (landmarks) => {
  if (!isHandLandmarkSet(landmarks)) return emptyHand();

  const wrist = landmarks[0];
  const centred = landmarks.map((point) => ({
    x: asFiniteNumber(point.x) - asFiniteNumber(wrist.x),
    y: asFiniteNumber(point.y) - asFiniteNumber(wrist.y),
    z: asFiniteNumber(point.z) - asFiniteNumber(wrist.z)
  }));
  const scalePoint = centred[9];
  const scale = Math.hypot(scalePoint.x, scalePoint.y, scalePoint.z);
  if (!Number.isFinite(scale) || scale < EPSILON) return emptyHand();

  const vector = new Float32Array(FEATURES_PER_HAND);
  centred.forEach((point, index) => {
    const offset = index * PSL_LANDMARK_CONTRACT.coordinatesPerLandmark;
    vector[offset] = point.x / scale;
    vector[offset + 1] = point.y / scale;
    vector[offset + 2] = point.z / scale;
  });
  return vector;
};

const handednessAt = (handedness, index) => String(
  handedness?.[index]?.[0]?.categoryName
    || handedness?.[index]?.[0]?.displayName
    || handedness?.[index]?.categoryName
    || handedness?.[index]?.displayName
    || ''
).trim().toLowerCase();

const slotForHandedness = (value) => {
  if (value === 'left') return 0;
  if (value === 'right') return 1;
  return -1;
};

/**
 * Aligns MediaPipe detection output to fixed left/right slots. Unknown labels
 * fill the first empty slot in detector order, retaining valid data while
 * exposing the `hadUnknownHandedness` safety bit to callers.
 */
export const toAlignedTwoHandFrame = ({ landmarks = [], handedness = [] } = {}) => {
  const slots = [null, null];
  let hadUnknownHandedness = false;

  landmarks.slice(0, PSL_LANDMARK_CONTRACT.hands).forEach((hand, index) => {
    let slot = slotForHandedness(handednessAt(handedness, index));
    if (slot < 0 || slots[slot]) {
      hadUnknownHandedness = true;
      slot = slots[0] ? 1 : 0;
    }
    if (!slots[slot]) slots[slot] = hand;
  });

  const left = normaliseHandLandmarks(slots[0]);
  const right = normaliseHandLandmarks(slots[1]);
  const features = new Float32Array(PSL_LANDMARK_CONTRACT.featureDimension);
  features.set(left, 0);
  features.set(right, FEATURES_PER_HAND);
  return Object.freeze({
    contractVersion: PSL_LANDMARK_CONTRACT.version,
    features,
    detectedHands: slots.filter(Boolean).length,
    hadUnknownHandedness
  });
};

export class TemporalLandmarkWindow {
  constructor({ sequenceLength = PSL_LANDMARK_CONTRACT.sequenceLength, featureDimension = PSL_LANDMARK_CONTRACT.featureDimension } = {}) {
    if (!Number.isInteger(sequenceLength) || sequenceLength < 2 || sequenceLength > 180) throw new TypeError('sequenceLength must be an integer between 2 and 180.');
    if (featureDimension !== PSL_LANDMARK_CONTRACT.featureDimension) throw new TypeError('Unsupported landmark feature dimension.');
    this.sequenceLength = sequenceLength;
    this.featureDimension = featureDimension;
    this.frames = [];
  }

  push(frame) {
    const source = frame?.features || frame;
    if (!(source instanceof Float32Array) || source.length !== this.featureDimension) throw new TypeError('Frame does not match the PSL landmark contract.');
    const copy = new Float32Array(source);
    this.frames.push(copy);
    if (this.frames.length > this.sequenceLength) this.frames.shift();
    return this.frames.length;
  }

  clear() { this.frames.length = 0; }

  get ready() { return this.frames.length === this.sequenceLength; }

  /** Pad the first known frame on the left so temporal models always receive a fixed tensor. */
  toTensor() {
    const tensor = new Float32Array(this.sequenceLength * this.featureDimension);
    if (!this.frames.length) return tensor;
    const first = this.frames[0];
    for (let index = 0; index < this.sequenceLength; index += 1) {
      const source = this.frames[Math.max(0, index - (this.sequenceLength - this.frames.length))] || first;
      tensor.set(source, index * this.featureDimension);
    }
    return tensor;
  }
}

/** Validate a future model manifest before any local inference is permitted. */
export const validatePslModelManifest = (manifest) => {
  const value = manifest && typeof manifest === 'object' ? manifest : null;
  const errors = [];
  if (!value) errors.push('Manifest must be an object.');
  if (value?.contractVersion !== PSL_LANDMARK_CONTRACT.version) errors.push('Landmark contract version does not match.');
  if (value?.language !== 'psl') errors.push('Only a PSL model is accepted.');
  if (value?.sequenceLength !== PSL_LANDMARK_CONTRACT.sequenceLength) errors.push('Sequence length does not match the contract.');
  if (value?.featureDimension !== PSL_LANDMARK_CONTRACT.featureDimension) errors.push('Feature dimension does not match the contract.');
  if (!Array.isArray(value?.labels) || value.labels.length < 2 || value.labels.some((label) => typeof label !== 'string' || !label.trim()) || new Set(value?.labels || []).size !== value?.labels?.length) errors.push('Labels must be unique, non-empty strings.');
  if (typeof value?.modelUrl !== 'string' || !value.modelUrl.startsWith('/assets/models/psl/')) errors.push('Model must be a local PSL asset.');
  if (typeof value?.evaluation?.dataset !== 'string' || !value.evaluation.dataset.trim()) errors.push('Evaluation dataset must be named.');
  if (!Number.isFinite(value?.evaluation?.top1Accuracy) || value.evaluation.top1Accuracy < 0 || value.evaluation.top1Accuracy > 1) errors.push('Evaluation top-1 accuracy must be a value from 0 to 1.');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
};
