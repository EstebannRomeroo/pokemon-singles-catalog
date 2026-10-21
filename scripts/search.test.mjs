import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, searchHaystack, matchesSearch, filterInventory, hitsLabel } from './search.mjs';

// The display pairs live in admin.html (its GAMES const). catalog.mjs exports a
// different GAMES: the TCGCSV category ids. Mirrored here so the test resolves
// labels exactly as the page does.
const GAMES = [['pokemon', 'Pokémon'], ['magic', 'Magic'], ['onepiece', 'One Piece']];
const gameLabel = (entry) => GAMES.find(([g]) => g === entry.game)?.[1] ?? entry.game;

// Mirrors the join admin.html performs: an entry plus its catalog item.
const entry = (over = {}) => ({
  game: 'magic',
  group: 24463,
  product: 671771,
  qty: 1,
  ...over,
});

const item = (over = {}) => ({
  id: 'magic-671771',
  name: "Morcant's Loyalist (Showcase)",
  set: 'Lorwyn Eclipsed',
  number: '341',
  rarity: 'R',
  language: 'ES',
  ...over,
});

test('fold lowercases and strips accents', () => {
  assert.equal(fold('Pokémon'), 'pokemon');
  assert.equal(fold('Ángel'), 'angel');
  assert.equal(fold('Lorwyn Eclipsed'), 'lorwyn eclipsed');
  assert.equal(fold('  spaced  '), 'spaced');
});

test('fold survives null and undefined instead of throwing', () => {
  assert.equal(fold(null), '');
  assert.equal(fold(undefined), '');
  assert.equal(fold(0), '0');
});

test('an empty query matches everything', () => {
  assert.equal(matchesSearch(entry(), item(), ''), true);
});

test('a whitespace-only query matches everything', () => {
  assert.equal(matchesSearch(entry(), item(), fold('   ')), true);
});

test('matches by name', () => {
  assert.equal(matchesSearch(entry(), item(), fold('morcant')), true);
});

test('matches a parenthetical suffix', () => {
  assert.equal(matchesSearch(entry(), item(), fold('showcase')), true);
});

test('matches by set', () => {
  assert.equal(matchesSearch(entry(), item(), fold('lorwyn')), true);
});

test('matches by number', () => {
  assert.equal(matchesSearch(entry(), item(), fold('341')), true);
});

test('matches by rarity', () => {
  assert.equal(matchesSearch(entry(), item(), fold('r')), true);
});

test('matches by the game display label, not the slug', () => {
  assert.equal(matchesSearch(entry(), item(), fold('Magic'), gameLabel(entry())), true);
});

test('matches a query with accents against an unaccented field', () => {
  assert.equal(matchesSearch(entry(), item({ name: 'Angel of Despair' }), fold('Ángel')), true);
});

test('matches an unaccented query against an accented field', () => {
  assert.equal(matchesSearch(entry(), item({ name: 'Ángel de la Muerte' }), fold('angel')), true);
});

test('is case insensitive', () => {
  assert.equal(matchesSearch(entry(), item(), fold('LORWYN')), true);
});

test('a query matching nothing is false', () => {
  assert.equal(matchesSearch(entry(), item(), fold('zzzzqqqq')), false);
});

test('an entry without a catalog item still searches by its own fields', () => {
  assert.equal(matchesSearch(entry({ variant: 'Holofoil' }), undefined, fold('holofoil')), true);
});

test('an entry without a catalog item does not throw', () => {
  assert.doesNotThrow(() => matchesSearch(entry(), undefined, fold('lorwyn')));
  assert.equal(matchesSearch(entry(), undefined, fold('lorwyn')), false);
});

test('filterInventory returns everything for an empty query', () => {
  const inv = [entry({ product: 1 }), entry({ product: 2 })];
  const itemFor = () => item();
  assert.equal(filterInventory(inv, itemFor, '').length, 2);
});

test('filterInventory returns a copy, never the same array', () => {
  const inv = [entry()];
  const out = filterInventory(inv, () => item(), '');
  assert.notEqual(out, inv);
  assert.deepEqual(out, inv);
});

test('filterInventory narrows to the matching entries', () => {
  const inv = [entry({ product: 1 }), entry({ product: 2 })];
  const itemFor = (e) => (e.product === 1 ? item({ name: 'Hellkite Tyrant' }) : item({ name: 'Lorwyn Scout' }));
  const out = filterInventory(inv, itemFor, fold('hellkite'));
  assert.equal(out.length, 1);
  assert.equal(out[0].product, 1);
});

test('filterInventory can return an empty list, not everything', () => {
  const inv = [entry({ product: 1 }), entry({ product: 2 })];
  assert.equal(filterInventory(inv, () => item(), fold('zzzzqqqq')).length, 0);
});

test('filterInventory tolerates a non-array input', () => {
  assert.deepEqual(filterInventory(null, () => item(), ''), []);
  assert.deepEqual(filterInventory(undefined, () => item(), ''), []);
});

test('hitsLabel is silent when nothing is filtered', () => {
  assert.equal(hitsLabel(97, 97), '');
  assert.equal(hitsLabel(0, 0), '');
});

test('hitsLabel reports the visible share', () => {
  assert.equal(hitsLabel(3, 97), '3 de 97 entradas');
});

test('hitsLabel uses the singular for a one-entry inventory', () => {
  assert.equal(hitsLabel(0, 1), '0 de 1 entrada');
});

test('haystack includes every searchable field', () => {
  const hay = searchHaystack(entry({ variant: 'Holofoil', condition: 'LP' }), item(), 'Magic');
  for (const needle of ['morcant', 'lorwyn', '341', 'r', 'magic', 'es', 'holofoil', 'lp']) {
    assert.ok(hay.includes(needle), `haystack should include "${needle}"`);
  }
});
