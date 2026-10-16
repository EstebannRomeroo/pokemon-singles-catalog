// TCGCSV subTypeName values, in the order used when the requested variant has no price.
const PREFERRED_VARIANTS = ['Normal', 'Holofoil', 'Reverse Holofoil', 'Foil'];

const usdOf = (row) => row?.marketPrice ?? row?.midPrice ?? null;

// rows: TCGCSV price rows for one product (one per subTypeName).
// Returns { variant, usd } for the requested variant if it has a price, otherwise the first
// priced subtype (Normal, Holofoil, Reverse Holofoil, Foil, then any other), or null.
export function pickPrice(rows, variant) {
  if (!rows?.length) return null;
  const bySubType = new Map(rows.map((r) => [r.subTypeName, r]));
  const order = [variant, ...PREFERRED_VARIANTS, ...bySubType.keys()];
  const chosen = order.find((k) => k && usdOf(bySubType.get(k)) != null);
  return chosen ? { variant: chosen, usd: usdOf(bySubType.get(chosen)) } : null;
}

export function toCop(usd, rate, { minPriceCop, margin, roundToCop }) {
  if (usd == null) return minPriceCop;
  const rounded = Math.ceil((usd * rate * margin) / roundToCop) * roundToCop;
  return Math.max(minPriceCop, rounded);
}
