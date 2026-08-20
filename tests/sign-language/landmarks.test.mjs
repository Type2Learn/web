import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PSL_LANDMARK_CONTRACT,
  TemporalLandmarkWindow,
  isHandLandmarkSet,
  normaliseHandLandmarks,
  toAlignedTwoHandFrame,
  validatePslModelManifest
} from '../../sign-language/landmarks.js';

const hand = (offset = 0) => Array.from({ length: 21 }, (_, index) => ({
  x: offset + index / 100,
  y: offset + index / 200,
  z: -index / 300
}));

const validManifest = () => ({
  contractVersion: PSL_LANDMARK_CONTRACT.version,
  language: 'psl',
  sequenceLength: 30,
  featureDimension: 126,
  labels: ['greeting', 'thank-you'],
  modelUrl: '/assets/models/psl/example.onnx',
  evaluation: { dataset: 'reviewed-psl-set', top1Accuracy: 0.82 }
});

test('PSL landmark contract is explicit and fixed-width', () => {
  assert.equal(PSL_LANDMARK_CONTRACT.language, 'psl');
  assert.equal(PSL_LANDMARK_CONTRACT.featureDimension, 126);
  assert.equal(PSL_LANDMARK_CONTRACT.sequenceLength, 30);
  assert.deepEqual(PSL_LANDMARK_CONTRACT.handOrder, ['left', 'right']);
});

test('recognises a structurally valid 21-landmark hand', () => assert.equal(isHandLandmarkSet(hand()), true));
test('rejects a hand with too few points', () => assert.equal(isHandLandmarkSet(hand().slice(0, 20)), false));
test('rejects non-finite hand coordinates', () => assert.equal(isHandLandmarkSet([{ x: NaN, y: 0, z: 0 }, ...hand().slice(1)]), false));

test('normalisation always emits 63 finite values', () => {
  const features = normaliseHandLandmarks(hand());
  assert.equal(features.length, 63);
  assert.equal(features.every(Number.isFinite), true);
});

test('normalisation centres the wrist at the origin', () => {
  const features = normaliseHandLandmarks(hand(5));
  assert.deepEqual([...features.slice(0, 3)], [0, 0, 0]);
});

test('normalisation is translation invariant', () => {
  assert.deepEqual([...normaliseHandLandmarks(hand())], [...normaliseHandLandmarks(hand(9))]);
});

test('invalid landmarks fail safely to a zero hand vector', () => {
  assert.deepEqual([...normaliseHandLandmarks(null)], Array(63).fill(0));
});

test('degenerate scale fails safely to zeros', () => {
  const same = Array.from({ length: 21 }, () => ({ x: 1, y: 1, z: 1 }));
  assert.deepEqual([...normaliseHandLandmarks(same)], Array(63).fill(0));
});

test('aligns detector output into deterministic left/right slots', () => {
  const left = hand(1);
  const right = hand(2);
  const direct = toAlignedTwoHandFrame({ landmarks: [left, right], handedness: [[{ categoryName: 'Left' }], [{ categoryName: 'Right' }]] });
  const reversed = toAlignedTwoHandFrame({ landmarks: [right, left], handedness: [[{ categoryName: 'Right' }], [{ categoryName: 'Left' }]] });
  assert.deepEqual([...direct.features], [...reversed.features]);
  assert.equal(direct.detectedHands, 2);
});

test('keeps a known left hand in the first slot and blanks the missing right slot', () => {
  const frame = toAlignedTwoHandFrame({ landmarks: [hand(1)], handedness: [[{ categoryName: 'Left' }]] });
  assert.equal(frame.detectedHands, 1);
  assert.notDeepEqual([...frame.features.slice(0, 63)], Array(63).fill(0));
  assert.deepEqual([...frame.features.slice(63)], Array(63).fill(0));
});

test('unknown handedness is visible to callers but retains the sample', () => {
  const frame = toAlignedTwoHandFrame({ landmarks: [hand(1)], handedness: [[{ categoryName: 'Unknown' }]] });
  assert.equal(frame.hadUnknownHandedness, true);
  assert.equal(frame.detectedHands, 1);
});

test('temporal window pads a partial sequence without changing frame width', () => {
  const window = new TemporalLandmarkWindow();
  const frame = toAlignedTwoHandFrame({ landmarks: [hand()], handedness: [[{ categoryName: 'Left' }]] });
  window.push(frame);
  const tensor = window.toTensor();
  assert.equal(tensor.length, 30 * 126);
  assert.deepEqual([...tensor.slice(0, 126)], [...frame.features]);
  assert.deepEqual([...tensor.slice(-126)], [...frame.features]);
});

test('temporal window is ready only after the configured sequence', () => {
  const window = new TemporalLandmarkWindow({ sequenceLength: 2 });
  const frame = new Float32Array(126);
  window.push(frame);
  assert.equal(window.ready, false);
  window.push(frame);
  assert.equal(window.ready, true);
});

test('temporal window retains only its configured recent frames', () => {
  const window = new TemporalLandmarkWindow({ sequenceLength: 2 });
  [1, 2, 3].forEach((value) => window.push(new Float32Array(126).fill(value)));
  assert.equal(window.frames.length, 2);
  assert.equal(window.frames[0][0], 2);
  assert.equal(window.frames[1][0], 3);
});

test('temporal window rejects an incompatible frame', () => {
  const window = new TemporalLandmarkWindow();
  assert.throws(() => window.push(new Float32Array(125)), /contract/);
});

test('a valid local PSL model manifest passes the acceptance gate', () => {
  assert.deepEqual(validatePslModelManifest(validManifest()), { valid: true, errors: [] });
});

test('an ASL-labelled manifest is rejected instead of being treated as PSL', () => {
  const manifest = validManifest();
  manifest.language = 'asl';
  assert.equal(validatePslModelManifest(manifest).valid, false);
});

test('a remote model is rejected to preserve the local-model privacy boundary', () => {
  const manifest = validManifest();
  manifest.modelUrl = 'https://example.test/model.onnx';
  assert.equal(validatePslModelManifest(manifest).valid, false);
});

test('duplicate or missing labels are rejected', () => {
  const manifest = validManifest();
  manifest.labels = ['same', 'same'];
  assert.equal(validatePslModelManifest(manifest).valid, false);
});

test('an unmeasured model is rejected', () => {
  const manifest = validManifest();
  delete manifest.evaluation.top1Accuracy;
  assert.equal(validatePslModelManifest(manifest).valid, false);
});
