import { validateSingles } from './catalog.mjs';

// Pure inventory helpers for the local admin panel. Every function is immutable:
// the input array is never mutated, a new array is returned instead.

// Does this entry have the identity the caller asked for?
// A missing variant matches only an entry that also has no variant.
const matches = (entry, { game, product, variant }) =>
  entry.game === game && entry.product === product && entry.variant === (variant ?? undefined);

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
export function sellCard(inventory, { game, product, variant }) {
  const keys = { game, product, variant };
  const index = inventory.findIndex((entry) => matches(entry, keys));
  if (index < 0) return { ok: false, errors: [`no inventory entry for ${label(keys)}`] };
  if (inventory[index].qty <= 1) return { ok: true, inventory: inventory.filter((_, i) => i !== index) };
  return {
    ok: true,
    inventory: inventory.map((entry, i) => (i === index ? { ...entry, qty: entry.qty - 1 } : entry)),
  };
}

// Exact text of the singles.json file to download: 2-space indent plus a trailing newline.
export function serializeInventory(inventory) {
  return JSON.stringify(inventory, null, 2) + '\n';
}
