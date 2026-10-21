// Minimal PNG decode / rescale / encode, using only the Node standard library.
//
// The project runs on the Node standard library and nothing else, and no image
// tooling is installed on this machine. Rather than add a dependency or shell
// out to a program that may not exist, this reads the PNG format directly:
// inflate the pixel data, undo the per-row filters, box-filter down to the
// target size, and deflate it back.
//
// Only what these assets actually are is supported: 8-bit RGBA, non-interlaced.
// Anything else is refused by name instead of being decoded wrongly.

import { inflateSync, deflateSync } from 'node:zlib';

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// One byte per pixel channel for the only color type handled here.
const RGBA_CHANNELS = 4;
const BYTES_PER_PIXEL = RGBA_CHANNELS;

// --- CRC32, required by the PNG spec for every chunk ------------------------

// The PNG CRC is the standard CRC-32 (IEEE 802.3), built here rather than
// pulled in, because it is 10 lines and the spec is unambiguous.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

export function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// --- Decoding ---------------------------------------------------------------

// Walks the chunk stream and returns [{ type, data }] in order.
export function readChunks(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('no es un PNG: falta la firma de 8 bytes');
  }
  const chunks = [];
  let pos = 8;
  while (pos < buffer.length) {
    // There must be room for the length and the type before anything is read;
    // otherwise the file is truncated even though no chunk declares a bad size.
    if (pos + 8 > buffer.length) {
      throw new Error(`PNG cortado: quedan ${buffer.length - pos} bytes donde se esperaba un chunk`);
    }
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('latin1', pos + 4, pos + 8);
    // A bad length would run off the end and produce garbage silently.
    if (pos + 12 + length > buffer.length) {
      throw new Error(`chunk ${type} cortado: declara ${length} bytes y no alcanzan`);
    }
    chunks.push({ type, data: buffer.subarray(pos + 8, pos + 8 + length) });
    pos += 12 + length;
    if (type === 'IEND') break;
  }
  if (!chunks.length) throw new Error('PNG sin chunks');
  return chunks;
}

export function readHeader(buffer) {
  const ihdr = readChunks(buffer).find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('PNG sin IHDR');
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data.readUInt8(8);
  const colorType = ihdr.data.readUInt8(9);
  const interlace = ihdr.data.readUInt8(12);
  if (bitDepth !== 8) throw new Error(`profundidad ${bitDepth} no soportada: solo 8 bits por canal`);
  if (colorType !== 6) throw new Error(`tipo de color ${colorType} no soportado: solo RGBA (6)`);
  if (interlace !== 0) throw new Error('PNG entrelazado no soportado');
  return { width, height, bitDepth, colorType, interlace };
}

// Reverses one scanline filter. `prev` is the already-reconstructed row above.
// Getting any of these wrong corrupts the image without throwing, so each is
// written literally against the spec and covered by tests.
export function unfilterRow(filterType, row, prev, bpp = BYTES_PER_PIXEL) {
  // A shorter `prev` would make the neighbour lookup undefined, and undefined
  // arithmetic produces a wrong pixel without throwing. Real PNGs never do
  // this, so treat it as a corrupt file rather than guess.
  if (prev && prev.length < row.length) {
    throw new Error(`fila anterior de ${prev.length} bytes para una fila de ${row.length}: PNG corrupto`);
  }
  const out = Buffer.allocUnsafe(row.length);
  for (let i = 0; i < row.length; i += 1) {
    const x = row[i];
    const a = i >= bpp ? out[i - bpp] : 0;          // left
    const b = prev ? prev[i] : 0;                    // above
    const c = prev && i >= bpp ? prev[i - bpp] : 0;  // above-left
    switch (filterType) {
      case 0: out[i] = x; break;
      case 1: out[i] = (x + a) & 0xff; break;
      case 2: out[i] = (x + b) & 0xff; break;
      case 3: out[i] = (x + ((a + b) >> 1)) & 0xff; break;
      case 4: out[i] = (x + paeth(a, b, c)) & 0xff; break;
      default: throw new Error(`filtro PNG desconocido: ${filterType}`);
    }
  }
  return out;
}

// The Paeth predictor: pick whichever neighbour the gradient is closest to.
export function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Decodes to { width, height, data } where data is raw RGBA, row-major.
export function decodePng(buffer) {
  const { width, height } = readHeader(buffer);
  const idat = readChunks(buffer).filter((c) => c.type === 'IDAT').map((c) => c.data);
  if (!idat.length) throw new Error('PNG sin datos IDAT');
  const raw = inflateSync(Buffer.concat(idat));

  const stride = width * BYTES_PER_PIXEL;
  const expected = height * (stride + 1);
  // One filter byte per row is part of the expected size; a mismatch means the
  // stream is not what the header claims.
  if (raw.length !== expected) {
    throw new Error(`datos con tamaño inesperado: ${raw.length} bytes, se esperaban ${expected}`);
  }

  const data = Buffer.allocUnsafe(stride * height);
  let prev = null;
  for (let y = 0; y < height; y += 1) {
    const filterType = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const decoded = unfilterRow(filterType, row, prev);
    decoded.copy(data, y * stride);
    prev = decoded;
  }
  return { width, height, data };
}

