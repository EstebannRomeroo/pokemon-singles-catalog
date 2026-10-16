import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, validateSingles, buildItems, catalogChanged, cardKey } from './catalog.mjs';

const config = { usdToCop: 4000, minPriceCop: 2000, margin: 1, roundToCop: 500 };
const UPDATED = '2026-10-15T20:06:01+0000';
const product = (productId, number = '1/100', name = `Card ${productId}`) => ({
  productId,
  name,
  imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_200w.jpg`,
  url: `https://www.tcgplayer.com/product/${productId}`,
  extendedData: [{ name: 'Number', value: number }, { name: 'Rarity', value: 'Rare' }],
});
const prices = (...rows) => rows.map(([subTypeName, marketPrice, midPrice = null]) => ({ subTypeName, marketPrice, midPrice }));
const entry = (game, group, p, rows) => [cardKey({ game, group, product: p.productId }), { product: p, prices: rows, set: `Set ${group}` }];
const cards = new Map([
  entry('pokemon', 10, product(1), prices(['Normal', 10])),
  entry('pokemon', 10, product(2), prices(['Normal', null])),
  entry('magic', 20, product(3, '42'), prices(['Foil', 2], ['Normal', 1])),
  entry('pokemon', 10, product(4, '230/182', "Ethan's Ho-Oh ex - 230/182"), prices(['Holofoil', 140.63])),
]);
const s = (game, group, p, extra = {}) => ({ game, group, product: p, qty: 1, ...extra });

test('item fields come from the TCGCSV product, prices and group', () => {
  const { items, errors } = buildItems([s('pokemon', 10, 4)], cards, config, UPDATED);
  assert.deepEqual(errors, []);
  assert.deepEqual(items[0], {
    id: 'pokemon-4',
    game: 'pokemon',
    name: "Ethan's Ho-Oh ex",
    set: 'Set 10',
    number: '230/182',
    rarity: 'Rare',
    image: 'https://tcgplayer-cdn.tcgplayer.com/product/4_400w.jpg',
    imageLarge: 'https://tcgplayer-cdn.tcgplayer.com/product/4_in_1000x1000.jpg',
    variant: 'Holofoil',
    priceVariant: 'Holofoil',
    condition: 'NM',
    qty: 1,
    usd: 140.63,
    priceCop: 563000,
    manual: false,
    tcgplayerUrl: 'https://www.tcgplayer.com/product/4',
    priceUpdatedAt: UPDATED,
  });
});

test('products without images get null image urls', () => {
  const cs = new Map([entry('onepiece', 30, { ...product(5), imageCount: 0 }, prices(['Normal', 1]))]);
  const [item] = buildItems([s('onepiece', 30, 5)], cs, config, UPDATED).items;
  assert.deepEqual([item.image, item.imageLarge], [null, null]);
});

test('missing products are errors, not dropped', () => {
  const { items, errors } = buildItems([s('pokemon', 10, 1), s('pokemon', 10, 999), s('magic', 10, 1)], cards, config, UPDATED);
  assert.equal(items.length, 1);
  assert.deepEqual(errors, ['card pokemon/999 not found on tcgcsv.com', 'card magic/1 not found on tcgcsv.com']);
});

test('manual price overrides the market price', () => {
  const { items, errors } = buildItems([s('pokemon', 10, 1, { price: 50000 }), s('magic', 20, 3, { price: null, variant: 'Foil' })], cards, config, UPDATED);
  assert.deepEqual(errors, []);
  assert.deepEqual(items.map((i) => [i.priceCop, i.manual]), [[50000, true], [8000, false]]);
});

test('card with no price and no manual price is an error', () => {
  assert.deepEqual(buildItems([s('pokemon', 10, 2)], cards, config, UPDATED).errors, ['card pokemon/2 has no TCGPlayer price; set a manual "price"']);
  const { items, errors } = buildItems([s('pokemon', 10, 2, { price: 9000 })], cards, config, UPDATED);
  assert.deepEqual(errors, []);
  assert.deepEqual([items[0].usd, items[0].priceVariant, items[0].variant], [null, null, null]);
});

test('margin other than 1 is applied', () => {
  const { items } = buildItems([s('pokemon', 10, 1)], cards, { ...config, margin: 1.2 }, UPDATED);
  assert.equal(items[0].priceCop, 48000);
});

test('owned variant is kept when price comes from another variant', () => {
  const [item] = buildItems([s('magic', 20, 3, { variant: 'Etched Foil' })], cards, config, UPDATED).items;
  assert.equal(item.variant, 'Etched Foil');
  assert.equal(item.priceVariant, 'Normal');
  assert.equal(item.usd, 1);
});

test('config validation lists every bad key', () => {
  assert.deepEqual(validateConfig(config), []);
  const errors = validateConfig({ usdToCop: '3200', minPriceCop: 0, margin: NaN });
  assert.equal(errors.length, 4);
  for (const key of ['usdToCop', 'minPriceCop', 'margin', 'roundToCop']) assert.ok(errors.some((e) => e.includes(key)), key);
});

test('singles validation: game, ids, qty, price and duplicates', () => {
  assert.deepEqual(validateSingles([s('pokemon', 10, 1, { qty: 2 }), s('onepiece', 5, 1), s('magic', 20, 3, { price: 9000, variant: 'Foil' })]), []);
  const errors = validateSingles([
    s('yugioh', 1, 1),
    s('pokemon', 0, 1),
    s('pokemon', 10, '7'),
    s('pokemon', 10, 2, { qty: 0 }),
    s('pokemon', 10, 3, { qty: 1.5 }),
    s('pokemon', 10, 4, { price: '50000' }),
    s('pokemon', 10, 5, { price: 0 }),
    s('magic', 20, 3, { variant: 'Foil' }),
    s('magic', 21, 3, { variant: 'Foil' }),
    s('magic', 20, 3),
  ]);
  assert.equal(errors.length, 8, errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('game') && e.includes('yugioh')));
  assert.ok(errors.some((e) => e.includes('group')));
  assert.ok(errors.some((e) => e.includes('product')));
  assert.ok(errors.some((e) => e.includes('pokemon/4') && e.includes('price')));
  assert.ok(errors.some((e) => e.includes('duplicate') && e.includes('magic/3')));
  assert.deepEqual(validateSingles({}), ['singles.json must be an array']);
});

test('catalogChanged ignores generatedAt', () => {
  const prev = { generatedAt: 'x', usdToCop: 4000, items: [{ id: 'pokemon-1' }] };
  assert.equal(catalogChanged(prev, { ...prev, generatedAt: 'y' }), false);
  assert.equal(catalogChanged(prev, { ...prev, usdToCop: 4100 }), true);
  assert.equal(catalogChanged(prev, { ...prev, items: [] }), true);
  assert.equal(catalogChanged(null, prev), true);
});
