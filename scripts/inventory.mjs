import { validateSingles } from './catalog.mjs';

const isPositiveInteger = (n) => Number.isInteger(n) && n > 0;

// Pure inventory helpers for the local admin panel. Every function is immutable:
// the input array is never mutated, a new array is returned instead.

// Does this entry have the identity the caller asked for?
// A missing variant matches only an entry that also has no variant; null and undefined
// both mean "no variant" and must compare equal, or a `"variant": null` row is unmatchable.
const matches = (entry, { game, product, variant }) =>
  entry.game === game && entry.product === product && (entry.variant ?? null) === (variant ?? null);

const label = ({ game, product }) => `card ${game}/${product}`;

// Appends one card. The whole candidate inventory goes through validateSingles,
// so an invalid or duplicate card is reported with the same rules as singles.json.
export function addCard(inventory, card) {
  const next = [...inventory, card];
  const errors = validateSingles(next);
  return errors.length ? { ok: false, errors } : { ok: true, inventory: next };
}

// Removes the matching entry (game + product + variant) from the inventory.
export function removeCard(inventory, { game, product, variant }) {
  const keys = { game, product, variant };
  const index = inventory.findIndex((entry) => matches(entry, keys));
  if (index < 0) return { ok: false, errors: [`no inventory entry for ${label(keys)}`] };
  return { ok: true, inventory: inventory.filter((_, i) => i !== index) };
}

// Marks one unit as sold: qty drops by one and the entry disappears when it reaches zero.
// A malformed qty (missing, non-numeric) is reported instead of silently turning into null.
export function sellCard(inventory, { game, product, variant }) {
  const keys = { game, product, variant };
  const index = inventory.findIndex((entry) => matches(entry, keys));
  if (index < 0) return { ok: false, errors: [`no inventory entry for ${label(keys)}`] };
  if (!isPositiveInteger(inventory[index].qty)) {
    return { ok: false, errors: [`${label(keys)}: qty must be a positive integer (got ${JSON.stringify(inventory[index].qty)})`] };
  }
  if (inventory[index].qty === 1) return { ok: true, inventory: inventory.filter((_, i) => i !== index) };
  return {
    ok: true,
    inventory: inventory.map((entry, i) => (i === index ? { ...entry, qty: entry.qty - 1 } : entry)),
  };
}

// Exact text of the singles.json file to download: 2-space indent plus a trailing newline.
export function serializeInventory(inventory) {
  return JSON.stringify(inventory, null, 2) + '\n';
}
