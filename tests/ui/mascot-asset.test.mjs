import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const mascotAsset = fileURLToPath(new URL('../../assets/2D%20Mascot/blinking.webp', import.meta.url));

const riffChunks = (buffer) => {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF', 'mascot must be a RIFF WebP');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP', 'mascot must be a WebP');
  const chunks = [];
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    assert.ok(dataOffset + size <= buffer.length, `${type} chunk exceeds the asset length`);
    chunks.push({ type, size, dataOffset });
    offset = dataOffset + size + (size % 2);
  }
  return chunks;
};

test('blinking mascot is a multi-frame WebP configured to loop forever', async () => {
  const buffer = await readFile(mascotAsset);
  const chunks = riffChunks(buffer);
  const animation = chunks.find((chunk) => chunk.type === 'ANIM');
  const frames = chunks.filter((chunk) => chunk.type === 'ANMF');
  assert.ok(animation, 'blinking mascot is missing its WebP animation header');
  assert.ok(frames.length > 1, 'blinking mascot must contain more than one frame');
  // In animated WebP, a loop count of zero means repeat indefinitely.
  assert.equal(buffer.readUInt16LE(animation.dataOffset + 4), 0, 'blinking mascot must loop indefinitely');
  const durations = frames.map((frame) => (
    buffer[frame.dataOffset + 12]
      | (buffer[frame.dataOffset + 13] << 8)
      | (buffer[frame.dataOffset + 14] << 16)
  ));
  assert.ok(durations.every((duration) => duration > 0), 'every blinking mascot frame needs a duration');
});
