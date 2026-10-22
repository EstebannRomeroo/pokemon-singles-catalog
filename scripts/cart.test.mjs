import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToCart, setCartQty, reconcileCart, cartLines, cartCount, orderMessage } from './cart.mjs';

const item = (over = {}) => ({
  id: 'pokemon-716513',
  name: 'Umbreon ex',
  set: 'Prismatic Evolutions',
  number: '161/131',
  variant: 'Holofoil',
  condition: 'NM',
  language: 'EN',
  qty: 2,
  priceCop: 50000,
  ...over,
});

const cop = (n) => `$ ${n}`;

test('addToCart adds one copy and stops at the stock', () => {
  const one = addToCart({}, item());
  assert.deepEqual(one, { cart: { 'pokemon-716513': 1 }, added: true });
  const two = addToCart(one.cart, item());
  assert.deepEqual(two.cart, { 'pokemon-716513': 2 });
  const capped = addToCart(two.cart, item());
  assert.equal(capped.added, false);
  assert.deepEqual(capped.cart, { 'pokemon-716513': 2 });
});

test('addToCart never mutates the cart it receives', () => {
  const cart = { 'pokemon-716513': 1 };
  addToCart(cart, item());
  assert.deepEqual(cart, { 'pokemon-716513': 1 });
});

test('setCartQty clamps to stock and removes the line at zero', () => {
  const cart = { 'pokemon-716513': 1 };
  assert.deepEqual(setCartQty(cart, item(), 5), { 'pokemon-716513': 2 });
  assert.deepEqual(setCartQty(cart, item(), 0), {});
  assert.deepEqual(setCartQty(cart, item(), -3), {});
});

test('setCartQty keeps the line in place so it does not jump while editing', () => {
  const cart = { 'pokemon-716513': 1, 'magic-1': 1 };
  assert.deepEqual(Object.keys(setCartQty(cart, item(), 2)), ['pokemon-716513', 'magic-1']);
});

test('reconcileCart drops sold-out or unknown cards and clamps to current stock', () => {
  const items = [item({ qty: 1 }), item({ id: 'magic-1', qty: 4 })];
  const cart = { 'pokemon-716513': 3, 'magic-1': 2, 'gone-9': 1, 'magic-bad': 'x' };
  assert.deepEqual(reconcileCart(cart, items), { 'pokemon-716513': 1, 'magic-1': 2 });
});

test('reconcileCart tolerates a corrupted stored value', () => {
  assert.deepEqual(reconcileCart(null, [item()]), {});
  assert.deepEqual(reconcileCart('oops', [item()]), {});
  assert.deepEqual(reconcileCart([1, 2], [item()]), {});
});

test('cartLines prices each line from the catalog, not from the cart', () => {
  const lines = cartLines({ 'pokemon-716513': 2 }, [item({ priceCop: 61000 })]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].qty, 2);
  assert.equal(lines[0].subtotal, 122000);
});

test('cartCount sums copies across lines', () => {
  assert.equal(cartCount({ a: 2, b: 1 }), 3);
  assert.equal(cartCount({}), 0);
});

test('orderMessage lists every line with its details and the total', () => {
  const lines = cartLines({ 'pokemon-716513': 2, 'magic-1': 1 }, [
    item(),
    item({ id: 'magic-1', name: 'Sol Ring', set: 'Commander', number: '1', variant: 'Normal', priceCop: 8000, qty: 3 }),
  ]);
  const text = orderMessage(lines, cop);
  assert.equal(text, [
    'Hola, quiero hacer este pedido:',
    '- 2 × Umbreon ex (Prismatic Evolutions #161/131 · Holofoil · NM · EN) — $ 100000',
    '- 1 × Sol Ring (Commander #1 · Normal · NM · EN) — $ 8000',
    'Total: 3 cartas — $ 108000',
  ].join('\n'));
});

test('orderMessage uses the singular for a single card', () => {
  const text = orderMessage(cartLines({ 'pokemon-716513': 1 }, [item()]), cop);
  assert.match(text, /Total: 1 carta — \$ 50000$/);
});
