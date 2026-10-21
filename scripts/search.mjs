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

// --- Add-card resolution ----------------------------------------------------
// The add form asks for a set and then a card. TCGCSV exposes no name search
// and no category-wide product list (both 404), so a card can only be found
// inside one already-loaded set. These helpers cover the two steps.

// Sets are matched by name and abbreviation, so "POR" and "perfect order"
// both find the same set. Diacritics are folded like every other search.
export function setHaystack(group) {
  return fold([group?.name, group?.abbreviation].filter(Boolean).join(' '));
}

export function filterGroups(groups, query) {
  if (!Array.isArray(groups)) return [];
  const needle = fold(query);
  if (needle === '') return groups.slice();
  return groups.filter((group) => setHaystack(group).includes(needle));
}

// "083", "83" and "083/088" all mean card 83: the printed collector number may
// carry a denominator that the product data does not.
export function numberQuery(raw) {
  return String(raw ?? '').trim().split('/')[0].trim();
}

// A query is a number lookup when it is only digits. Anything with a letter is
// treated as a name, so "Cloud, Ex-SOLDIER" never becomes a number search.
export function isNumberQuery(raw) {
  const value = numberQuery(raw);
  return value !== '' && /^\d+$/.test(value);
}

// Matches products by name, so a card can be found without its number.
// `cleanName` is TCGCSV's punctuation-free form; matching both means "ex solider"
// and "Ex-SOLDIER" behave the same.
export function filterProductsByName(products, query) {
  if (!Array.isArray(products)) return [];
  const needle = fold(query);
  if (needle === '') return [];
  return products.filter((product) => fold([product?.name, product?.cleanName].filter(Boolean).join(' ')).includes(needle));
}

// Chooses the lookup the user asked for. A digits-only query resolves by number
// exactly as before; anything else searches names within the loaded set.
export function resolveQueryKind(raw) {
  return isNumberQuery(raw) ? 'number' : 'name';
}

// --- Live card search --------------------------------------------------------
// The card field resolves as you type, so two things must be bounded: how often
// the search runs, and how many matches reach the DOM.

// How long to wait after the last keystroke. Short enough to feel immediate,
// long enough that typing "cloud" runs one search instead of five. Measured at
// 1.5 ms per search over 2708 products, so the delay is about focus, not cost.
export const SEARCH_DELAY_MS = 250;

// The most rows to render. A single letter can match 1236 cards, and 1236
// buttons is a wall, not a list. Shows this many and says how many were hidden.
export const MAX_RESULTS = 40;

// One shared timer per owner, so a new keystroke replaces the pending run
// instead of racing it. `setTimer`/`clearTimer` are injectable so the behavior
// is testable without waiting on real time.
export function debounce(fn, delay = SEARCH_DELAY_MS, setTimer = setTimeout, clearTimer = clearTimeout) {
  let pending = null;
  return (...args) => {
    if (pending !== null) clearTimer(pending);
    pending = setTimer(() => {
      pending = null;
      fn(...args);
    }, delay);
  };
}

// Caps what the DOM receives and reports what was left out, so the count in the
// note stays truthful even when the list is shortened.
export function limitMatches(matches, max = MAX_RESULTS) {
  const all = Array.isArray(matches) ? matches : [];
  const shown = all.slice(0, max);
  return { shown, hidden: all.length - shown.length, total: all.length };
}

// The note above the results. Wording follows what was searched, so a number
// lookup and a name lookup never describe the same list the same way.
export function matchesNote(kind, total, hidden) {
  const what = kind === 'number' ? (total === 1 ? 'número coincide' : 'números coinciden') : (total === 1 ? 'carta coincide' : 'cartas coinciden');
  const base = `${total} ${what}.`;
  if (hidden <= 0) return base;
  return `${base} Se muestran ${MAX_RESULTS}; afina la búsqueda para ver las demás.`;
}
