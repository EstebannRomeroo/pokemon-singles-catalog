import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedProxyPath, proxyTargetUrl, staticContentType, filterProductByNumber, isPublicPath, isAllowedProxyRequest, canWriteInventory, parseInventoryBody, readBody } from './serve.mjs';

// The proxy must only forward TCGCSV paths, never arbitrary URLs.
// Without this guard the local server becomes an open proxy for any origin.
test('isAllowedProxyPath accepts only tcgplayer paths', () => {
  assert.equal(isAllowedProxyPath('/tcgplayer/3/groups'), true);
  assert.equal(isAllowedProxyPath('/tcgplayer/3/24587/products'), true);
  assert.equal(isAllowedProxyPath('/tcgplayer/3/24587/prices'), true);
  assert.equal(isAllowedProxyPath('/last-updated.txt'), true);
});

test('isAllowedProxyPath rejects traversal and arbitrary hosts', () => {
  assert.equal(isAllowedProxyPath('/tcgplayer/../../etc/passwd'), false);
  assert.equal(isAllowedProxyPath('/tcgplayer/3/groups?url=http://evil.test'), false);
  assert.equal(isAllowedProxyPath('//evil.test/tcgplayer/3/groups'), false);
  assert.equal(isAllowedProxyPath('/admin.html'), false);
  assert.equal(isAllowedProxyPath('/api/anything'), false);
  assert.equal(isAllowedProxyPath('/tcgplayer'), false);
});

// A query string must not be forwarded: it is not part of any TCGCSV route we use.
// URL.pathname never contains "?", so the request URL itself has to be checked.
test('isAllowedProxyRequest rejects a query string on an otherwise valid route', () => {
  assert.equal(isAllowedProxyRequest('/tcgplayer/3/groups?x=1'), false);
  assert.equal(isAllowedProxyRequest('/tcgplayer/3/groups?url=http://evil.test'), false);
  assert.equal(isAllowedProxyRequest('/tcgplayer/3/groups'), true);
  assert.equal(isAllowedProxyRequest('/last-updated.txt'), true);
});

test('proxyTargetUrl keeps the query string off and points at TCGCSV', () => {
  assert.equal(proxyTargetUrl('/tcgplayer/3/24587/products'), 'https://tcgcsv.com/tcgplayer/3/24587/products');
  assert.equal(proxyTargetUrl('/last-updated.txt'), 'https://tcgcsv.com/last-updated.txt');
});

test('staticContentType maps the extensions the panel serves', () => {
  assert.equal(staticContentType('admin.html'), 'text/html; charset=utf-8');
  assert.equal(staticContentType('index.html'), 'text/html; charset=utf-8');
  assert.equal(staticContentType('scripts/inventory.mjs'), 'text/javascript; charset=utf-8');
  assert.equal(staticContentType('singles.json'), 'application/json; charset=utf-8');
  assert.equal(staticContentType('styles/x.css'), 'text/css; charset=utf-8');
  assert.equal(staticContentType('whatever.bin'), 'application/octet-stream');
});

// The search resolves a card by its printed number, so the matcher is the core of the feature.
test('filterProductByNumber matches the printed number in several written forms', () => {
  const products = [
    { productId: 1, extendedData: [{ name: 'Number', value: '083/088' }] },
    { productId: 2, extendedData: [{ name: 'Number', value: '085/088' }] },
    { productId: 3, extendedData: [{ name: 'Number', value: 'TG03/TG30' }] },
  ];
  assert.deepEqual(filterProductByNumber(products, '083').map((p) => p.productId), [1]);
  assert.deepEqual(filterProductByNumber(products, '83').map((p) => p.productId), [1]);
  assert.deepEqual(filterProductByNumber(products, '083/088').map((p) => p.productId), [1]);
  assert.deepEqual(filterProductByNumber(products, 'TG03').map((p) => p.productId), [3]);
  assert.deepEqual(filterProductByNumber(products, ' tg03 ').map((p) => p.productId), [3]);
});

test('filterProductByNumber returns every printing of a shared number', () => {
  const products = [
    { productId: 1, extendedData: [{ name: 'Number', value: '083/088' }] },
    { productId: 2, extendedData: [{ name: 'Number', value: '083/088' }] },
  ];
  assert.deepEqual(filterProductByNumber(products, '083').map((p) => p.productId), [1, 2]);
});

