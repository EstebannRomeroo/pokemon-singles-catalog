import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, validateSingles, buildItems, catalogChanged } from './catalog.mjs';

const config = { usdToCop: 4000, minPriceCop: 2000, margin: 1, roundToCop: 500 };
const card = (id, prices) => ({
  id,
  name: id,
  set: { name: 'Set' },
  number: '1',
  images: { small: 's.png', large: 'l.png' },
  tcgplayer: prices && { prices },
});
const cards = new Map([
  ['a-1', card('a-1', { normal: { market: 10 } })],
  ['b-2', card('b-2', { normal: { market: null } })],
]);

test('missing cards are errors, not dropped', () => {
  const { items, errors } = buildItems([{ id: 'a-1', qty: 1 }, { id: 'zz-9', qty: 1 }], cards, config);
  assert.equal(items.length, 1);
  assert.deepEqual(errors, ['card zz-9 not found on pokemontcg.io']);
});

test('manual price must be a positive integer', () => {
  for (const price of ['50000', 1.5, 0, -100]) {
    const { errors } = buildItems([{ id: 'a-1', qty: 1, price }], cards, config);
    assert.equal(errors.length, 1, `price ${price}`);
    assert.match(errors[0], /a-1/);
  }
  const { items, errors } = buildItems([{ id: 'a-1', qty: 1, price: 50000 }, { id: 'a-1', qty: 1, price: null }], cards, config);
  assert.deepEqual(errors, []);
  assert.deepEqual(items.map((i) => [i.priceCop, i.manual]), [[50000, true], [40000, false]]);
});

test('card with no price and no manual price is an error', () => {
  assert.deepEqual(buildItems([{ id: 'b-2', qty: 1 }], cards, config).errors, ['card b-2 has no TCGPlayer price; set a manual "price"']);
  assert.deepEqual(buildItems([{ id: 'b-2', qty: 1, price: 9000 }], cards, config).errors, []);
});

test('margin other than 1 is applied', () => {
  const { items } = buildItems([{ id: 'a-1', qty: 1 }], cards, { ...config, margin: 1.2 });
  assert.equal(items[0].priceCop, 48000);
});

test('config validation lists every bad key', () => {
  assert.deepEqual(validateConfig(config), []);
  const errors = validateConfig({ usdToCop: '3200', minPriceCop: 0, margin: NaN });
  assert.equal(errors.length, 4);
  for (const key of ['usdToCop', 'minPriceCop', 'margin', 'roundToCop']) assert.ok(errors.some((e) => e.includes(key)), key);
});

test('singles validation: id, qty and duplicates', () => {
  assert.deepEqual(validateSingles([{ id: 'a-1', qty: 2 }]), []);
  const errors = validateSingles([{ id: '', qty: 1 }, { id: 'a-1', qty: 0 }, { id: 'b-2', qty: 1.5 }, { id: 'b-2', qty: 1 }]);
  assert.equal(errors.length, 4);
  assert.ok(errors.some((e) => e.includes('duplicate') && e.includes('b-2')));
  assert.deepEqual(validateSingles({}), ['singles.json must be an array']);
});

test('catalogChanged ignores generatedAt', () => {
  const prev = { generatedAt: 'x', usdToCop: 4000, items: [{ id: 'a-1' }] };
  assert.equal(catalogChanged(prev, { ...prev, generatedAt: 'y' }), false);
  assert.equal(catalogChanged(prev, { ...prev, usdToCop: 4100 }), true);
  assert.equal(catalogChanged(prev, { ...prev, items: [] }), true);
  assert.equal(catalogChanged(null, prev), true);
});
