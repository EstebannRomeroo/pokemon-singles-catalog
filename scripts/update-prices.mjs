import { readFile, writeFile, rename } from 'node:fs/promises';
import { GAMES, cardKey, validateConfig, validateSingles, buildItems, catalogChanged } from './catalog.mjs';

const BASE = 'https://tcgcsv.com';
// tcgcsv.com answers 401 to the default Node fetch User-Agent.
const HEADERS = { 'User-Agent': 'singles' };
const root = new URL('../', import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(new URL(name, root), 'utf8'));

// Retry 5xx and network errors a few times with a growing delay; 4xx is final.
async function fetchWithRetry(url, attempts = 4) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { headers: HEADERS }).catch((err) => ({ ok: false, status: err.message }));
    const retryable = !res.ok && !(res.status >= 400 && res.status < 500);
    if (!retryable || i >= attempts) return res;
    console.warn(`warning: tcgcsv.com ${res.status}, retry ${i}/${attempts - 1}`);
    await new Promise((r) => setTimeout(r, 2000 * i));
  }
}

// 404 means the category or group does not exist; its cards are then reported as not found.
async function getResults(path) {
  const res = await fetchWithRetry(`${BASE}${path}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`tcgcsv.com HTTP ${res.status} for ${path}`);
  return (await res.json()).results;
}

async function getText(path) {
  const res = await fetchWithRetry(`${BASE}${path}`);
  if (!res.ok) throw new Error(`tcgcsv.com HTTP ${res.status} for ${path}`);
  return (await res.text()).trim();
}

// One groups list per game, then products + prices once per (game, group).
async function fetchCards(singles) {
  const cards = new Map();
  for (const game of new Set(singles.map((s) => s.game))) {
    const cat = GAMES[game];
    const groupNames = new Map((await getResults(`/tcgplayer/${cat}/groups`)).map((g) => [g.groupId, g.name]));
    for (const group of new Set(singles.filter((s) => s.game === game).map((s) => s.group))) {
      const [products, prices] = await Promise.all([
        getResults(`/tcgplayer/${cat}/${group}/products`),
        getResults(`/tcgplayer/${cat}/${group}/prices`),
      ]);
      for (const product of products) {
        cards.set(cardKey({ game, group, product: product.productId }), {
          product,
          prices: prices.filter((p) => p.productId === product.productId),
          set: groupNames.get(group) ?? null,
        });
      }
    }
  }
  return cards;
}

function fail(errors) {
  console.error(`error: ${errors.length} problem(s), catalog.json left untouched:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const singles = await readJson('singles.json');
const config = await readJson('config.json');
const inputErrors = [...validateConfig(config), ...validateSingles(singles)];
if (inputErrors.length) fail(inputErrors);

let cards, updatedAt;
try {
  [cards, updatedAt] = await Promise.all([fetchCards(singles), getText('/last-updated.txt')]);
} catch (err) {
  fail([`card fetch failed (${err.message})`]);
}

const { items, errors } = buildItems(singles, cards, config, updatedAt);
if (errors.length) fail(errors);

const out = new URL('catalog.json', root);
const tmp = new URL('catalog.json.tmp', root);
const { usdToCop } = config;
const prev = await readFile(out, 'utf8').then(JSON.parse, () => null);
const catalog = { generatedAt: new Date().toISOString(), usdToCop, items };
if (!catalogChanged(prev, catalog)) {
  console.log(`catalog.json unchanged (${items.length} items, 1 USD = ${usdToCop} COP)`);
} else {
  await writeFile(tmp, JSON.stringify(catalog, null, 2) + '\n');
  await rename(tmp, out);
  console.log(`catalog.json: ${items.length} items, 1 USD = ${usdToCop} COP`);
}
