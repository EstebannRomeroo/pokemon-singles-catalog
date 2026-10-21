// The review tray: cards the user staged to verify (with an image) before any of
// them reaches the inventory.
//
// Why it exists: the user added cards that were not the ones they meant to. The
// set and printed number were not enough to be sure, so the tray holds staged
// cards until they are reviewed together and committed in one action.
//
// The logic is pure on purpose. The panel is inline HTML and cannot be exercised
// by the test runner, so everything that decides an outcome lives here instead.

// A staged card is identified by game + product, the same pair the inventory uses,
// so "already in the inventory" and "already staged" can be compared directly.
export const stageKey = (card) => `${card.game}-${card.product}`;

// The entry the inventory helper expects, derived from a staged card. Optional
// fields are omitted rather than written as null, matching how the panel builds
// an entry today.
export function toEntry(staged) {
  const entry = {
    game: staged.game,
    group: staged.group,
    product: staged.product,
    qty: staged.qty ?? 1,
    condition: staged.condition ?? 'NM',
  };
  if (staged.variant) entry.variant = staged.variant;
  if (staged.price != null) entry.price = staged.price;
  entry.language = staged.language ?? 'EN';
  return entry;
}

// Returns a new tray plus a reason when the card cannot be staged. A duplicate is
// reported instead of silently merged: the user is verifying specific cards, and
// folding two into one would hide that they searched the same card twice.
export function stageCard(tray, staged) {
  const key = stageKey(staged);
  if (!staged.game || staged.product == null) {
    return { tray, added: false, reason: 'La carta no tiene juego o producto.' };
  }
  if (tray.some((card) => stageKey(card) === key)) {
    return { tray, added: false, reason: `${staged.name} ya está en la bandeja.` };
  }
  return { tray: [...tray, staged], added: true, reason: '' };
}

export function unstageCard(tray, key) {
  return tray.filter((card) => stageKey(card) !== key);
}

// The inventory expresses multiplicity through qty: two entries with the same
// game/product/variant are rejected by validateSingles as duplicates. Staging a
// card that is already owned therefore means "one more copy", never a second row.
export const ownedKey = (card) => `${card.game}-${card.product}||${card.variant ?? ''}`;

export function mergeIntoTray(tray, staged) {
  const key = stageKey(staged);
  const index = tray.findIndex((card) => stageKey(card) === key);
  if (index === -1) return tray;
  const merged = [...tray];
  // Variant and price are per-entry fields: if they differ, the cards are not the
  // same row and merging would silently lose one of them.
  if ((merged[index].variant ?? '') !== (staged.variant ?? '')) return tray;
  if ((merged[index].price ?? null) !== (staged.price ?? null)) return tray;
  merged[index] = { ...merged[index], qty: (merged[index].qty ?? 1) + (staged.qty ?? 1) };
  return merged;
}

// Commits the tray into the inventory in one pass. An entry that already exists
// has its qty raised instead of appended, because validateSingles rejects two
// entries with the same game/product/variant as duplicates. Failures are
// collected per card and never block the others.
export function commitTray(tray, inventory, addCard, validate) {
  let next = inventory;
  const added = [];
  const merged = [];
  const errors = [];

  for (const card of tray) {
    const entry = toEntry(card);
    const index = next.findIndex((existing) => ownedKey(existing) === ownedKey(entry));

    if (index >= 0) {
      // Already owned: raise the quantity of the existing row.
      const updated = [...next];
      updated[index] = { ...updated[index], qty: (updated[index].qty ?? 1) + (entry.qty ?? 1) };
      const problems = validate(updated);
      if (problems.length) { errors.push(...problems); continue; }
      next = updated;
      merged.push(card.name);
      continue;
    }

    const result = addCard(next, entry);
    if (!result.ok) { errors.push(...result.errors); continue; }
    next = result.inventory;
    added.push(card.name);
  }

  return { inventory: next, added, merged, errors };
}

// The tray holds one entry per card, so a card already in the inventory is still
// allowed to be staged (the user may be adding a second copy). This only reports
// the overlap so the panel can warn before committing.
export function overlapWithInventory(tray, inventory) {
  const owned = new Set(inventory.map((entry) => `${entry.game}-${entry.product}`));
  return tray.filter((card) => owned.has(stageKey(card))).map((card) => card.name);
}
