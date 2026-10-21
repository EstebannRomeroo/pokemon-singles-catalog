import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCard, removeCard, sellCard, serializeInventory } from './inventory.mjs';
import { validateSingles } from './catalog.mjs';

const s = (game, group, product, extra = {}) => ({ game, group, product, qty: 1, ...extra });

test('addCard appends a valid card and leaves the input untouched', () => {
  const inventory = [s('pokemon', 10, 1)];
  const next = addCard(inventory, s('pokemon', 10, 2, { variant: 'Holofoil' }));
  assert.deepEqual(next, {
    ok: true,
    inventory: [s('pokemon', 10, 1), s('pokemon', 10, 2, { variant: 'Holofoil' })],
  });
  assert.equal(inventory.length, 1);
});

test('addCard rejects a duplicate game+product+variant', () => {
  const inventory = [s('pokemon', 10, 1, { variant: 'Holofoil' })];
  const errors = ['card pokemon/1: duplicate entry in singles.json (variant Holofoil)'];
  assert.deepEqual(addCard(inventory, s('pokemon', 10, 1, { variant: 'Holofoil' })), { ok: false, errors });
});

test('addCard rejects an unknown language through validateSingles', () => {
  const errors = ['card pokemon/1: language must be one of EN, ES, JP, PT, FR, DE, IT (got "xx")'];
  assert.deepEqual(addCard([], s('pokemon', 10, 1, { language: 'xx' })), { ok: false, errors });
});

test('removeCard drops the matching entry and leaves the input untouched', () => {
  const inventory = [s('pokemon', 10, 1), s('magic', 20, 3, { variant: 'Foil' })];
  const next = removeCard(inventory, { game: 'magic', product: 3, variant: 'Foil' });
  assert.deepEqual(next, { ok: true, inventory: [s('pokemon', 10, 1)] });
  assert.equal(inventory.length, 2);
});

test('removeCard matches entries without a variant when none is requested', () => {
  const inventory = [s('pokemon', 10, 1, { variant: 'Holofoil' }), s('pokemon', 10, 1)];
  const next = removeCard(inventory, { game: 'pokemon', product: 1 });
  assert.deepEqual(next, { ok: true, inventory: [s('pokemon', 10, 1, { variant: 'Holofoil' })] });
});

test('removeCard reports an error when nothing matches', () => {
  const inventory = [s('pokemon', 10, 1)];
  assert.deepEqual(removeCard(inventory, { game: 'pokemon', product: 999 }), {
    ok: false,
    errors: ['no inventory entry for card pokemon/999'],
  });
});

test('sellCard decrements qty by one', () => {
  const inventory = [s('pokemon', 10, 1, { qty: 3 })];
  const next = sellCard(inventory, { game: 'pokemon', product: 1 });
  assert.deepEqual(next, { ok: true, inventory: [s('pokemon', 10, 1, { qty: 2 })] });
  assert.equal(inventory[0].qty, 3);
});

test('sellCard removes the entry when qty reaches zero', () => {
  const inventory = [s('pokemon', 10, 1), s('magic', 20, 3, { qty: 2, variant: 'Foil' })];
  assert.deepEqual(sellCard(inventory, { game: 'pokemon', product: 1 }), { ok: true, inventory: [s('magic', 20, 3, { qty: 2, variant: 'Foil' })] });
});

test('sellCard reports an error when nothing matches', () => {
  assert.deepEqual(sellCard([], { game: 'pokemon', product: 1 }), {
    ok: false,
    errors: ['no inventory entry for card pokemon/1'],
  });
});

test('serializeInventory round-trips through JSON.parse', () => {
  const inventory = [s('pokemon', 10, 1, { qty: 2, variant: 'Holofoil' }), s('onepiece', 5, 7, { price: 5000, language: 'ES' })];
  const text = serializeInventory(inventory);
  assert.equal(text, JSON.stringify(inventory, null, 2) + '\n');
  assert.ok(text.endsWith('\n'));
  assert.deepEqual(JSON.parse(text), inventory);
});

// The export path must never hand the price script a file it will reject.
test('serializeInventory of a valid inventory passes validateSingles', () => {
  const inventory = [s('pokemon', 10, 1, { qty: 2, variant: 'Holofoil', language: 'ES' })];
  assert.deepEqual(validateSingles(JSON.parse(serializeInventory(inventory))), []);
});

test('serializeInventory preserves an inventory that validateSingles rejects', () => {
  const invalid = [s('pokemon', 10, 1, { qty: 1, language: 'XX' })];
  assert.notDeepEqual(validateSingles(invalid), []);
  assert.deepEqual(JSON.parse(serializeInventory(invalid)), invalid);
});

// A `"variant": null` row is permitted by validateSingles, so sell/remove must match it.
test('sellCard and removeCard match an entry whose variant is null', () => {
  const entry = s('pokemon', 10, 1, { qty: 2, variant: null });
  const sold = sellCard([entry], entry);
  assert.equal(sold.ok, true);
  assert.equal(sold.inventory[0].qty, 1);
  assert.deepEqual(removeCard([entry], entry), { ok: true, inventory: [] });
});

test('sellCard rejects a malformed qty instead of corrupting it', () => {
  for (const qty of [undefined, null, 0, -1, 1.5]) {
    const result = sellCard([s('pokemon', 10, 1, { qty })], { game: 'pokemon', product: 1 });
    assert.equal(result.ok, false, `qty ${qty} must be rejected`);
  }
});
