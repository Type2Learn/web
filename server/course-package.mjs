import { createHash } from 'node:crypto';

// Minimal, dependency-free ZIP writer for immutable course exports. Entries are
// deliberately stored without compression so the package is deterministic and
// can be inspected with standard ZIP tools without a deployment dependency.
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xEDB88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let value = 0xFFFFFFFF;
  for (const byte of buffer) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xFF];
  return (value ^ 0xFFFFFFFF) >>> 0;
};

const uint16 = (value) => {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value & 0xFFFF, 0);
  return buffer;
};
const uint32 = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
};

export const createCoursePackage = (entries) => {
  const local = [];
  const central = [];
  const seenNames = new Set();
  let offset = 0;
  const checksums = {};
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const name = Buffer.from(String(entry?.name || '').replace(/\\/g, '/'));
    const content = Buffer.isBuffer(entry?.content) ? entry.content : Buffer.from(String(entry?.content || ''), 'utf8');
    const entryName = name.toString('utf8');
    if (!name.length || name.length > 240 || !content.length || entryName.startsWith('/') || entryName.includes('../') || seenNames.has(entryName)) {
      throw new Error('Every course package entry needs a unique, short, safe name and content.');
    }
    seenNames.add(entryName);
    const checksum = crc32(content);
    checksums[entryName] = createHash('sha256').update(content).digest('hex');
    const localHeader = Buffer.concat([uint32(0x04034B50), uint16(20), uint16(0x0800), uint16(0), uint16(0), uint16(0), uint32(checksum), uint32(content.length), uint32(content.length), uint16(name.length), uint16(0), name]);
    local.push(localHeader, content);
    const centralHeader = Buffer.concat([uint32(0x02014B50), uint16(20), uint16(20), uint16(0x0800), uint16(0), uint16(0), uint16(0), uint32(checksum), uint32(content.length), uint32(content.length), uint16(name.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), name]);
    central.push(centralHeader);
    offset += localHeader.length + content.length;
  });
  const centralLength = central.reduce((total, item) => total + item.length, 0);
  const entryCount = central.length;
  const end = Buffer.concat([uint32(0x06054B50), uint16(0), uint16(0), uint16(entryCount), uint16(entryCount), uint32(centralLength), uint32(offset), uint16(0)]);
  const archive = Buffer.concat([...local, ...central, end]);
  return { archive, sha256: createHash('sha256').update(archive).digest('hex'), checksums };
};