// --- Rescaling --------------------------------------------------------------

// Box filter. Each target pixel averages every source pixel that falls inside
// it, alpha included, so reducing a mostly transparent image does not bleed the
// transparent black edges into the visible shape.
export function resizeRgba({ width, height, data }, targetWidth, targetHeight) {
  if (!Number.isInteger(targetWidth) || !Number.isInteger(targetHeight) || targetWidth < 1 || targetHeight < 1) {
    throw new Error('el tamaño destino debe ser de enteros positivos');
  }
  const out = Buffer.allocUnsafe(targetWidth * targetHeight * BYTES_PER_PIXEL);
  const xRatio = width / targetWidth;
  const yRatio = height / targetHeight;

  for (let ty = 0; ty < targetHeight; ty += 1) {
    const y0 = Math.floor(ty * yRatio);
    const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil((ty + 1) * yRatio)));
    for (let tx = 0; tx < targetWidth; tx += 1) {
      const x0 = Math.floor(tx * xRatio);
      const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil((tx + 1) * xRatio)));
      let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * width + sx) * BYTES_PER_PIXEL;
          // Weight colour by alpha so transparent pixels contribute no colour.
          const alpha = data[i + 3];
          r += data[i] * alpha;
          g += data[i + 1] * alpha;
          b += data[i + 2] * alpha;
          a += alpha;
          n += 1;
        }
      }
      const o = (ty * targetWidth + tx) * BYTES_PER_PIXEL;
      if (a === 0) {
        out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0;
      } else {
        const alpha = Math.round(a / n);
        // A fully invisible pixel keeps no colour: leaving stray RGB behind can
        // show as a fringe if a renderer ignores alpha once, and it is free to
        // drop here.
        out[o] = alpha === 0 ? 0 : Math.round(r / a);
        out[o + 1] = alpha === 0 ? 0 : Math.round(g / a);
        out[o + 2] = alpha === 0 ? 0 : Math.round(b / a);
        out[o + 3] = alpha;
      }
    }
  }
  return { width: targetWidth, height: targetHeight, data: out };
}

// Proportional resize that never distorts: the height drives the scale, which
// is how the CSS uses the image (width: 76px; height: auto).
export function resizeToHeight(image, targetHeight) {
  const targetWidth = Math.max(1, Math.round((image.width / image.height) * targetHeight));
  return resizeRgba(image, targetWidth, targetHeight);
}

// --- Encoding ---------------------------------------------------------------

export function buildChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

// Writes an 8-bit RGBA PNG. Filter type 0 (None) is used on every row: it costs
// bytes that deflate removes anyway, and it keeps the encoder provably correct
// rather than clever.
export function encodePng({ width, height, data }) {
  const stride = width * BYTES_PER_PIXEL;
  if (data.length !== stride * height) throw new Error('los datos no coinciden con el tamaño declarado');
  const raw = Buffer.allocUnsafe(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);   // bit depth
  ihdr.writeUInt8(6, 9);   // color type RGBA
  ihdr.writeUInt8(0, 10);  // compression
  ihdr.writeUInt8(0, 11);  // filter method
  ihdr.writeUInt8(0, 12);  // interlace
  return Buffer.concat([
    PNG_SIGNATURE,
    buildChunk('IHDR', ihdr),
    buildChunk('IDAT', deflateSync(raw, { level: 9 })),
    buildChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Decode, resize and re-encode in one step.
export function rescalePng(buffer, targetHeight) {
  const decoded = decodePng(buffer);
  const resized = resizeToHeight(decoded, targetHeight);
  return { buffer: encodePng(resized), width: resized.width, height: resized.height };
}

// Trims fully transparent rows and columns. TCGCSV-supplied icon art often
// carries a wide transparent margin, which would otherwise shrink the visible
// mark at small sizes.
export function trimTransparent({ width, height, data }, threshold = 8) {
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * BYTES_PER_PIXEL + 3] > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  // A fully transparent image has nothing to keep, so return it untouched.
  if (maxX < 0) return { width, height, data };
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = Buffer.allocUnsafe(w * h * BYTES_PER_PIXEL);
  for (let y = 0; y < h; y += 1) {
    data.copy(
      out,
      y * w * BYTES_PER_PIXEL,
      ((minY + y) * width + minX) * BYTES_PER_PIXEL,
      ((minY + y) * width + minX + w) * BYTES_PER_PIXEL,
    );
  }
  return { width: w, height: h, data: out, cropped: { minX, minY, width: w, height: h } };
}
