import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { decodePng, encodePng, resizeRgba, resizeToHeight, trimTransparent } from './image.mjs';

// The generation script is exercised through the modules it uses, plus a check
// that the files actually committed are the sizes the page needs.

test('the shipped logo is small enough for a 76px slot on a retina display', () => {
  const buffer = readFileSync(new URL('../assets/logo-nyx.png', import.meta.url));
  const decoded = decodePng(buffer);
  assert.ok(decoded.height >= 152, `height ${decoded.height} must cover 2x for a 76px slot`);
  // Anything above a few hundred KB for this slot is a regression.
  assert.ok(buffer.length < 200 * 1024, `logo is ${(buffer.length / 1024).toFixed(1)} KB, expected under 200 KB`);
});

test('the shipped favicon is small enough to load on every page view', () => {
  const buffer = readFileSync(new URL('../assets/favicon.png', import.meta.url));
  const decoded = decodePng(buffer);
  assert.ok(decoded.width <= 128, `favicon is ${decoded.width}px wide, expected at most 128`);
  assert.equal(decoded.width, decoded.height, 'a favicon must be square');
  assert.ok(buffer.length < 32 * 1024, `favicon is ${(buffer.length / 1024).toFixed(1)} KB, expected under 32 KB`);
});

test('the two shipped images together stay under a small budget', () => {
  const logo = readFileSync(new URL('../assets/logo-nyx.png', import.meta.url));
  const favicon = readFileSync(new URL('../assets/favicon.png', import.meta.url));
  const total = logo.length + favicon.length;
  assert.ok(total < 256 * 1024, `images total ${(total / 1024).toFixed(1)} KB, expected under 256 KB`);
});

test('the untouched originals are kept for a future rescale', () => {
  // Without these, a later run would resample an already-reduced file and lose
  // quality permanently.
  for (const name of ['logo-nyx.source.png', 'favicon.source.png']) {
    const path = new URL(`../assets/${name}`, import.meta.url);
    assert.ok(existsSync(path), `${name} must exist to allow regenerating`);
    assert.ok(readFileSync(path).length > 500 * 1024, `${name} should be the full-resolution original`);
  }
});

test('a transparent pixel carries no colour after resizing', () => {
  // Half transparent black, half opaque colour: the transparent side must not
  // keep a tint that could fringe at the edges.
  const data = Buffer.alloc(4 * 4 * 4);
  for (let i = 0; i < 16; i += 1) {
    if (i >= 8) { data[i * 4] = 200; data[i * 4 + 1] = 100; data[i * 4 + 2] = 50; data[i * 4 + 3] = 255; }
  }
  const out = resizeRgba({ width: 4, height: 4, data }, 2, 2);
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) {
      assert.deepEqual([...out.data.subarray(i, i + 3)], [0, 0, 0], 'invisible pixels must be fully zeroed');
    }
  }
});

test('the generation path is reproducible from the sources', () => {
  // Reproduce what scripts/images.mjs does, from the kept originals, and check
  // the result is close to the committed file. Exact equality is not required
  // because deflate output can differ; dimensions and rough size must match.
  const source = decodePng(readFileSync(new URL('../assets/logo-nyx.source.png', import.meta.url)));
  const trimmed = trimTransparent(source);
  const resized = resizeToHeight(trimmed.cropped ? trimmed : source, 152);
  const regenerated = encodePng(resized);
  const committed = readFileSync(new URL('../assets/logo-nyx.png', import.meta.url));
  const committedDecoded = decodePng(committed);
  assert.equal(resized.width, committedDecoded.width, 'width must match the committed file');
  assert.equal(resized.height, committedDecoded.height, 'height must match the committed file');
  assert.ok(Math.abs(regenerated.length - committed.length) < committed.length * 0.25,
    `regenerated ${regenerated.length} vs committed ${committed.length}`);
});

test('re-running the resize on an already-reduced file would lose quality', () => {
  // Documents why the .source.png files must be kept: this is the mistake they
  // prevent, so the test pins the behaviour rather than only the fix.
  const committed = decodePng(readFileSync(new URL('../assets/logo-nyx.png', import.meta.url)));
  const again = resizeToHeight(committed, 76);
  assert.ok(again.width < committed.width, 'resizing the reduced file shrinks it further');
  const source = decodePng(readFileSync(new URL('../assets/logo-nyx.source.png', import.meta.url)));
  const fromSource = resizeToHeight(source, 152);
  assert.ok(fromSource.width > again.width, 'from the original the result stays sharp');
});
