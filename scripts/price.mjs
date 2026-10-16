const PREFERRED_VARIANTS = ['normal', 'holofoil', 'reverseHolofoil'];

const usdOf = (p) => p?.market ?? p?.mid ?? null;

// Returns { variant, usd } for the requested variant if it has a price, otherwise the first
// variant with a price (normal, holofoil, reverseHolofoil, then any other key), or null.
export function pickPrice(prices, variant) {
  if (!prices) return null;
  const order = [variant, ...PREFERRED_VARIANTS, ...Object.keys(prices)];
  const chosen = order.find((k) => k && usdOf(prices[k]) != null);
  return chosen ? { variant: chosen, usd: usdOf(prices[chosen]) } : null;
}

export function toCop(usd, rate, { minPriceCop, margin, roundToCop }) {
  if (usd == null) return minPriceCop;
  const rounded = Math.ceil((usd * rate * margin) / roundToCop) * roundToCop;
  return Math.max(minPriceCop, rounded);
}
