const PREFERRED_VARIANTS = ['normal', 'holofoil', 'reverseHolofoil'];

// Returns { variant, usd } for the requested variant (or the best available one), or null.
export function pickPrice(prices, variant) {
  if (!prices) return null;
  const keys = Object.keys(prices);
  const chosen = variant && prices[variant]
    ? variant
    : PREFERRED_VARIANTS.find((k) => prices[k]) ?? keys[0];
  if (!chosen) return null;
  const usd = prices[chosen].market ?? prices[chosen].mid ?? null;
  return usd == null ? null : { variant: chosen, usd };
}

export function toCop(usd, rate, { minPriceCop, margin, roundToCop }) {
  if (usd == null) return minPriceCop;
  const rounded = Math.ceil((usd * rate * margin) / roundToCop) * roundToCop;
  return Math.max(minPriceCop, rounded);
}
