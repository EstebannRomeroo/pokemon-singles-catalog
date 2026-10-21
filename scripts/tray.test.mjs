import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageKey, toEntry, stageCard, unstageCard, overlapWithInventory, ownedKey, mergeIntoTray, commitTray } from './tray.mjs';
import { addCard } from './inventory.mjs';
import { validateSingles } from './catalog.mjs';

const card = (over = {}) => ({
  game: 'magic',
  group: 24463,
  product: 671771,
  name: "Morcant's Loyalist (Showcase)",
  set: 'Lorwyn Eclipsed',
  number: '341',
  imageUrl: 'https://example.test/671771.jpg',
  copPrice: 2000,
  ...over,
});

// The tray and the inventory must agree on identity, or a staged card would not be
// recognizable as the one already owned.
test('stageKey matches the inventory id shape', () => {
  assert.equal(stageKey(card()), 'magic-671771');
});

test('toEntry omits optional fields instead of writing null', () => {
  const entry = toEntry(card({ qty: 1, condition: 'NM', language: 'ES' }));
  assert.deepEqual(entry, {
    game: 'magic',
    group: 24463,
    product: 671771,
    qty: 1,
    condition: 'NM',
    language: 'ES',
  });
  assert.equal('variant' in entry, false);
  assert.equal('price' in entry, false);
});

test('toEntry carries a variant and a manual price when present', () => {
  const entry = toEntry(card({ variant: 'Holofoil', price: 5000 }));
  assert.equal(entry.variant, 'Holofoil');
  assert.equal(entry.price, 5000);
});

test('toEntry defaults quantity, condition and language', () => {
  const entry = toEntry({ game: 'pokemon', group: 1, product: 2, name: 'X' });
  assert.equal(entry.qty, 1);
  assert.equal(entry.condition, 'NM');
  assert.equal(entry.language, 'EN');
});

test('stageCard appends a new card', () => {
  const { tray, added, reason } = stageCard([], card());
  assert.equal(added, true);
  assert.equal(reason, '');
  assert.equal(tray.length, 1);
  assert.equal(tray[0].name, "Morcant's Loyalist (Showcase)");
});

// Verifying cards one by one is the whole point, so a repeated search must be
// surfaced rather than silently collapsed into one row.
test('stageCard refuses a duplicate and explains why', () => {
  const first = stageCard([], card()).tray;
  const second = stageCard(first, card());
  assert.equal(second.added, false);
  assert.equal(second.tray.length, 1);
  assert.match(second.reason, /ya está en la bandeja/);
});

test('stageCard treats the same product in another game as distinct', () => {
  const first = stageCard([], card()).tray;
  const { added } = stageCard(first, card({ game: 'pokemon' }));
  assert.equal(added, true);
});

test('stageCard refuses a card without an identity', () => {
  const { added, reason } = stageCard([], { name: 'sin ids' });
  assert.equal(added, false);
  assert.match(reason, /no tiene juego o producto/);
});

test('unstageCard removes by key and leaves the rest in order', () => {
  const tray = [card({ product: 1 }), card({ product: 2 }), card({ product: 3 })];
  const left = unstageCard(tray, 'magic-2');
  assert.deepEqual(left.map((c) => c.product), [1, 3]);
});

test('unstageCard ignores a key that is not staged', () => {
  const tray = [card({ product: 1 })];
  assert.equal(unstageCard(tray, 'magic-999').length, 1);
});

// A second copy of an owned card is legitimate, so this only reports the overlap.
test('overlapWithInventory names the staged cards already owned', () => {
  const tray = [card({ product: 1, name: 'A' }), card({ product: 2, name: 'B' })];
  const inventory = [{ game: 'magic', product: 2 }];
  assert.deepEqual(overlapWithInventory(tray, inventory), ['B']);
});

test('overlapWithInventory is empty when nothing overlaps', () => {
  const tray = [card({ product: 1, name: 'A' })];
  assert.deepEqual(overlapWithInventory(tray, []), []);
  assert.deepEqual(overlapWithInventory(tray, [{ game: 'magic', product: 9 }]), []);
});

// validateSingles rejects two entries sharing game/product/variant, so the tray
// cannot simply append one: the inventory expresses multiplicity with qty.
test('ownedKey distinguishes a variant from the base printing', () => {
  assert.notEqual(ownedKey({ game: 'magic', product: 1 }), ownedKey({ game: 'magic', product: 1, variant: 'Holofoil' }));
  assert.equal(ownedKey({ game: 'magic', product: 1, variant: '' }), ownedKey({ game: 'magic', product: 1 }));
});

test('mergeIntoTray raises the quantity of a card already staged', () => {
  const tray = [{ ...card({ product: 1, name: 'A' }), qty: 2 }];
  const merged = mergeIntoTray(tray, { ...card({ product: 1, name: 'A' }), qty: 3 });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].qty, 5);
});

