import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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