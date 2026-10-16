import { pickPrice, toCop } from './price.mjs';

// TCGPlayer category id per game, as used by tcgcsv.com.
export const GAMES = { pokemon: 3, magic: 1, onepiece: 68 };

const isPositiveNumber = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const isPositiveInteger = (n) => Number.isInteger(n) && n > 0;
const label = (s) => `card ${s.game}/${s.product}`;

// Key of a fetched product in the map passed to buildItems.
export const cardKey = (s) => `${s.game}/${s.group}/${s.product}`;

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
    const entry = `singles.json entry ${i}`;
    if (!Object.hasOwn(GAMES, s?.game ?? '')) {
      errors.push(`${entry}: game must be one of ${Object.keys(GAMES).join(', ')} (got ${JSON.stringify(s?.game)})`);
      return;
    }
    if (!isPositiveInteger(s.group)) errors.push(`${entry}: group must be a positive integer (got ${JSON.stringify(s.group)})`);
    if (!isPositiveInteger(s.product)) {
      errors.push(`${entry}: product must be a positive integer (got ${JSON.stringify(s.product)})`);
      return;
    }
    if (!isPositiveInteger(s.qty)) errors.push(`${label(s)}: qty must be a positive integer (got ${JSON.stringify(s.qty)})`);
    if (s.variant != null && (typeof s.variant !== 'string' || s.variant === '')) {
      errors.push(`${label(s)}: variant must be a non-empty string (got ${JSON.stringify(s.variant)})`);
    }
    if (s.price != null && !isPositiveInteger(s.price)) {
      errors.push(`${label(s)}: price must be a positive integer in COP (got ${JSON.stringify(s.price)})`);
    }
    const key = `${s.game}/${s.product}/${s.variant ?? ''}`;
    if (seen.has(key)) errors.push(`${label(s)}: duplicate entry in singles.json${s.variant ? ` (variant ${s.variant})` : ''}`);
    seen.add(key);
  });
  return errors;
}

const extended = (product, name) => product.extendedData?.find((d) => d.name === name)?.value ?? null;

// TCGPlayer appends the card number to some names ("Ethan's Ho-Oh ex - 230/182").
const cleanName = (name, number) => (number && name.endsWith(` - ${number}`) ? name.slice(0, -(number.length + 3)) : name);

// The CDN serves the same image at other sizes; verified for _400w and _in_1000x1000.
// Presale products can have imageCount 0, and then the CDN answers 403.
const sized = (product, suffix) => (product.imageCount === 0 ? null : product.imageUrl?.replace(/_200w\.jpg$/, suffix) ?? null);

// Builds catalog items from the inventory and the fetched cards
// (Map of cardKey -> { product, prices, set }). updatedAt is the TCGCSV dump date.
// Returns every problem found in errors; callers must not publish when errors is non-empty.
export function buildItems(singles, cards, config, updatedAt) {
  const items = [];
  const errors = [];
  for (const single of singles) {
    const card = cards.get(cardKey(single));
    if (!card) {
      errors.push(`${label(single)} not found on tcgcsv.com`);
      continue;
    }
    const manual = single.price != null;
    const picked = pickPrice(card.prices, single.variant);
    if (!picked && !manual) {
      errors.push(`${label(single)} has no TCGPlayer price; set a manual "price"`);
      continue;
    }
    const { product } = card;
    const number = extended(product, 'Number');
    items.push({
      id: `${single.game}-${single.product}`,
      game: single.game,
      name: cleanName(product.name, number),
      set: card.set,
      number,
      rarity: extended(product, 'Rarity'),
      image: sized(product, '_400w.jpg'),
      imageLarge: sized(product, '_in_1000x1000.jpg'),
      variant: single.variant ?? picked?.variant ?? null,
      // Variant whose TCGPlayer price was used; differs from variant when it had no price.
      priceVariant: picked?.variant ?? null,
      condition: single.condition ?? 'NM',
      qty: single.qty,
      usd: picked?.usd ?? null,
      priceCop: manual ? single.price : toCop(picked.usd, config.usdToCop, config),
      manual,
      tcgplayerUrl: product.url ?? null,
      priceUpdatedAt: picked ? updatedAt : null,
    });
  }
  return { items, errors };
}

// True when anything other than generatedAt differs.
export function catalogChanged(prev, next) {
  const strip = (c) => JSON.stringify({ ...c, generatedAt: undefined });
  return !prev || strip(prev) !== strip(next);
}
