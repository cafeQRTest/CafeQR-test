export function round2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function roundP(v, p = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  const factor = Math.pow(10, p);
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

export function normalizeQty(v, { allowZero = false, precision = 2 } = {}) {
  if (v === '' || v === null || v === undefined) return null;
  const n = roundP(v, precision);
  if (!Number.isFinite(n)) return null;
  if (allowZero && n === 0) return 0;
  if (n <= 0) return null;
  return n;
}

export function formatQtyP(v, p = 2) {
  const n = roundP(v, p);
  // Remove trailing zeros for a cleaner look, but keep at least 1 decimal if p > 0?
  // Or just return as is? User wants precision.
  // If p is 4, 1.5555 should show 1.5555.
  // If 1.5000, maybe show 1.5? The user is complaining about 1.5600 (rounded value with trailing zeros).
  
  // First, standard toFixed to ensure precision
  return Number.isFinite(n) ? n.toFixed(p).replace(/\.?0+$/, "") : (0).toFixed(p).replace(/\.?0+$/, "");
}

export function formatQty2(v) {
  return formatQtyP(v, 2);
}
