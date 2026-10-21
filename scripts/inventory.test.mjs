import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCard, removeCard, sellCard, serializeInventory } from './inventory.mjs';

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
