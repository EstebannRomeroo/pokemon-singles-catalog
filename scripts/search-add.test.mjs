import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberQuery, isNumberQuery, resolveQueryKind, filterGroups, setHaystack, filterProductsByName } from './search.mjs';

// Mirrors a TCGCSV group row.
const group = (over = {}) => ({ groupId: 24220, name: 'Commander: Marvel: Darkhold Destiny', abbreviation: 'MDC', ...over });

// Mirrors a TCGCSV product row, including the cleanName TCGCSV supplies.
const product = (over = {}) => ({ productId: 618871, name: 'Cloud, Ex-SOLDIER', cleanName: 'Cloud Ex SOLDIER', ...over });

test('numberQuery strips the printed denominator', () => {
  assert.equal(numberQuery('083/088'), '083');
  assert.equal(numberQuery('83'), '83');
  assert.equal(numberQuery('083'), '083');
});

test('numberQuery tolerates surrounding whitespace', () => {
  assert.equal(numberQuery('  083  '), '083');
  assert.equal(numberQuery(' 083 / 088 '), '083');
});

test('numberQuery survives null and undefined', () => {
  assert.equal(numberQuery(null), '');
  assert.equal(numberQuery(undefined), '');
});

test('isNumberQuery is true only for digits', () => {
  assert.equal(isNumberQuery('083'), true);
  assert.equal(isNumberQuery('83'), true);
  assert.equal(isNumberQuery('083/088'), true);
});

test('isNumberQuery is false for names, even with digits inside', () => {
  assert.equal(isNumberQuery('cloud'), false);
  assert.equal(isNumberQuery('Ex-SOLDIER'), false);
  assert.equal(isNumberQuery('Cloud, Ex-SOLDIER'), false);
  assert.equal(isNumberQuery('7th Edition'), false);
});

test('isNumberQuery is false for an empty query', () => {
  assert.equal(isNumberQuery(''), false);
  assert.equal(isNumberQuery('   '), false);
  assert.equal(isNumberQuery(null), false);
});

test('resolveQueryKind routes digits to number and text to name', () => {
  assert.equal(resolveQueryKind('083/088'), 'number');
  assert.equal(resolveQueryKind('cloud'), 'name');
  assert.equal(resolveQueryKind(''), 'name');
});

test('setHaystack includes name and abbreviation', () => {
  const hay = setHaystack(group());
  assert.ok(hay.includes('darkhold'));
  assert.ok(hay.includes('mdc'));
});

test('setHaystack survives a group without an abbreviation', () => {
  assert.equal(setHaystack({ name: 'Promo' }), 'promo');
  assert.equal(setHaystack({}), '');
  assert.equal(setHaystack(undefined), '');
});

test('filterGroups finds a set by name fragment', () => {
  const groups = [group(), group({ groupId: 1, name: 'Lorwyn Eclipsed', abbreviation: 'LRE' })];
  const out = filterGroups(groups, 'darkhold');
  assert.equal(out.length, 1);
  assert.equal(out[0].groupId, 24220);
});

test('filterGroups finds a set by abbreviation regardless of case', () => {
  const groups = [group(), group({ groupId: 1, name: 'Lorwyn Eclipsed', abbreviation: 'LRE' })];
  assert.equal(filterGroups(groups, 'mdc').length, 1);
  assert.equal(filterGroups(groups, 'MDC').length, 1);
});

test('filterGroups ignores accents', () => {
  const groups = [group({ name: 'Edición Especial' })];
  assert.equal(filterGroups(groups, 'edicion').length, 1);
  assert.equal(filterGroups(groups, 'edición').length, 1);
});

test('filterGroups returns everything for an empty query', () => {
  const groups = [group(), group({ groupId: 1 })];
  assert.equal(filterGroups(groups, '').length, 2);
  assert.equal(filterGroups(groups, '   ').length, 2);
});

test('filterGroups returns nothing when nothing matches', () => {
  assert.equal(filterGroups([group()], 'zzzzqqqq').length, 0);
});

test('filterGroups returns a copy, not the same array', () => {
  const groups = [group()];
  const out = filterGroups(groups, '');
  assert.notEqual(out, groups);
  assert.deepEqual(out, groups);
});

test('filterGroups tolerates a non-array input', () => {
  assert.deepEqual(filterGroups(null, 'x'), []);
  assert.deepEqual(filterGroups(undefined, 'x'), []);
});

test('filterProductsByName matches a name fragment', () => {
  const products = [product(), product({ productId: 2, name: 'Sephiroth', cleanName: 'Sephiroth' })];
  const out = filterProductsByName(products, 'cloud');
  assert.equal(out.length, 1);
  assert.equal(out[0].productId, 618871);
});

test('filterProductsByName ignores punctuation through cleanName', () => {
  const products = [product()];
  assert.equal(filterProductsByName(products, 'ex soldier').length, 1);
  assert.equal(filterProductsByName(products, 'Ex-SOLDIER').length, 1);
  assert.equal(filterProductsByName(products, 'ex-soldier').length, 1);
});

test('filterProductsByName is case insensitively matched', () => {
  assert.equal(filterProductsByName([product()], 'CLOUD').length, 1);
});

test('filterProductsByName returns nothing for an empty query', () => {
  assert.equal(filterProductsByName([product()], '').length, 0);
  assert.equal(filterProductsByName([product()], '   ').length, 0);
});

test('filterProductsByName returns nothing when nothing matches', () => {
  assert.equal(filterProductsByName([product()], 'zzzzqqqq').length, 0);
});

test('filterProductsByName tolerates a product without cleanName', () => {
  const bare = { productId: 9, name: 'Cloud, Ex-SOLDIER' };
  assert.doesNotThrow(() => filterProductsByName([bare], 'cloud'));
  assert.equal(filterProductsByName([bare], 'cloud').length, 1);
});

test('filterProductsByName tolerates a non-array input', () => {
  assert.deepEqual(filterProductsByName(null, 'x'), []);
  assert.deepEqual(filterProductsByName(undefined, 'x'), []);
});
