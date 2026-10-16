import { readFile, writeFile, rename } from 'node:fs/promises';
import { validateConfig, validateSingles, buildItems, catalogChanged } from './catalog.mjs';

const BATCH_SIZE = 50;
const root = new URL('../', import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(new URL(name, root), 'utf8'));

// pokemontcg.io intermittently returns 5xx, so retry a few times with a growing delay.
async function fetchWithRetry(url, options, attempts = 4) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, options).catch((err) => ({ ok: false, status: err.message }));
    if (res.ok || i >= attempts) return res;
    console.warn(`warning: pokemontcg.io ${res.status}, retry ${i}/${attempts - 1}`);
    await new Promise((r) => setTimeout(r, 2000 * i));
  }
}

async function fetchCards(ids) {
  const headers = process.env.POKEMONTCG_API_KEY ? { 'X-Api-Key': process.env.POKEMONTCG_API_KEY } : {};
  const cards = new Map();
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const q = ids.slice(i, i + BATCH_SIZE).map((id) => `id:${id}`).join(' OR ');
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=250`;
    const res = await fetchWithRetry(url, { headers });
    if (!res.ok) throw new Error(`pokemontcg.io HTTP ${res.status}`);
    for (const card of (await res.json()).data) cards.set(card.id, card);
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

let cards;
try {
  cards = await fetchCards(singles.map((s) => s.id));
} catch (err) {
  fail([`card fetch failed (${err.message})`]);
}

const { items, errors } = buildItems(singles, cards, config);
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
