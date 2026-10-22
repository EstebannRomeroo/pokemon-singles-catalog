// Order cart rules for index.html, kept pure so the test runner can exercise them.
// A cart is a plain { [catalogItemId]: copies } object: it stores no prices, so a
// cart saved before a price refresh always shows the current catalog price.

const isCopies = (n) => Number.isInteger(n) && n > 0;

// One more copy, never past the stock the catalog says is available.
export function addToCart(cart, item) {
  const current = cart[item.id] ?? 0;
  if (current >= item.qty) return { cart, added: false };
  return { cart: { ...cart, [item.id]: current + 1 }, added: true };
}

// Sets a line to an exact quantity; zero or less removes it. Spreading the whole
// cart keeps the line where it was, so it does not jump to the end while edited.
export function setCartQty(cart, item, qty) {
  const clamped = Math.min(Math.trunc(qty), item.qty);
  if (clamped > 0) return { ...cart, [item.id]: clamped };
  const { [item.id]: _, ...rest } = cart;
  return rest;
}

// A stored cart can outlive the catalog it was built from: cards sell out, stock
// drops, and browser storage can hold anything. Only valid, available lines survive.
export function reconcileCart(cart, items) {
  if (!cart || typeof cart !== 'object' || Array.isArray(cart)) return {};
  const stock = new Map(items.map((item) => [item.id, item.qty]));
  const next = {};
  for (const [id, copies] of Object.entries(cart)) {
    const available = stock.get(id);
    if (!isCopies(copies) || !isCopies(available)) continue;
    next[id] = Math.min(copies, available);
  }
  return next;
}

export function cartLines(cart, items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return Object.entries(cart)
    .filter(([id]) => byId.has(id))
    .map(([id, qty]) => {
      const item = byId.get(id);
      return { item, qty, subtotal: item.priceCop * qty };
    });
}

export const cartCount = (cart) => Object.values(cart).reduce((sum, n) => sum + n, 0);

// The text the buyer pastes into the chat. Each line carries what the seller needs
// to find the exact copy: set, number, variant, condition and language.
export function orderMessage(lines, formatCop) {
  const describe = ({ item }) => {
    const where = [item.set, item.number ? `#${String(item.number).replace(/^#/, '')}` : ''].filter(Boolean).join(' ');
    return [where, item.variant, item.condition, item.language].filter(Boolean).join(' · ');
  };
  const copies = lines.reduce((sum, line) => sum + line.qty, 0);
  const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
  return [
    'Hola, quiero hacer este pedido:',
    ...lines.map((line) => `- ${line.qty} × ${line.item.name} (${describe(line)}) — ${formatCop(line.subtotal)}`),
    `Total: ${copies} ${copies === 1 ? 'carta' : 'cartas'} — ${formatCop(total)}`,
  ].join('\n');
}
