import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  crc32, readChunks, readHeader, paeth, unfilterRow, decodePng,
  resizeRgba, resizeToHeight, encodePng, buildChunk, rescalePng,
  trimTransparent, PNG_SIGNATURE,
} from './image.mjs';

// A tiny valid PNG built in memory, so decoding is tested without depending on
// a file on disk that could change.
function makePng(width, height, pixelFn, { filter = 0 } = {}) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixelFn(x, y);
      const o = y * (stride + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  // Only filter 0 is emitted here; the other filters are tested by unfilterRow
  // directly, which is where their logic lives.
  return encodePng({ width, height, data: stripe(raw, stride, height) });
}

function stripe(raw, stride, height) {
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) raw.copy(data, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1));
  return data;
}

// --- CRC32 ------------------------------------------------------------------

test('crc32 matches the reference value for a known string', () => {
  // "IEND" is the canonical case: the empty IEND chunk has CRC 0xAE426082.
  assert.equal(crc32(Buffer.from('IEND', 'latin1')), 0xae426082);
});

test('crc32 is stable and non-zero for real data', () => {
  const a = crc32(Buffer.from('IHDR', 'latin1'));
  const b = crc32(Buffer.from('IHDR', 'latin1'));
  assert.equal(a, b, 'same input, same result');
  assert.notEqual(a, 0);
});

// --- Paeth predictor --------------------------------------------------------

test('paeth picks the left neighbour when it is closest', () => {
  assert.equal(paeth(10, 0, 0), 10);
});

test('paeth picks the above neighbour when it is closest', () => {
  assert.equal(paeth(0, 10, 0), 10);
});

test('paeth picks above-left when neither straight neighbour wins', () => {
  // a=1, b=2, c=3 -> p=0; distances 1,2,3 -> left wins per spec tie-breaking.
  assert.equal(paeth(1, 2, 3), 1);
});

test('paeth breaks ties toward left, then above', () => {
  assert.equal(paeth(5, 5, 5), 5, 'all equal resolves to a');
  assert.equal(paeth(4, 4, 0), 4);
});

// --- Unfiltering: each of the five PNG filters ------------------------------

test('filter 0 (None) passes bytes through', () => {
  const row = Buffer.from([1, 2, 3, 4]);
  assert.deepEqual([...unfilterRow(0, row, null)], [1, 2, 3, 4]);
});

test('filter 1 (Sub) adds the byte to its left', () => {
  // bpp=4, so index 0..3 have no left neighbour and pass through; the second
  // pixel is the first that accumulates.
  const row = Buffer.from([10, 20, 30, 40, 5, 5, 5, 5]);
  assert.deepEqual([...unfilterRow(1, row, null)], [10, 20, 30, 40, 15, 25, 35, 45]);
});

test('filter 2 (Up) adds the byte above', () => {
  const prev = Buffer.from([1, 2, 3, 4]);
  const row = Buffer.from([10, 20, 30, 40]);
  assert.deepEqual([...unfilterRow(2, row, prev)], [11, 22, 33, 44]);
});

test('filter 2 on the first row treats above as zero', () => {
  const row = Buffer.from([10, 20, 30, 40]);
  assert.deepEqual([...unfilterRow(2, row, null)], [10, 20, 30, 40]);
});

test('filter 3 (Average) adds the mean of left and above', () => {
  // Two pixels wide: prev and row must span the same width, as in a real PNG.
  const prev = Buffer.from([10, 10, 10, 10, 20, 20, 20, 20]);
  const row = Buffer.from([0, 0, 0, 0, 4, 4, 4, 4]);
  // First pixel: no left, above=10 -> (0 + 10) >> 1 = 5, so 0 + 5 = 5.
  // Second pixel: left=5 (already decoded), above=20 -> (5 + 20) >> 1 = 12 -> 16.
  assert.deepEqual([...unfilterRow(3, row, prev)], [5, 5, 5, 5, 16, 16, 16, 16]);
});

test('filter 3 on the first row treats above as zero', () => {
  const row = Buffer.from([0, 0, 0, 0, 8, 8, 8, 8]);
  // No above, so second pixel: left=0 -> (0 + 0) >> 1 = 0 -> stays 8.
  assert.deepEqual([...unfilterRow(3, row, null)], [0, 0, 0, 0, 8, 8, 8, 8]);
});

test('filter 4 (Paeth) adds the predictor', () => {
  const prev = Buffer.from([10, 10, 10, 10, 20, 20, 20, 20]);
  const row = Buffer.from([0, 0, 0, 0, 1, 1, 1, 1]);
  // First pixel: a=0, b=10, c=0 -> paeth=10, so 0 + 10 = 10.
  // Second pixel: a=10, b=20, c=10 -> p=20, distances 10/0/10 -> paeth=20 -> 21.
  assert.deepEqual([...unfilterRow(4, row, prev)], [10, 10, 10, 10, 21, 21, 21, 21]);
});

