export function round2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function normalizeQty(v, { allowZero = false } = {}) {
  if (v === '' || v === null || v === undefined) return null;
  const n = round2(v);
  if (!Number.isFinite(n)) return null;
  if (allowZero && n === 0) return 0;
  if (n <= 0) return null;
  return n;
}

export function formatQty2(v) {
  const n = round2(v);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}
