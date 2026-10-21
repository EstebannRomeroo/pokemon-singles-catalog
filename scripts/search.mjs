// Inventory search, kept pure so `npm test` can exercise it without a DOM.
// admin.html wires the input; every matching rule lives here.

// Diacritic-insensitive lowercase, so "Ángel" matches "angel" and "Pokémon"
// matches "pokemon". NFD splits each accented letter into letter + combining
// mark, and the range strips the marks that remain.
export function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Every field a search may match. Kept in one place so a row and its search
// haystack cannot drift apart.
// `gameLabel` is passed in because the display names live in the page; the
// module only needs the already-resolved label.
export function searchHaystack(entry, item, gameLabel = '') {
  return fold([
    item?.name,
    entry?.variant,
    entry?.condition,
    item?.set,
    item?.number,
    item?.rarity,
    gameLabel,
    item?.language ?? entry?.language,
  ].filter(Boolean).join(' '));
}

// An empty query matches everything, so an unfiltered table is one no-op call.
export function matchesSearch(entry, item, foldedQuery, gameLabel = '') {
  const query = typeof foldedQuery === 'string' && foldedQuery !== ''
    ? foldedQuery
    : fold(foldedQuery);
  return query === '' || searchHaystack(entry, item, gameLabel).includes(query);
}

// The entries the table should show. Filtering produces the visible list
// instead of hiding rows, so the DOM always equals what the user can see and
// a sell or a remove can never target an invisible row.
export function filterInventory(inventory, itemFor, foldedQuery, gameLabelFor = () => '') {
  if (!Array.isArray(inventory)) return [];
  const query = typeof foldedQuery === 'string' ? foldedQuery.trim() : '';
  if (query === '') return inventory.slice();
  return inventory.filter((entry) => matchesSearch(entry, itemFor(entry), query, gameLabelFor(entry)));
}

// The status line next to the box. Returns empty text when nothing is filtered,
// so the label disappears instead of reading "97 de 97".
export function hitsLabel(visibleCount, totalCount) {
  if (visibleCount === totalCount) return '';
  return `${visibleCount} de ${totalCount} ${totalCount === 1 ? 'entrada' : 'entradas'}`;
}