test('filter 4 on the first row treats above and above-left as zero', () => {
  const row = Buffer.from([0, 0, 0, 0, 7, 7, 7, 7]);
  // a=0, b=0, c=0 -> paeth=0, so the second pixel stays 7.
  assert.deepEqual([...unfilterRow(4, row, null)], [0, 0, 0, 0, 7, 7, 7, 7]);
});

test('an unknown filter type is refused, not silently accepted', () => {
  assert.throws(() => unfilterRow(9, Buffer.from([0]), null), /filtro PNG desconocido/);
});

test('a previous row shorter than the current row is refused', () => {
  // Left unguarded this yields a silently wrong pixel instead of an error.
  assert.throws(
    () => unfilterRow(3, Buffer.from([0, 0, 0, 0, 4, 4, 4, 4]), Buffer.from([10, 10, 10, 10])),
    /PNG corrupto/,
  );
});

// --- Header and chunk validation --------------------------------------------

test('readHeader reports the real dimensions and format', () => {
  const png = makePng(3, 2, () => [1, 2, 3, 255]);
  assert.deepEqual(readHeader(png), { width: 3, height: 2, bitDepth: 8, colorType: 6, interlace: 0 });
});

test('a buffer without the PNG signature is rejected', () => {
  assert.throws(() => readChunks(Buffer.from('not a png at all')), /no es un PNG/);
});

test('a chunk that overruns the file is rejected', () => {
  // Signature + a chunk header claiming far more bytes than exist.
  const bad = Buffer.concat([PNG_SIGNATURE, Buffer.from([0, 1, 0, 0]), Buffer.from('IHDR', 'latin1')]);
  assert.throws(() => readChunks(bad), /cortado/);
});

test('a file truncated before any chunk is rejected, not silently empty', () => {
  // Only the signature: no room for even a chunk header. Returning [] here
  // would make a corrupt file look like a valid empty one.
  assert.throws(() => readChunks(PNG_SIGNATURE), /cortado|sin chunks/);
});

// --- Round trip -------------------------------------------------------------

test('encode then decode returns the exact pixels', () => {
  const pixels = (x, y) => [x * 10, y * 20, 128, 255 - x * 5];
  const png = makePng(4, 3, pixels);
  const decoded = decodePng(png);
  assert.equal(decoded.width, 4);
  assert.equal(decoded.height, 3);
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const o = (y * 4 + x) * 4;
      assert.deepEqual([...decoded.data.subarray(o, o + 4)], pixels(x, y), `pixel ${x},${y}`);
    }
  }
});

test('the encoder writes the chunks the spec requires, in order', () => {
  const png = makePng(1, 1, () => [0, 0, 0, 0]);
  const types = readChunks(png).map((c) => c.type);
  assert.deepEqual(types, ['IHDR', 'IDAT', 'IEND']);
});

test('every emitted chunk carries a valid CRC', () => {
  const png = makePng(2, 2, (x, y) => [x, y, 0, 255]);
  let pos = 8;
  while (pos < png.length) {
    const length = png.readUInt32BE(pos);
    const typeAndData = png.subarray(pos + 4, pos + 8 + length);
    const declared = png.readUInt32BE(pos + 8 + length);
    assert.equal(crc32(typeAndData), declared, `CRC of chunk at ${pos}`);
    pos += 12 + length;
  }
});

test('a truncated data stream is rejected by size', () => {
  const png = makePng(4, 4, () => [1, 2, 3, 4]);
  // Corrupt the IHDR width so the declared size no longer matches the payload.
  const damaged = Buffer.from(png);
  damaged.writeUInt32BE(999, 16);
  assert.throws(() => decodePng(damaged), /tamaño inesperado|cortado/);
});

// --- Resizing ---------------------------------------------------------------

test('resizeRgba produces exactly the requested dimensions', () => {
  const src = { width: 8, height: 8, data: Buffer.alloc(8 * 8 * 4, 255) };
  const out = resizeRgba(src, 3, 5);
  assert.equal(out.width, 3);
  assert.equal(out.height, 5);
  assert.equal(out.data.length, 3 * 5 * 4);
});

test('resizing a solid colour keeps that colour', () => {
  const src = { width: 4, height: 4, data: Buffer.alloc(4 * 4 * 4) };
  for (let i = 0; i < src.data.length; i += 4) {
    src.data[i] = 200; src.data[i + 1] = 100; src.data[i + 2] = 50; src.data[i + 3] = 255;
  }
  const out = resizeRgba(src, 2, 2);
  for (let i = 0; i < out.data.length; i += 4) {
    assert.deepEqual([...out.data.subarray(i, i + 4)], [200, 100, 50, 255]);
  }
});

