// Regenerates the site images at the sizes the page actually displays.
//
// Both shipped images are far larger than any place they appear: the logo is
// 1312x1199 shown at 76px, and the favicon is 1254x1254 shown at 16-32px. The
// page was downloading about 4.5 MB to paint images that occupy under 1% of
// those pixels.
//
// Run with `npm run images`. It rewrites the files in place, so the originals
// are kept next to them as .source.png for a future rescale.

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { resizeRgba, resizeToHeight, trimTransparent, decodePng, encodePng } from './image.mjs';

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

// The logo is displayed at 76px; a 2x copy covers high-density screens without
// wasting bytes at 3x, where the difference is invisible at this size.
const LOGO_HEIGHT = 152;

// A favicon needs to survive 32px and, on some launchers, 64px.
const FAVICON_SIZE = 64;

function generate(sourcePath, outputPath, target, label) {
  const original = readFileSync(sourcePath);
  const beforeHeader = decodePng(original);
  let decoded = beforeHeader;
  // Trim any transparent border before scaling, so the visible mark fills the
  // frame instead of being shrunk by empty space around it.
  const trimmed = trimTransparent(decoded);
  if (trimmed.cropped) decoded = trimmed;

  const scaled = typeof target === 'number' && label === 'favicon'
    ? resizeSquare(decoded, target)
    : rescaleFromDecoded(decoded, target);

  const after = scaled;
  const growth = ((after.buffer.length - original.length) / original.length) * 100;
  console.log(`  ${label}`);
  console.log(`    origen    ${beforeHeader.width}x${beforeHeader.height}  ${kb(original.length)}`);
  if (trimmed.cropped) {
    console.log(`    recorte   ${trimmed.width}x${trimmed.height}  (quita el margen transparente)`);
  }
  console.log(`    destino   ${after.width}x${after.height}  ${kb(after.buffer.length)}  (${growth.toFixed(0)}%)`);
  writeFileSync(outputPath, after.buffer);
  return { before: original.length, after: after.buffer.length };
}

// Square resize for the favicon, which must not be letterboxed.
function resizeSquare(image, size) {
  const square = toSquare(image);
  return resizeRgba(square, size, size);
}

// Resize a decoded image to a target height, keeping the aspect ratio. Goes
// straight from pixels to pixels: re-encoding only to decode again would be
// wasted work and an extra chance to be wrong.
function rescaleFromDecoded(image, targetHeight) {
  const resized = resizeToHeight(image, targetHeight);
  return { buffer: encodePng(resized), width: resized.width, height: resized.height };
}

// Pads a non-square image onto a transparent square canvas, centred, so a
// favicon keeps its aspect ratio without distortion.
function toSquare({ width, height, data }) {
  const side = Math.max(width, height);
  if (width === side && height === side) return { width, height, data };
  const out = Buffer.alloc(side * side * 4);
  const dx = Math.floor((side - width) / 2);
  const dy = Math.floor((side - height) / 2);
  for (let y = 0; y < height; y += 1) {
    data.copy(out, ((y + dy) * side + dx) * 4, y * width * 4, (y + 1) * width * 4);
  }
  return { width: side, height: side, data: out };
}

function main() {
  console.log('Regenerando imagenes del sitio');
  console.log('');
  const results = [];

  // Keep a pristine copy the first time, so a later run can start from the
  // original instead of shrinking an already-shrunk file.
  const logoSource = existsSync('assets/logo-nyx.source.png') ? 'assets/logo-nyx.source.png' : 'assets/logo-nyx.png';
  if (logoSource === 'assets/logo-nyx.png') copyFileSync('assets/logo-nyx.png', 'assets/logo-nyx.source.png');
  results.push(generate(logoSource, 'assets/logo-nyx.png', LOGO_HEIGHT, 'logo (se muestra a 76px)'));

  const favSource = existsSync('assets/favicon.source.png') ? 'assets/favicon.source.png' : 'assets/favicon.png';
  if (favSource === 'assets/favicon.png') copyFileSync('assets/favicon.png', 'assets/favicon.source.png');
  results.push(generate(favSource, 'assets/favicon.png', FAVICON_SIZE, 'favicon (se muestra a 16-32px)'));

  const totalBefore = results.reduce((n, r) => n + r.before, 0);
  const totalAfter = results.reduce((n, r) => n + r.after, 0);
  console.log('');
  console.log(`  total  ${kb(totalBefore)}  ->  ${kb(totalAfter)}  (${((totalAfter - totalBefore) / totalBefore * 100).toFixed(0)}%)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
