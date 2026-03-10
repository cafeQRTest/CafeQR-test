function formatQuantity(quantity) {
  const value = Number(quantity);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function normalizeOrderItemLabel(item) {
  const source = item && typeof item === 'object' ? item : {};
  const name = String(
    source.displayName ||
    source.name ||
    source.item_name ||
    source.menu_item_name ||
    ''
  ).trim();

  if (!name) return '';

  const variantName = String(
    source.variant_name ||
    source.selectedVariant?.variant_name ||
    ''
  ).trim();
  const qty = formatQuantity(source.quantity ?? source.qty ?? 1);

  return `${name}${variantName ? ` (${variantName})` : ''}${qty ? ` x${qty}` : ''}`;
}

export function buildOrderItemsSummary(orderItems, { maxItems = Infinity } = {}) {
  const labels = (Array.isArray(orderItems) ? orderItems : [])
    .map(normalizeOrderItemLabel)
    .filter(Boolean);

  if (!labels.length) return '';

  const visible = labels.slice(0, maxItems);
  const remaining = labels.length - visible.length;
  return remaining > 0
    ? `${visible.join(', ')} +${remaining} more`
    : visible.join(', ');
}
