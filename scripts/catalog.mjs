import { pickPrice, toCop } from './price.mjs';

const isPositiveNumber = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const isPositiveInteger = (n) => Number.isInteger(n) && n > 0;

export function validateConfig(config) {
  return ['usdToCop', 'minPriceCop', 'margin', 'roundToCop']
    .filter((key) => !isPositiveNumber(config?.[key]))
    .map((key) => `config.json ${key} must be a positive number (got ${JSON.stringify(config?.[key])})`);
}

export function validateSingles(singles) {
  if (!Array.isArray(singles)) return ['singles.json must be an array'];
  const errors = [];
  const seen = new Set();
  singles.forEach((s, i) => {
    if (typeof s?.id !== 'string' || s.id === '') {
      errors.push(`singles.json entry ${i}: id must be a non-empty string`);
      return;
    }
    if (!isPositiveInteger(s.qty)) errors.push(`card ${s.id}: qty must be a positive integer (got ${JSON.stringify(s.qty)})`);
    if (seen.has(s.id)) errors.push(`card ${s.id}: duplicate id in singles.json`);
    seen.add(s.id);
  });
  return errors;
}

// Builds catalog items from the inventory and the fetched cards (Map of id -> card).
// Returns every problem found in errors; callers must not publish when errors is non-empty.
export function buildItems(singles, cards, config) {
  const items = [];
  const errors = [];
  for (const single of singles) {
    const card = cards.get(single.id);
    if (!card) {
      errors.push(`card ${single.id} not found on pokemontcg.io`);
      continue;
    }
    const manual = single.price != null;
    if (manual && !isPositiveInteger(single.price)) {
      errors.push(`card ${single.id}: price must be a positive integer in COP (got ${JSON.stringify(single.price)})`);
      continue;
    }
    const picked = pickPrice(card.tcgplayer?.prices, single.variant);
    if (!picked && !manual) {
      errors.push(`card ${single.id} has no TCGPlayer price; set a manual "price"`);
      continue;
    }
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
      priceCop: manual ? single.price : toCop(picked.usd, config.usdToCop, config),
      manual,
      tcgplayerUrl: card.tcgplayer?.url ?? null,
      priceUpdatedAt: card.tcgplayer?.updatedAt ?? null,
    });
  }
  return { items, errors };
}

// True when anything other than generatedAt differs.
export function catalogChanged(prev, next) {
  const strip = (c) => JSON.stringify({ ...c, generatedAt: undefined });
  return !prev || strip(prev) !== strip(next);
}