test('mergeIntoTray leaves the tray alone for a card not staged', () => {
  const tray = [card({ product: 1, name: 'A' })];
  assert.equal(mergeIntoTray(tray, card({ product: 2, name: 'B' })), tray);
});

// Merging cards with different variants or prices would silently drop one of them.
test('mergeIntoTray refuses to merge across different variants', () => {
  const tray = [{ ...card({ product: 1, name: 'A' }), variant: 'Holofoil' }];
  assert.equal(mergeIntoTray(tray, card({ product: 1, name: 'A' })), tray);
});

test('mergeIntoTray refuses to merge across a manual price', () => {
  const tray = [card({ product: 1, name: 'A' })];
  assert.equal(mergeIntoTray(tray, { ...card({ product: 1, name: 'A' }), price: 5000 }), tray);
});

// --- commitTray: the real commit path, exercised against the real validator ----

test('commitTray adds new cards and keeps the order', () => {
  const tray = [card({ product: 1, name: 'A' }), card({ product: 2, name: 'B' })];
  const { inventory, added, merged, errors } = commitTray(tray, [], addCard, validateSingles);
  assert.equal(errors.length, 0);
  assert.deepEqual(added, ['A', 'B']);
  assert.deepEqual(merged, []);
  assert.equal(inventory.length, 2);
  assert.equal(validateSingles(inventory).length, 0);
});

// This is the case that broke: appending an owned card produced
// "duplicate entry in singles.json" instead of adding a copy.
test('commitTray raises qty instead of creating a duplicate row', () => {
  const owned = [{ game: 'magic', group: 24463, product: 671771, qty: 1, condition: 'NM', language: 'ES' }];
  const { inventory, added, merged, errors } = commitTray([card({ product: 671771, name: 'A' })], owned, addCard, validateSingles);
  assert.equal(errors.length, 0);
  assert.deepEqual(added, []);
  assert.deepEqual(merged, ['A']);
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0].qty, 2);
  assert.equal(validateSingles(inventory).length, 0);
});

test('commitTray sums quantities across several copies of the same card', () => {
  const owned = [{ game: 'magic', group: 24463, product: 1, qty: 2, condition: 'NM', language: 'ES' }];
  const tray = [{ ...card({ product: 1, name: 'A' }), qty: 3 }];
  const { inventory, errors } = commitTray(tray, owned, addCard, validateSingles);
  assert.equal(errors.length, 0);
  assert.equal(inventory[0].qty, 5);
});

test('commitTray handles a mixed tray in one pass without duplicates', () => {
  const owned = [{ game: 'magic', group: 24463, product: 1, qty: 1, condition: 'NM', language: 'ES' }];
  const tray = [card({ product: 1, name: 'Ya la tengo' }), card({ product: 2, name: 'Nueva' })];
  const { inventory, added, merged, errors } = commitTray(tray, owned, addCard, validateSingles);
  assert.equal(errors.length, 0);
  assert.deepEqual(added, ['Nueva']);
  assert.deepEqual(merged, ['Ya la tengo']);
  assert.equal(inventory.length, 2);
  assert.equal(validateSingles(inventory).length, 0);
});

// A bad card must not block the good ones, or the tray becomes impossible to empty.
test('commitTray reports a bad card but still commits the good ones', () => {
  const tray = [card({ product: 1, name: 'Buena' }), { game: 'magic', group: 1, product: null, name: 'Mala', qty: 1, condition: 'NM', language: 'ES' }];
  const { inventory, added, errors } = commitTray(tray, [], addCard, validateSingles);
  assert.deepEqual(added, ['Buena']);
  assert.ok(errors.length > 0);
  assert.equal(inventory.length, 1);
});

test('commitTray on an empty tray changes nothing', () => {
  const owned = [{ game: 'magic', group: 24463, product: 1, qty: 1, condition: 'NM', language: 'ES' }];
  const { inventory, added, merged, errors } = commitTray([], owned, addCard, validateSingles);
  assert.equal(errors.length, 0);
  assert.deepEqual(added, []);
  assert.deepEqual(merged, []);
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0].qty, 1);
});

// Two variants of the same product are separate rows, not a quantity bump.
test('commitTray keeps different variants as separate entries', () => {
  const owned = [{ game: 'magic', group: 1, product: 1, qty: 1, condition: 'NM', language: 'ES', variant: 'Holofoil' }];
  const tray = [card({ product: 1, name: 'Base', variant: undefined })];
  const { inventory, added, errors } = commitTray(tray, owned, addCard, validateSingles);
  assert.equal(errors.length, 0);
  assert.deepEqual(added, ['Base']);
  assert.equal(inventory.length, 2);
  assert.equal(validateSingles(inventory).length, 0);
});