test('filterProductByNumber ignores products without a number and non-matches', () => {
  const products = [
    { productId: 1, extendedData: [] },
    { productId: 2, extendedData: [{ name: 'Number', value: '100/088' }] },
    { productId: 3 },
  ];
  assert.deepEqual(filterProductByNumber(products, '083'), []);
});

// Serving every repo file exposes .git/config and package.json through a traversal
// that stays inside the repo. Only what the pages fetch may be reachable.
test('isPublicPath allows only the files the pages fetch', () => {
  assert.equal(isPublicPath('/'), true);
  assert.equal(isPublicPath('/index.html'), true);
  assert.equal(isPublicPath('/admin.html'), true);
  assert.equal(isPublicPath('/singles.json'), true);
  assert.equal(isPublicPath('/catalog.json'), true);
  assert.equal(isPublicPath('/config.json'), true);
  assert.equal(isPublicPath('/scripts/inventory.mjs'), true);
  assert.equal(isPublicPath('/scripts/serve.mjs'), true);
});

test('isPublicPath refuses private repository files', () => {
  assert.equal(isPublicPath('/package.json'), false);
  assert.equal(isPublicPath('/.git/config'), false);
  assert.equal(isPublicPath('/README.md'), false);
  assert.equal(isPublicPath('/scripts/inventory.test.mjs'), false);
  assert.equal(isPublicPath('/.env'), false);
  assert.equal(isPublicPath('/odd/tasks/inventory-panel.md'), false);
});

// The write endpoint changes a file on disk, so it must accept only the panel
// itself: a request from this machine, sent by a page served from this server.
// A checked Origin is what stops any other website from posting to localhost.
test('canWriteInventory accepts only same-origin requests from this machine', () => {
  const ok = { remoteAddress: '127.0.0.1', origin: 'http://localhost:8000', host: 'localhost:8000', contentType: 'application/json' };
  assert.equal(canWriteInventory(ok), true);
  assert.equal(canWriteInventory({ ...ok, remoteAddress: '::1' }), true);
  assert.equal(canWriteInventory({ ...ok, remoteAddress: '::ffff:127.0.0.1' }), true);
  assert.equal(canWriteInventory({ ...ok, origin: 'http://127.0.0.1:8000', host: '127.0.0.1:8000' }), true);
});

test('canWriteInventory rejects other devices, other sites and missing headers', () => {
  const ok = { remoteAddress: '127.0.0.1', origin: 'http://localhost:8000', host: 'localhost:8000', contentType: 'application/json' };
  assert.equal(canWriteInventory({ ...ok, remoteAddress: '192.168.1.20' }), false);
  assert.equal(canWriteInventory({ ...ok, origin: 'https://evil.example' }), false);
  assert.equal(canWriteInventory({ ...ok, origin: 'http://localhost:9999' }), false);
  assert.equal(canWriteInventory({ ...ok, origin: undefined }), false);
  assert.equal(canWriteInventory({ ...ok, host: 'evil.example:8000', origin: 'http://evil.example:8000' }), false);
  assert.equal(canWriteInventory({ ...ok, contentType: 'text/plain' }), false);
});

test('parseInventoryBody returns a valid inventory and rejects anything else', () => {
  const good = JSON.stringify([{ game: 'pokemon', group: 1, product: 2, qty: 1 }]);
  assert.deepEqual(parseInventoryBody(good), { ok: true, inventory: [{ game: 'pokemon', group: 1, product: 2, qty: 1 }] });
  assert.equal(parseInventoryBody('not json').ok, false);
  assert.equal(parseInventoryBody('{}').ok, false);
  assert.equal(parseInventoryBody(JSON.stringify([{ game: 'pokemon', group: 1, product: 2, qty: 0 }])).ok, false);
});

// A request body arrives in chunks of bytes. A multi-byte character such as "é"
// can be split across two chunks, so the bytes must be joined before decoding.
test('readBody decodes a character split across chunks', async () => {
  const bytes = Buffer.from('[{"variant":"Café"}]', 'utf8');
  const cut = bytes.indexOf(0xc3) + 1; // between the two bytes of "é"
  async function* chunks() { yield bytes.subarray(0, cut); yield bytes.subarray(cut); }
  assert.deepEqual(await readBody(chunks(), 1024), { ok: true, text: '[{"variant":"Café"}]' });
});

test('readBody stops at the byte limit', async () => {
  async function* chunks() { yield Buffer.alloc(600); yield Buffer.alloc(600); }
  assert.deepEqual(await readBody(chunks(), 1000), { ok: false });
});
