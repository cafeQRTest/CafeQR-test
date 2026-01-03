// utils/printUtils.js

const ESC = "\x1b";
const GS = "\x1d";

function b(n) {
  return String.fromCharCode(n & 0xff);
}
function b2(n) {
  return b(n & 0xff) + b((n >> 8) & 0xff);
}

function toDisplayItems(order) {
  if (Array.isArray(order?.items) && order.items.length) return order.items;

  if (Array.isArray(order?.order_items) && order.order_items.length) {
    return order.order_items.map((oi) => ({
      name: oi.menu_items?.name || oi.item_name || "Item",
      quantity: oi.quantity,
      price: oi.price,
      discount_amount: oi.discount_amount || 0,
      uom: oi.uom_short_code || "",
      uom_short_code: oi.uom_short_code || "",
      uom_precision: oi.uom_precision ?? 0,
    }));
  }
  return [];
}

function getOrderTypeLabel(order) {
  if (!order) return "";
  if (order.table_number && order.table_number !== null) return `Table ${order.table_number}`;
  if (order.order_type === "parcel") return "Parcel";
  return "";
}

function wrapText(text, width) {
  if (!text) return [];
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (t.length <= width) line = t;
    else {
      if (line) lines.push(line);
      line = w.length > width ? w.slice(0, width) : w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function clip(s, w) {
  const x = String(s ?? "");
  return x.length > w ? x.slice(0, w) : x;
}
function rightAlign(s, w) {
  const x = clip(s, w);
  return " ".repeat(Math.max(0, w - x.length)) + x;
}
function leftAlign(s, w) {
  const x = clip(s, w);
  return x + " ".repeat(Math.max(0, w - x.length));
}
function center(s, w) {
  const x = clip(s, w);
  const padL = Math.max(0, Math.floor((w - x.length) / 2));
  return " ".repeat(padL) + x; // trailing spaces not required
}

function kvLine(label, value, W) {
  const l = String(label);
  const v = String(value);
  if (l.length + v.length + 1 > W) return `${l} ${v}`;
  return l + " ".repeat(W - l.length - v.length) + v;
}

function getLocalNum(key, fallback = 0) {
  try {
    if (typeof window === "undefined") return fallback;
    const v = Number(window.localStorage.getItem(key) || "");
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function getReceiptWidthCols(restaurantProfile) {
  const fromLocal = getLocalNum("PRINT_WIDTH_COLS", 0);
  const fromProfile = Number(restaurantProfile?.receipt_cols || 0) || 0;

  // If paper mm is known, pick sane default for 80mm vs 58mm
  const paperMm = getLocalNum("PRINT_PAPER_MM", 0);
  const autoDefault = paperMm >= 76 ? 48 : 32;

  const cols = fromLocal || fromProfile || autoDefault;
  return Math.max(20, Math.min(64, cols));
}

function getLayout(restaurantProfile) {
  const cols = getReceiptWidthCols(restaurantProfile);

  // Visual left/right margin in *columns*
  const marginCols = cols >= 48 ? 2 : 1;
  const innerCols = Math.max(16, cols - marginCols * 2);

  // Physical printer dots (used for proper paper alignment)
  const paperMm = getLocalNum("PRINT_PAPER_MM", cols >= 48 ? 80 : 58);
  const dotWidth = paperMm >= 76 ? 576 : 384;

  // You can fine-tune these if a specific printer starts too left/right
  const leftDots = getLocalNum("PRINT_LEFT_MARGIN_DOTS", paperMm >= 76 ? 12 : 8);
  const rightDots = getLocalNum("PRINT_RIGHT_MARGIN_DOTS", paperMm >= 76 ? 12 : 8);

  const areaDots = Math.max(200, dotWidth - leftDots - rightDots);

  return { cols, innerCols, marginCols, paperMm, dotWidth, leftDots, rightDots, areaDots };
}

function withMargins(line, layout) {
  // We build everything in innerCols; add small left padding for aesthetics.
  // Right margin is achieved by GS W (print area width), not trailing spaces.
  return " ".repeat(layout.marginCols) + clip(line, layout.innerCols);
}

function escposPageSetup(layout) {
  // Alignment left, set left margin (GS L) and print area width (GS W),
  // force Font A + bold ON for readability.
  return (
    ESC + "a" + b(0) +
    GS + "L" + b2(layout.leftDots) +
    GS + "W" + b2(layout.areaDots) +
    ESC + "M" + b(0) +
    ESC + "E" + b(1)
  );
}

// Build ESC/POS raster bit image (GS v 0) from print_logo_* fields
function buildLogoEscPos(restaurantProfile) {
  const bits = restaurantProfile?.print_logo_bitmap;
  const cols = Number(restaurantProfile?.print_logo_cols || 0);
  const rows = Number(restaurantProfile?.print_logo_rows || 0);
  if (!bits || !cols || !rows || bits.length !== cols * rows) return "";

  const bytesPerRow = Math.ceil(cols / 8);

  let out = "";
  out += ESC + "a" + b(1); // center
  out += GS + "v" + "0" + b(0) + b2(bytesPerRow) + b2(rows);

  for (let y = 0; y < rows; y++) {
    for (let bx = 0; bx < bytesPerRow; bx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit;
        if (x < cols && bits[y * cols + x] === "1") byte |= 0x80 >> bit;
      }
      out += b(byte);
    }
  }

  out += "\r\n";
  out += ESC + "a" + b(0); // left
  return out;
}

function getBillCols(innerW) {
  // Designed for inner widths ~30 (58mm) and ~44 (80mm with margins)
  if (innerW >= 44) return { name: 20, qty: 6, rate: 7, total: 8 }; // 20+1+6+1+7+1+8=44
  if (innerW >= 38) return { name: 16, qty: 6, rate: 7, total: 7 }; // 16+1+6+1+7+1+7=38
  return { name: 14, qty: 6, rate: 4, total: 6 }; // 14+1+6+1+4+1+6=32 (fits innerW>=30 with clipping)
}

export function buildKotText(order, restaurantProfile) {
  try {
    const items = toDisplayItems(order);
    const removedItems = Array.isArray(order?.removed_items)
      ? order.removed_items.filter((ri) => Number(ri.quantity) > 0)
      : [];

    const layout = getLayout(restaurantProfile);
    const W = layout.innerCols;
    const dashes = () => "-".repeat(W);

    const restaurantName = String(
      restaurantProfile?.restaurant_name || order?.restaurant_name || "RESTAURANT"
    ).toUpperCase();

    const addressParts = [
      restaurantProfile?.shipping_address_line1,
      restaurantProfile?.shipping_address_line2,
      restaurantProfile?.shipping_city,
      restaurantProfile?.shipping_state,
      restaurantProfile?.shipping_pincode,
    ].filter(Boolean);
    const address = addressParts.length ? addressParts.join(", ") : (order?.restaurant_address || "");

    const phone =
      restaurantProfile?.shipping_phone || restaurantProfile?.phone || order?.restaurant_phone || "";

    const orderId = order?.id?.slice(0, 8)?.toUpperCase() || "N/A";
    const tableLabel = getOrderTypeLabel(order);

    const orderDate = new Date(order?.created_at);
    const dateStr = orderDate.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = orderDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

    const qtyW = 6;
    const nameW = Math.max(10, W - (qtyW + 1));

    const lines = [];

    // KOT does not need GS margins; it is usually short. But keep same inner width.
    lines.push(withMargins(center(restaurantName, W), layout));
    wrapText(address, W).forEach((l) => lines.push(withMargins(center(l, W), layout)));
    if (phone) lines.push(withMargins(center(`Contact No.: ${phone}`, W), layout));
    lines.push(withMargins(dashes(), layout));

    lines.push(withMargins(center("*** KITCHEN ORDER TICKET ***", W), layout));
    lines.push(withMargins(`${dateStr} ${timeStr}`, layout));
    lines.push(withMargins(`Order: #${orderId}`, layout));
    if (tableLabel) lines.push(withMargins(`For: ${tableLabel}`, layout));
    if (order?.number_of_customers) lines.push(withMargins(`No. of Customers: ${order.number_of_customers}`, layout));
    lines.push(withMargins(dashes(), layout));

    // Items
    if (items.length) {
      lines.push(withMargins(leftAlign("ITEM", nameW) + " " + rightAlign("QTY", qtyW), layout));
      items.forEach((it) => {
        const nameLines = wrapText(it?.name || "Item", nameW);
        const qtyNum = Number(it?.quantity || 1);
        const p = Number.isInteger(it?.uom_precision) ? it.uom_precision : qtyNum % 1 === 0 ? 0 : 2;
        const qty = rightAlign(qtyNum.toFixed(p), qtyW);

        lines.push(withMargins(leftAlign(nameLines[0] || "Item", nameW) + " " + qty, layout));
        for (let i = 1; i < nameLines.length; i++) lines.push(withMargins(nameLines[i], layout));
      });
    }

    if (removedItems.length) {
      lines.push(withMargins(dashes(), layout));
      lines.push(withMargins(center("*** REMOVED ITEMS ***", W), layout));
      lines.push(withMargins(leftAlign("ITEM", nameW) + " " + rightAlign("QTY", qtyW), layout));

      removedItems.forEach((ri) => {
        const nameLines = wrapText(ri?.name || "Item", nameW);
        const qtyNum = Number(ri?.quantity || 1);
        const p = Number.isInteger(ri?.uom_precision) ? ri.uom_precision : qtyNum % 1 === 0 ? 0 : 2;
        const qty = rightAlign(qtyNum.toFixed(p), qtyW);

        lines.push(withMargins(leftAlign("- " + (nameLines[0] || "Item"), nameW) + " " + qty, layout));
        for (let i = 1; i < nameLines.length; i++) lines.push(withMargins("  " + nameLines[i], layout));
      });
    }

    lines.push(withMargins(dashes(), layout));
    lines.push(withMargins(center("*** SEND TO KITCHEN ***", W), layout));
    lines.push("");

    return lines.join("\n");
  } catch (e) {
    console.error(e);
    return "PRINT ERROR";
  }
}

export async function downloadTextAndShare(order, bill, restaurantProfile) {
  try {
    // For sharing/downloading: plain text (no ESC/POS)
    const text = buildReceiptText(order, bill, restaurantProfile)
      // strip ESC/POS control chars for share/download
      .replace(/[\x00-\x1f\x7f]/g, (c) => (c === "\n" || c === "\r" || c === "\t" ? c : ""))
      .trim();

    const orderId = order?.id?.slice(0, 8)?.toUpperCase() || "N/A";

    if (navigator.canShare && navigator.canShare({ text })) {
      await navigator.share({ title: `BILL-${orderId}`, text });
      return { success: true, method: "share" };
    }

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BILL-${orderId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, method: "download" };
  } catch (error) {
    console.error(error);
    return { success: false, error: error?.message || String(error) };
  }
}

export function buildReceiptText(order, bill, restaurantProfile) {
  try {
    const items = toDisplayItems(order);
    const layout = getLayout(restaurantProfile);
    const W = layout.innerCols;

    const dashes = () => "-".repeat(W);

    const restaurantName = String(
      restaurantProfile?.restaurant_name || order?.restaurant_name || "RESTAURANT"
    ).toUpperCase();

    const addressParts = [
      restaurantProfile?.shipping_address_line1,
      restaurantProfile?.shipping_address_line2,
      restaurantProfile?.shipping_city,
      restaurantProfile?.shipping_state,
      restaurantProfile?.shipping_pincode,
    ].filter(Boolean);
    const address = addressParts.length ? addressParts.join(", ") : (order?.restaurant_address || "");

    const phone =
      restaurantProfile?.shipping_phone || restaurantProfile?.phone || order?.restaurant_phone || "";

    const orderType = getOrderTypeLabel(order);
    const invoiceNo = order?.invoice_no || bill?.invoice_no || "";
    const billNo = order?.bill_no || bill?.bill_no || "";

    const orderDate = new Date(order?.created_at);
    const dateStr = orderDate.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = orderDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

    const grandTotal = Number(order?.total_amount || bill?.grand_total || bill?.total_amount || order?.total || 0);
    const calculatedTotal = Number(bill?.total_inc_tax || order?.total_inc_tax || 0);
    const effectiveGrandTotal = grandTotal > 0 ? grandTotal : calculatedTotal;

    const taxAmount = Number(bill?.tax_total || bill?.total_tax || order?.tax_amount || order?.total_tax || 0);
    const orderDiscount = Number(order?.discount_amount || bill?.discount_amount || 0);
    const roundOff = Number(order?.round_off_amount || bill?.round_off_amount || 0);

    // Columns for ITEMS
    const cols = getBillCols(W);
    const nameW = cols.name;
    const qtyW = cols.qty;
    const rateW = cols.rate;
    const totalW = cols.total;

    const lines = [];

    // HEADER (inside inner width + margins)
    lines.push(withMargins(center(restaurantName, W), layout));
    wrapText(address, W).forEach((l) => lines.push(withMargins(center(l, W), layout)));
    if (phone) lines.push(withMargins(center(`Contact No.: ${phone}`, W), layout));
    if (restaurantProfile?.fssai_license) lines.push(withMargins(center(`FSSAI: ${restaurantProfile.fssai_license}`, W), layout));
    if (restaurantProfile?.gst_enabled && restaurantProfile?.gstin) lines.push(withMargins(center(`GSTIN: ${restaurantProfile.gstin}`, W), layout));

    lines.push(withMargins(dashes(), layout));

    // META
    lines.push(withMargins(`${dateStr} ${timeStr}`, layout));
    if (invoiceNo) lines.push(withMargins(`Invoice: ${invoiceNo}`, layout));
    if (billNo) lines.push(withMargins(`Bill No: ${billNo}`, layout));
    if (orderType) lines.push(withMargins(`Order Type: ${orderType}`, layout));
    if (order?.number_of_customers) lines.push(withMargins(`No. of Customers: ${order.number_of_customers}`, layout));

    lines.push(withMargins(dashes(), layout));

    // ITEMS HEADER
    const header =
      leftAlign("ITEM", nameW) +
      " " + rightAlign("QTY", qtyW) +
      " " + rightAlign("RATE", rateW) +
      " " + rightAlign("TOTAL", totalW);
    lines.push(withMargins(header, layout));
    lines.push(withMargins(dashes(), layout));

    // ITEMS
    items.forEach((it) => {
      const itemName = it?.name || "Item";
      const nameLines = wrapText(itemName, nameW);
      if (!nameLines.length) return;

      const rateNum = Number(it?.price || 0);
      const qtyNum = Number(it?.quantity || 1);

      const p = Number.isInteger(it?.uom_precision) ? it.uom_precision : qtyNum % 1 === 0 ? 0 : 2;
      let qtyStr = qtyNum.toFixed(p);
      const uom = it?.uom_short_code || it?.uom || "";
      if (uom && uom.toLowerCase() !== "pc") qtyStr += " " + uom;

      const totalNum = rateNum * qtyNum;
      const rateStr = rateNum % 1 === 0 ? rateNum.toFixed(0) : rateNum.toFixed(2);
      const totalStr = totalNum % 1 === 0 ? totalNum.toFixed(0) : totalNum.toFixed(2);

      const row1 =
        leftAlign(nameLines[0], nameW) +
        " " + rightAlign(qtyStr, qtyW) +
        " " + rightAlign(rateStr, rateW) +
        " " + rightAlign(totalStr, totalW);

      lines.push(withMargins(row1, layout));
      for (let i = 1; i < nameLines.length; i++) lines.push(withMargins(nameLines[i], layout));
    });

    lines.push(withMargins(dashes(), layout));

    // TOTALS (right-aligned nicely)
    let finalGrandTotal;
    if (order?.total_amount && Number(order.total_amount) > 0) finalGrandTotal = Number(order.total_amount);
    else if (bill?.total_amount && Number(bill.total_amount) > 0) finalGrandTotal = Number(bill.total_amount);
    else finalGrandTotal = Number(effectiveGrandTotal || 0) - orderDiscount;

    if (taxAmount > 0) {
      const grossTotal = finalGrandTotal + orderDiscount;
      const netAmt = grossTotal - taxAmount;

      lines.push(withMargins(kvLine("Net Amt:", netAmt.toFixed(2), W), layout));
      lines.push(withMargins(kvLine("Tax:", taxAmount.toFixed(2), W), layout));
      if (orderDiscount > 0) lines.push(withMargins(kvLine("Discount:", "-" + orderDiscount.toFixed(2), W), layout));
      if (roundOff !== 0) lines.push(withMargins(kvLine("Round off:", `${roundOff > 0 ? "+" : ""}${roundOff.toFixed(2)}`, W), layout));
      lines.push(withMargins(kvLine("Grand Total:", finalGrandTotal.toFixed(2), W), layout));
    } else {
      if (orderDiscount > 0) {
        const beforeDiscount = finalGrandTotal + orderDiscount - roundOff;
        lines.push(withMargins(kvLine("Subtotal:", beforeDiscount.toFixed(2), W), layout));
        lines.push(withMargins(kvLine("Discount:", "-" + orderDiscount.toFixed(2), W), layout));
      }
      if (roundOff !== 0) lines.push(withMargins(kvLine("Round off:", `${roundOff > 0 ? "+" : ""}${roundOff.toFixed(2)}`, W), layout));
      lines.push(withMargins(kvLine("Total:", finalGrandTotal.toFixed(2), W), layout));
    }

    lines.push(withMargins(dashes(), layout));
    lines.push(withMargins(center("** THANK YOU! VISIT AGAIN !! **", W), layout));
    lines.push("");

    const body = lines.join("\n");
    const logoEsc = buildLogoEscPos(restaurantProfile);

    // IMPORTANT:
    // Prefix setup that sets printer left margin + print area width so 80mm aligns properly.
    // This will be preserved because your escpos encoder treats input as a binary string.
    return escposPageSetup(layout) + logoEsc + body;
  } catch (e) {
    console.error(e);
    return "PRINT ERROR";
  }
}

export async function downloadPdfAndShare(order, bill, restaurantProfile) {
  return downloadTextAndShare(order, bill, restaurantProfile);
}
