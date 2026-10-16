import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPrice, toCop } from './price.mjs';

const cfg = { minPriceCop: 2000, margin: 1, roundToCop: 500 };
const row = (subTypeName, marketPrice, midPrice = null) => ({ productId: 1, subTypeName, marketPrice, midPrice });

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
  const rows = [row('Reverse Holofoil', 2), row('Holofoil', null, 5)];
  assert.deepEqual(pickPrice(rows, 'Normal'), { variant: 'Holofoil', usd: 5 });
  assert.deepEqual(pickPrice(rows, 'Reverse Holofoil'), { variant: 'Reverse Holofoil', usd: 2 });
  assert.deepEqual(pickPrice([row('1st Edition Holofoil', 9)]), { variant: '1st Edition Holofoil', usd: 9 });
  assert.equal(pickPrice(undefined), null);
  assert.equal(pickPrice([]), null);
});

test('preference order is Normal, Holofoil, Reverse Holofoil, Foil, then any', () => {
  const rows = [row('Foil', 1), row('Reverse Holofoil', 2), row('Holofoil', 3), row('Normal', 4)];
  assert.deepEqual(pickPrice(rows), { variant: 'Normal', usd: 4 });
  assert.deepEqual(pickPrice(rows.slice(0, 3)), { variant: 'Holofoil', usd: 3 });
  assert.deepEqual(pickPrice([row('Foil', 1), row('Reverse Holofoil', 2)]), { variant: 'Reverse Holofoil', usd: 2 });
  assert.deepEqual(pickPrice([row('Unlimited', 7), row('Foil', 1)]), { variant: 'Foil', usd: 1 });
});

test('requested variant without a price falls back to a priced variant', () => {
  const rows = [row('Normal', null), row('Reverse Holofoil', 3)];
  assert.deepEqual(pickPrice(rows, 'Normal'), { variant: 'Reverse Holofoil', usd: 3 });
  assert.deepEqual(pickPrice([row('Holofoil', 4), row('Normal', null)], 'Normal'), { variant: 'Holofoil', usd: 4 });
  assert.equal(pickPrice([row('Normal', null)], 'Normal'), null);
});
