import { readFile, writeFile, rename } from 'node:fs/promises';
import { pickPrice, toCop } from './price.mjs';

const BATCH_SIZE = 50;
const root = new URL('../', import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(new URL(name, root), 'utf8'));

async function getUsdToCop(fallback) {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rate = (await res.json()).rates?.COP;
    if (!rate) throw new Error('COP rate missing');
    return rate;
  } catch (err) {
    console.warn(`warning: exchange rate unavailable (${err.message}), using fallback ${fallback}`);
    return fallback;
  }
}

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

const singles = await readJson('singles.json');
const config = await readJson('config.json');
const usdToCop = await getUsdToCop(config.fallbackUsdToCop);

let cards;
try {
  cards = await fetchCards([...new Set(singles.map((s) => s.id))]);
} catch (err) {
  console.error(`error: card fetch failed (${err.message}); catalog.json left untouched`);
  process.exit(1);
}

const items = [];
for (const single of singles) {
  const card = cards.get(single.id);
  if (!card) {
    console.warn(`warning: card ${single.id} not found, skipped`);
    continue;
  }
  const picked = pickPrice(card.tcgplayer?.prices, single.variant);
  const manual = Number.isInteger(single.price);
  items.push({
    id: card.id,
    name: card.name,
    set: card.set.name,
    number: card.number,
    rarity: card.rarity ?? null,
    image: card.images.small,
    imageLarge: card.images.large,
    variant: picked?.variant ?? single.variant ?? null,
    condition: single.condition ?? 'NM',
    qty: single.qty,
    usd: picked?.usd ?? null,
    priceCop: manual ? single.price : toCop(picked?.usd ?? null, usdToCop, config),
    manual,
    tcgplayerUrl: card.tcgplayer?.url ?? null,
    priceUpdatedAt: card.tcgplayer?.updatedAt ?? null,
  });
}

const out = new URL('catalog.json', root);
const tmp = new URL('catalog.json.tmp', root);
const catalog = { generatedAt: new Date().toISOString(), usdToCop, items };
await writeFile(tmp, JSON.stringify(catalog, null, 2) + '\n');
await rename(tmp, out);
console.log(`catalog.json: ${items.length} items, 1 USD = ${usdToCop} COP`);