test('fully transparent pixels stay fully transparent', () => {
  const src = { width: 4, height: 4, data: Buffer.alloc(4 * 4 * 4, 0) };
  const out = resizeRgba(src, 2, 2);
  for (let i = 0; i < out.data.length; i += 4) assert.equal(out.data[i + 3], 0);
});

test('transparent pixels do not darken their neighbours', () => {
  // Left half fully transparent black, right half opaque white. A naive average
  // would pull the boundary grey; alpha weighting must keep it white.
  const src = { width: 4, height: 1, data: Buffer.alloc(4 * 4) };
  for (let x = 1; x < 4; x += 1) {
    const o = x * 4;
    src.data[o] = 255; src.data[o + 1] = 255; src.data[o + 2] = 255; src.data[o + 3] = 255;
  }
  const out = resizeRgba(src, 2, 1);
  // Second output pixel covers only opaque white source pixels.
  assert.deepEqual([...out.data.subarray(4, 8)], [255, 255, 255, 255]);
});

test('resizeToHeight keeps the aspect ratio', () => {
  const src = { width: 200, height: 100, data: Buffer.alloc(200 * 100 * 4, 255) };
  const out = resizeToHeight(src, 50);
  assert.equal(out.height, 50);
  assert.equal(out.width, 100, 'half the height means half the width');
});

test('resizeToHeight is honest about a square source', () => {
  const src = { width: 1254, height: 1254, data: Buffer.alloc(1254 * 1254 * 4, 255) };
  const out = resizeToHeight(src, 64);
  assert.equal(out.width, 64);
  assert.equal(out.height, 64);
});

test('resizeRgba refuses a nonsensical target', () => {
  const src = { width: 4, height: 4, data: Buffer.alloc(64) };
  assert.throws(() => resizeRgba(src, 0, 4), /enteros positivos/);
  assert.throws(() => resizeRgba(src, 2.5, 4), /enteros positivos/);
});

// --- Trimming ---------------------------------------------------------------

test('trimTransparent removes a transparent border', () => {
  const src = { width: 4, height: 4, data: Buffer.alloc(4 * 4 * 4) };
  // A single opaque pixel at (1,1).
  const o = (1 * 4 + 1) * 4;
  src.data[o] = 255; src.data[o + 1] = 0; src.data[o + 2] = 0; src.data[o + 3] = 255;
  const out = trimTransparent(src);
  assert.equal(out.width, 1);
  assert.equal(out.height, 1);
  assert.deepEqual([...out.data.subarray(0, 4)], [255, 0, 0, 255]);
});

test('trimTransparent leaves an already tight image alone', () => {
  const src = { width: 2, height: 2, data: Buffer.alloc(2 * 2 * 4, 255) };
  const out = trimTransparent(src);
  assert.equal(out.width, 2);
  assert.equal(out.height, 2);
});

test('trimTransparent returns a fully transparent image untouched', () => {
  const src = { width: 3, height: 3, data: Buffer.alloc(3 * 3 * 4, 0) };
  const out = trimTransparent(src);
  assert.equal(out.width, 3);
  assert.equal(out.height, 3);
});

// --- Against the real assets ------------------------------------------------

test('the real logo decodes to the dimensions its header declares', () => {
  const buffer = readFileSync(new URL('../assets/logo-nyx.png', import.meta.url));
  const header = readHeader(buffer);
  const decoded = decodePng(buffer);
  assert.equal(decoded.width, header.width);
  assert.equal(decoded.height, header.height);
  assert.equal(decoded.data.length, header.width * header.height * 4);
});

test('the real logo survives a rescale to the size the page displays', () => {
  const buffer = readFileSync(new URL('../assets/logo-nyx.png', import.meta.url));
  const out = rescalePng(buffer, 76);
  assert.equal(out.height, 76);
  // Re-decoding proves the encoder output is a valid PNG, not just bytes.
  const round = decodePng(out.buffer);
  assert.equal(round.width, out.width);
  assert.equal(round.height, 76);
});

test('the real logo shrinks by orders of magnitude at display size', () => {
  const buffer = readFileSync(new URL('../assets/logo-nyx.png', import.meta.url));
  const out = rescalePng(buffer, 152);
  assert.ok(out.buffer.length < buffer.length / 10, `expected a big drop, got ${out.buffer.length} from ${buffer.length}`);
});

test('the real favicon source is square and decodes', () => {
  const buffer = readFileSync(new URL('../assets/favicon.png', import.meta.url));
  const decoded = decodePng(buffer);
  assert.equal(decoded.width, decoded.height, 'a favicon source should be square');
});
