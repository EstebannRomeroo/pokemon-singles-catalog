import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPrice, toCop } from './price.mjs';

const cfg = { minPriceCop: 2000, margin: 1, roundToCop: 500 };

test('cheap cards get the minimum price', () => {
  assert.equal(toCop(0.1, 4000, cfg), 2000);
});

test('prices round up to the next 500', () => {
  assert.equal(toCop(1, 4100, cfg), 4500);
  assert.equal(toCop(1, 4000, cfg), 4000);
});

test('null usd falls back to the minimum', () => {
  assert.equal(toCop(null, 4000, cfg), 2000);
});

test('variant fallback and mid fallback', () => {
  const prices = { reverseHolofoil: { market: 2 }, holofoil: { market: null, mid: 5 } };
  assert.deepEqual(pickPrice(prices, 'normal'), { variant: 'holofoil', usd: 5 });
  assert.deepEqual(pickPrice(prices, 'reverseHolofoil'), { variant: 'reverseHolofoil', usd: 2 });
  assert.deepEqual(pickPrice({ '1stEdition': { market: 9 } }), { variant: '1stEdition', usd: 9 });
  assert.equal(pickPrice(undefined), null);
});
