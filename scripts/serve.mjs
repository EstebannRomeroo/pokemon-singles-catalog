import { createServer } from 'node:http';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateSingles } from './catalog.mjs';
import { serializeInventory } from './inventory.mjs';

// The local companion server for admin.html.
//
// Why it exists: tcgcsv.com sends no CORS headers, so the browser cannot call it
// directly (the preflight answers 403). This process runs on Node, where CORS does
// not apply, and forwards the same tcgcsv.com paths the price script already uses.
// The panel then talks to http://localhost:8000 only — same origin, no CORS at all.

const BASE = 'https://tcgcsv.com';
// tcgcsv.com answers 401 to the default Node fetch User-Agent.
const HEADERS = { 'User-Agent': 'singles' };
const ROOT = fileURLToPath(new URL('../', import.meta.url));

// Only these shapes are forwarded. Without this the server would be an open proxy.
const ALLOWED = [/^\/tcgplayer\/\d+\/groups$/, /^\/tcgplayer\/\d+\/\d+\/(products|prices)$/, /^\/last-updated\.txt$/];

export const isAllowedProxyPath = (pathname) =>
  !pathname.includes('..') && !pathname.startsWith('//') && ALLOWED.some((re) => re.test(pathname));

// Checked against the raw request URL, because URL.pathname strips the query.
export const isAllowedProxyRequest = (requestUrl) =>
  !requestUrl.includes('?') && isAllowedProxyPath(new URL(requestUrl, 'http://localhost').pathname);

export const proxyTargetUrl = (pathname) => `${BASE}${pathname}`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

export const staticContentType = (path) => TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';

// The card number as printed is "083/088"; a user may type "083", "83" or "083/088".
// Leading zeros are dropped so all three forms resolve to the same card.
const normalizeNumber = (value) => String(value ?? '').trim().toLowerCase().replace(/^0+(?=\d)/, '');

// Matching is done on the part before the slash so "083" finds "083/088".
export function filterProductByNumber(products, number) {
  const wanted = normalizeNumber(number);
  if (!wanted) return [];
  return products.filter((p) => {
    const printed = p.extendedData?.find((d) => d.name === 'Number')?.value;
    if (!printed) return false;
    return normalizeNumber(String(printed).split('/')[0]) === wanted || normalizeNumber(printed) === wanted;
  });
}

async function serveStatic(res, pathname) {
  // Resolve inside ROOT only: a traversal attempt must never escape the repo.
  const target = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  const path = pathname.endsWith('/') ? join(target, 'index.html') : target;
  let body;
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error('not a file');
    body = await readFile(path);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': staticContentType(path) }).end(body);
}

// Only files the panel and the catalog page actually fetch are reachable.
// A traversal that stays inside the repo would otherwise expose .git/config,
// package.json or any other private file: confining to ROOT is not enough.
const PUBLIC_PATHS = new Set(['/', '/index.html', '/admin.html', '/singles.json', '/catalog.json', '/config.json']);
const PUBLIC_PREFIXES = ['/assets/'];
export const isPublicPath = (pathname) =>
  PUBLIC_PATHS.has(pathname) ||
  PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
  (/^\/scripts\/[A-Za-z0-9._-]+\.(mjs|js|css)$/.test(pathname) && !pathname.endsWith('.test.mjs'));

// --- Saving the inventory from the panel ------------------------------------
// PUT /singles.json writes the file on disk, so the panel no longer needs the
// download-and-replace step. Writing is a privilege, so three checks gate it:
// - the client is this machine (the server listens on every interface);
// - Host is this server by name, so a DNS-rebinding page cannot pose as it;
// - Origin is this server, so no other website can post to localhost from the
//   user's browser. A JSON content type also forces a CORS preflight, which
//   this server never answers.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_BODY = 2 * 1024 * 1024;

export function canWriteInventory({ remoteAddress, origin, host, contentType }) {
  const hosts = [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`];
  return LOOPBACK.has(remoteAddress)
    && hosts.includes(host)
    && origin === `http://${host}`
    && String(contentType ?? '').toLowerCase().startsWith('application/json');
}

// Same rules as npm run prices, so the panel can never write a file it rejects.
export function parseInventoryBody(text) {
  let inventory;
  try {
    inventory = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['el cuerpo no es JSON válido'] };
  }
  const errors = validateSingles(inventory);
  return errors.length ? { ok: false, errors } : { ok: true, inventory };
}

const sendJson = (res, status, body) =>
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));

async function saveInventory(req, res) {
  const allowed = canWriteInventory({
    remoteAddress: req.socket.remoteAddress,
    origin: req.headers.origin,
    host: req.headers.host,
    contentType: req.headers['content-type'],
  });
  if (!allowed) return sendJson(res, 403, { ok: false, errors: ['solo el panel local puede guardar el inventario'] });
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > MAX_BODY) return sendJson(res, 413, { ok: false, errors: ['el inventario es demasiado grande'] });
  }
  const parsed = parseInventoryBody(text);
  if (!parsed.ok) return sendJson(res, 400, parsed);
  // Write a temp file and rename it over the real one, so a crash mid-write
  // never leaves a truncated singles.json behind.
  const target = join(ROOT, 'singles.json');
  const temp = `${target}.tmp`;
  try {
    await writeFile(temp, serializeInventory(parsed.inventory));
    await rename(temp, target);
  } catch (err) {
    return sendJson(res, 500, { ok: false, errors: [`no se pudo escribir singles.json: ${err.message}`] });
  }
  return sendJson(res, 200, { ok: true, entries: parsed.inventory.length });
}

async function proxy(res, pathname) {
  const url = proxyTargetUrl(pathname);
  let upstream;
  try {
    upstream = await fetch(url, { headers: HEADERS });
  } catch (err) {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' }).end(`tcgcsv.com unreachable: ${err.message}`);
    return;
  }
  const body = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, {
    'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
    // The panel and the server share an origin, but keep this explicit.
    'access-control-allow-origin': '*',
  }).end(body);
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (req.method === 'PUT' && pathname === '/singles.json') {
    await saveInventory(req, res);
    return;
  }
  if (isAllowedProxyRequest(req.url)) {
    await proxy(res, pathname);
    return;
  }
  if (isPublicPath(pathname)) {
    await serveStatic(res, pathname);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
});

const port = Number(process.env.PORT ?? 8000);

// Start the listener only when this file is run directly.
// Importing it (as the test does) must expose the pure helpers without binding a port.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(port, () => {
    console.log(`inventario local: http://localhost:${port}/admin.html`);
    console.log(`catálogo público: http://localhost:${port}/`);
    console.log(`proxy de precios: ${BASE} (solo rutas /tcgplayer/... y /last-updated.txt)`);
  });
}

export { server, port };