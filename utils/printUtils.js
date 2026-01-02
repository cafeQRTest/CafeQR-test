// utils/printUtils.js

function getBillCols(W) {
  // Supports 32-col (58mm), 42-col (some 80mm), 48-col (common 80mm)
  if (W >= 48) return { name: 23, qty: 7, rate: 7, total: 9 }; // 23+7+1+7+1+9 = 48
  if (W >= 42) return { name: 19, qty: 7, rate: 7, total: 7 }; // 19+7+1+7+1+7 = 42
  return { name: 14, qty: 6, rate: 4, total: 6 }; // 14+6+1+4+1+6 = 32
}

function kvLine(label, value, W) {
  const v = String(value);
  if (label.length + v.length + 1 > W) return `${label} ${v}`;
  return label + " ".repeat(W - label.length - v.length) + v;
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

// Helper: Wrap text
function wrapText(text, width) {
  if (!text) return [];
  const lines = [];
  let currentLine = "";

  text.split(" ").forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= width) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word.length > width ? word.substring(0, width) : word;
    }
  });

  if (currentLine) lines.push(currentLine);
  return lines;
}

// Helper: Right-align text
function rightAlign(str, width) {
  const s = String(str ?? "");
  const clipped = s.length > width ? s.substring(0, width) : s;
  const padding = Math.max(0, width - clipped.length);
  return " ".repeat(padding) + clipped;
}

// Helper: Center text
function center(str, width) {
  const s = String(str ?? "");
  const clipped = s.length > width ? s.substring(0, width) : s;
  const padding = Math.max(0, Math.floor((width - clipped.length) / 2));
  return " ".repeat(padding) + clipped;
}

// Build ESC/POS raster bit image (GS v 0) from print_logo_* fields
function buildLogoEscPos(restaurantProfile) {
  const bits = restaurantProfile?.print_logo_bitmap;
  const cols = Number(restaurantProfile?.print_logo_cols || 0);
  const rows = Number(restaurantProfile?.print_logo_rows || 0);

  // bits is row‑major: length must be cols * rows
  if (!bits || !cols || !rows || bits.length !== cols * rows) return "";

  const bytesPerRow = Math.ceil(cols / 8);
  const GS = "\x1d";
  const ESC = "\x1b";

  let out = "";

  // Center alignment ON (ESC a 1)
  out += ESC + "a" + "\x01";

  // GS v 0 m xL xH yL yH
  const m = 0;
  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = rows & 0xff;
  const yH = (rows >> 8) & 0xff;

  out += GS + "v" + "0" + String.fromCharCode(m, xL, xH, yL, yH);

  // Raster data
  for (let y = 0; y < rows; y++) {
    for (let bx = 0; bx < bytesPerRow; bx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit;
        if (x < cols && bits[y * cols + x] === "1") {
          byte |= 0x80 >> bit;
        }
      }
      out += String.fromCharCode(byte);
    }
  }

  out += "\r\n";
  out += ESC + "a" + "\x00";
  return out;
}

// ASCII preview logo (optional, unused in printer path)
function renderLogoFromBitmap(restaurantProfile, width) {
  const bits = restaurantProfile?.print_logo_bitmap;
  const cols = Number(restaurantProfile?.print_logo_cols || 0);
  const rows = Number(restaurantProfile?.print_logo_rows || 0);
  if (!bits || !cols || !rows || bits.length !== cols * rows) return [];

  const DARK = "#";
  const LIGHT = " ";
  const lines = [];
  const cellWidth = Math.max(1, Math.floor(width / cols));

  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < cols; x++) {
      const bit = bits[y * cols + x] === "1";
      line += (bit ? DARK : LIGHT).repeat(cellWidth);
    }
    lines.push(center(line, width));
  }
  return lines;
}

// Helper: Build item row (legacy helper; not used by current receipt builder)
function buildItemRow(item, width) {
  const name = (item.name || "").substring(0, 14).padEnd(14);

  const qtyNum = Number(item.quantity || 0);
  const p = Number.isInteger(item.uom_precision) ? item.uom_precision : qtyNum % 1 === 0 ? 0 : 2;
  let qtyStr = qtyNum.toFixed(p);

  const uom = item.uom_short_code || item.uom || "";
  if (uom && uom.toLowerCase() !== "pc") qtyStr += " " + uom;

  const qty = qtyStr.padStart(6).substring(0, 6);

  const rateNum = Number(item.price || 0);
  const rate = (rateNum % 1 === 0 ? rateNum.toFixed(0) : rateNum.toFixed(2)).padStart(4);

  const totalNum = rateNum * qtyNum;
  const total = (totalNum % 1 === 0 ? totalNum.toFixed(0) : totalNum.toFixed(2)).padStart(5);

  return `${name}${qty} ${rate} ${total}`.substring(0, width);
}

function getReceiptWidth(restaurantProfile) {
  let fromLocal = 0;
  let paperMm = 0;

  if (typeof window !== "undefined") {
    fromLocal = Number(window.localStorage.getItem("PRINT_WIDTH_COLS") || 0);
    paperMm = Number(window.localStorage.getItem("PRINT_PAPER_MM") || 0);
  }

  const fromProfile = Number(restaurantProfile?.receipt_cols || 0) || 0;
  const autoDefault = paperMm >= 76 ? 48 : 32;

  const cols = fromLocal || fromProfile || autoDefault;
  return Math.max(20, Math.min(64, cols));
}

export function buildKotText(order, restaurantProfile) {
  try {
    const items = toDisplayItems(order);

    const removedItems = Array.isArray(order?.removed_items)
      ? order.removed_items.filter((ri) => Number(ri.quantity) > 0)
      : [];

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

    const address = addressParts.length ? addressParts.join(", ") : order?.restaurant_address || "";

    const phone =
      restaurantProfile?.shipping_phone || restaurantProfile?.phone || order?.restaurant_phone || "";

    const orderId = order?.id?.slice(0, 8)?.toUpperCase() || "N/A";
    const tableLabel = getOrderTypeLabel(order);

    const orderDate = new Date(order?.created_at);
    const dateStr = orderDate.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = orderDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

    const W = getReceiptWidth(restaurantProfile);
    const qtyW = 6;
    const nameW = W - (qtyW + 1); // 1 space between
    const dashes = () => "-".repeat(W);

    const lines = [];

    // HEADER
    lines.push(center(restaurantName, W));
    wrapText(address, W).forEach((l) => lines.push(center(l, W)));
    if (phone) lines.push(center(`Contact No.: ${phone}`, W));
    lines.push(dashes());

    // META
    lines.push(center("*** KITCHEN ORDER TICKET ***", W));
    lines.push(`${dateStr} ${timeStr}`);
    lines.push(`Order: #${orderId}`);
    if (tableLabel) lines.push(`For: ${tableLabel}`);
    if (order?.number_of_customers) lines.push(`No. of Customers: ${order.number_of_customers}`);
    lines.push(dashes());

    // ITEMS (KOT: name + qty; no UOM)
    if (items.length) {
      lines.push("ITEM".padEnd(nameW) + " " + "QTY".padStart(qtyW));

      items.forEach((item) => {
        const nameLines = wrapText(item?.name || "Item", nameW);
        if (!nameLines.length) return;

        const qtyNum = Number(item?.quantity || 1);
        const p = Number.isInteger(item?.uom_precision) ? item.uom_precision : qtyNum % 1 === 0 ? 0 : 2;
        const qtyStr = qtyNum.toFixed(p);

        const qty = rightAlign(qtyStr.substring(0, qtyW), qtyW);

        lines.push(nameLines[0].padEnd(nameW) + " " + qty);
        for (let i = 1; i < nameLines.length; i++) lines.push(nameLines[i]);
      });
    }

    // REMOVED ITEMS
    if (removedItems.length) {
      lines.push(dashes());
      lines.push(center("*** REMOVED ITEMS ***", W));
      lines.push("ITEM".padEnd(nameW) + " " + "QTY".padStart(qtyW));

      removedItems.forEach((ri) => {
        const nameLines = wrapText(ri?.name || "Item", nameW);
        if (!nameLines.length) return;

        const qtyNum = Number(ri?.quantity || 1);
        const p = Number.isInteger(ri?.uom_precision) ? ri.uom_precision : qtyNum % 1 === 0 ? 0 : 2;
        const qtyStr = qtyNum.toFixed(p);

        const qty = rightAlign(qtyStr.substring(0, qtyW), qtyW);

        const firstName = ("- " + nameLines[0]).substring(0, nameW);
        lines.push(firstName.padEnd(nameW) + " " + qty);

        for (let i = 1; i < nameLines.length; i++) lines.push(("  " + nameLines[i]).substring(0, W));
      });
    }

    lines.push(dashes());
    lines.push(center("*** SEND TO KITCHEN ***", W));
    lines.push("");

    return lines.join("\n");
  } catch (e) {
    console.error(e);
    return "PRINT ERROR";
  }
}

export async function downloadTextAndShare(order, bill, restaurantProfile) {
  try {
    const items = toDisplayItems(order);

    const restaurantName = (order?.restaurant_name || "RESTAURANT").toUpperCase();

    const addressParts = [
      restaurantProfile?.shipping_address_line1,
      restaurantProfile?.shipping_city,
      restaurantProfile?.shipping_state,
      restaurantProfile?.shipping_pincode,
    ].filter(Boolean);

    const address = addressParts.length ? addressParts.join(", ") : order?.restaurant_address || "";
    const phone = restaurantProfile?.phone || order?.restaurant_phone || "";

    const orderId = order?.id?.slice(0, 8)?.toUpperCase() || "N/A";
    const orderType = getOrderTypeLabel(order);

    const invoiceNo = order?.invoice_no || bill?.invoice_no || "";
    const billNo = order?.bill_no || bill?.bill_no || "";

    const orderDate = new Date(order?.created_at);
    const dateStr = orderDate.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = orderDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

    // Amounts
    const grandTotal = Number(order?.total_amount || bill?.grand_total || bill?.total_amount || order?.total || 0);

    const calculatedTotal = Number(bill?.total_inc_tax || order?.total_inc_tax || 0);
    const effectiveGrandTotal = grandTotal > 0 ? grandTotal : calculatedTotal;

    const taxAmount = Number(bill?.tax_total || bill?.total_tax || order?.tax_amount || order?.total_tax || 0);

    const orderDiscount = Number(order?.discount_amount || bill?.discount_amount || 0);
    const roundOff = Number(order?.round_off_amount || bill?.round_off_amount || 0);

    const W = getReceiptWidth(restaurantProfile);
    const dashes = () => "-".repeat(W);

    const lines = [];

    // HEADER
    lines.push(center(restaurantName, W));
    wrapText(address, W).forEach((line) => lines.push(center(line, W)));
    if (phone) lines.push(center(`Contact No.: ${phone}`, W));

    if (restaurantProfile?.fssai_license) lines.push(center(`FSSAI: ${restaurantProfile.fssai_license}`, W));
    if (restaurantProfile?.gst_enabled && restaurantProfile?.gstin) lines.push(center(`GSTIN: ${restaurantProfile.gstin}`, W));

    lines.push("");
    lines.push(dashes());
    lines.push("");

    // META
    lines.push(`${dateStr} ${timeStr}`);
    if (invoiceNo) lines.push(`Invoice: ${invoiceNo}`);
    if (billNo) lines.push(`Bill No: ${billNo}`);
    if (orderType) lines.push(`Order Type: ${orderType}`);
    if (order?.number_of_customers) lines.push(`No. of Customers: ${order.number_of_customers}`);

    lines.push(dashes());
    lines.push("");

    const hasItemDiscounts = items.some((it) => Number(it.discount_amount || 0) > 0);

    // ITEMS HEADER
    if (hasItemDiscounts) lines.push("ITEM       QTY RATE DISC TOTAL");
    else lines.push("ITEM         QTY  RATE  TOTAL");

    // ITEMS
    items.forEach((item) => {
      const itemName = item?.name || "Item";
      const nameWidth = hasItemDiscounts ? 10 : 14;
      const nameLines = wrapText(itemName, nameWidth);
      if (!nameLines.length) return;

      const rateNum = Number(item?.price || 0);
      const qtyNum = Number(item?.quantity || 1);
      const itemDisc = Number(item?.discount_amount || 0);
      const totalNum = hasItemDiscounts ? rateNum * qtyNum - itemDisc : rateNum * qtyNum;

      const rate = (rateNum % 1 === 0 ? rateNum.toFixed(0) : rateNum.toFixed(2)).padStart(4);
      const total = (totalNum % 1 === 0 ? totalNum.toFixed(0) : totalNum.toFixed(2)).padStart(5);

      const p = Number.isInteger(item?.uom_precision) ? item.uom_precision : qtyNum % 1 === 0 ? 0 : 2;
      let qtyStr = qtyNum.toFixed(p);

      const uom = item?.uom_short_code || item?.uom || "";
      if (uom && uom.toLowerCase() !== "pc") qtyStr += " " + uom;

      if (hasItemDiscounts) {
        const qty = qtyStr.padStart(4).substring(0, 4);
        const disc = itemDisc > 0 ? ("-" + itemDisc.toFixed(0)).padStart(4).substring(0, 4) : "   -";
        lines.push(nameLines[0].padEnd(10) + " " + qty + " " + rate + " " + disc + " " + total);
        for (let i = 1; i < nameLines.length; i++) lines.push(nameLines[i].padEnd(10));
      } else {
        const qty = qtyStr.padStart(6).substring(0, 6);
        lines.push(nameLines[0].padEnd(14) + qty + " " + rate + " " + total);
        for (let i = 1; i < nameLines.length; i++) lines.push(nameLines[i].padEnd(14));
      }
    });

    lines.push("");
    lines.push(dashes());
    lines.push("");

    // TOTALS (finalGrandTotal calculation)
    let finalGrandTotal;
    if (order?.total_amount && Number(order.total_amount) > 0) finalGrandTotal = Number(order.total_amount);
    else if (bill?.total_amount && Number(bill.total_amount) > 0) finalGrandTotal = Number(bill.total_amount);
    else finalGrandTotal = Number(effectiveGrandTotal || 0) - orderDiscount;

    if (taxAmount > 0) {
      const grossTotal = finalGrandTotal + orderDiscount;
      const netAmt = grossTotal - taxAmount;

      lines.push(`Net Amt: ${netAmt.toFixed(2)}`);
      lines.push(`Tax: ${taxAmount.toFixed(2)}`);
      if (orderDiscount > 0) lines.push(`Discount: -${orderDiscount.toFixed(2)}`);
      if (roundOff !== 0) lines.push(`Round off: ${roundOff > 0 ? "+" : ""}${roundOff.toFixed(2)}`);
      lines.push(`Grand Total: ${finalGrandTotal.toFixed(2)}`);
    } else {
      if (orderDiscount > 0) {
        const beforeDiscount = finalGrandTotal + orderDiscount - roundOff;
        lines.push(`Subtotal: ${beforeDiscount.toFixed(2)}`);
        lines.push(`Discount: -${orderDiscount.toFixed(2)}`);
      }
      if (roundOff !== 0) lines.push(`Round off: ${roundOff > 0 ? "+" : ""}${roundOff.toFixed(2)}`);
      lines.push(`Total: ${finalGrandTotal.toFixed(2)}`);
    }

    lines.push(dashes());
    lines.push("");
    lines.push(center("** THANK YOU! VISIT AGAIN !! **", W));
    lines.push("");

    const text = lines.join("\n");

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
    const ESC = "\x1b";
    const FORCE_FONT_A = ESC + "M" + "\x00";

    const items = toDisplayItems(order);

    const W = getReceiptWidth(restaurantProfile);
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

    const address = addressParts.length ? addressParts.join(", ") : order?.restaurant_address || "";

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

    const lines = [];

    // HEADER
    lines.push(center(restaurantName, W));
    wrapText(address, W).forEach((l) => lines.push(center(l, W)));
    if (phone) lines.push(center(`Contact No.: ${phone}`, W));
    if (restaurantProfile?.fssai_license) lines.push(center(`FSSAI: ${restaurantProfile.fssai_license}`, W));
    if (restaurantProfile?.gst_enabled && restaurantProfile?.gstin) lines.push(center(`GSTIN: ${restaurantProfile.gstin}`, W));

    lines.push(dashes());

    // META (no duplicates)
    lines.push(`${dateStr} ${timeStr}`);
    if (invoiceNo) lines.push(`Invoice: ${invoiceNo}`);
    if (billNo) lines.push(`Bill No: ${billNo}`);
    if (orderType) lines.push(`Order Type: ${orderType}`);
    if (order?.number_of_customers) lines.push(`No. of Customers: ${order.number_of_customers}`);

    lines.push(dashes());

    const hasItemDiscounts = items.some((it) => Number(it.discount_amount || 0) > 0);

    // ITEMS HEADER
    if (hasItemDiscounts) lines.push("ITEM       QTY RATE DISC TOTAL");
    else lines.push("ITEM         QTY  RATE  TOTAL");

    // ITEMS
    items.forEach((item) => {
      const itemName = item?.name || "Item";
      const nameWidth = hasItemDiscounts ? 10 : 14;
      const nameLines = wrapText(itemName, nameWidth);
      if (!nameLines.length) return;

      const rateNum = Number(item?.price || 0);
      const qtyNum = Number(item?.quantity || 1);
      const itemDisc = Number(item?.discount_amount || 0);
      const totalNum = hasItemDiscounts ? rateNum * qtyNum - itemDisc : rateNum * qtyNum;

      const rate = (rateNum % 1 === 0 ? rateNum.toFixed(0) : rateNum.toFixed(2)).padStart(4);
      const total = (totalNum % 1 === 0 ? totalNum.toFixed(0) : totalNum.toFixed(2)).padStart(5);

      const p = Number.isInteger(item?.uom_precision) ? item.uom_precision : qtyNum % 1 === 0 ? 0 : 2;
      let qtyStr = qtyNum.toFixed(p);

      const uom = item?.uom_short_code || item?.uom || "";
      if (uom && uom.toLowerCase() !== "pc") qtyStr += " " + uom;

      if (hasItemDiscounts) {
        const qty = qtyStr.padStart(4).substring(0, 4);
        const disc = itemDisc > 0 ? ("-" + itemDisc.toFixed(0)).padStart(4).substring(0, 4) : "   -";
        lines.push(nameLines[0].padEnd(10) + " " + qty + " " + rate + " " + disc + " " + total);
        for (let i = 1; i < nameLines.length; i++) lines.push(nameLines[i].padEnd(10));
      } else {
        const qty = qtyStr.padStart(6).substring(0, 6);
        lines.push(nameLines[0].padEnd(14) + qty + " " + rate + " " + total);
        for (let i = 1; i < nameLines.length; i++) lines.push(nameLines[i].padEnd(14));
      }
    });

    lines.push(dashes());

    // TOTALS (fixed: single if/else, no extra else)
    let finalGrandTotal;
    if (order?.total_amount && Number(order.total_amount) > 0) finalGrandTotal = Number(order.total_amount);
    else if (bill?.total_amount && Number(bill.total_amount) > 0) finalGrandTotal = Number(bill.total_amount);
    else finalGrandTotal = Number(effectiveGrandTotal || 0) - orderDiscount;

    if (taxAmount > 0) {
      const grossTotal = finalGrandTotal + orderDiscount;
      const netAmt = grossTotal - taxAmount;

      lines.push(kvLine("Net Amt:", netAmt.toFixed(2), W));
      lines.push(kvLine("Tax:", taxAmount.toFixed(2), W));
      if (orderDiscount > 0) lines.push(kvLine("Discount:", "-" + orderDiscount.toFixed(2), W));
      if (roundOff !== 0) lines.push(kvLine("Round off:", `${roundOff > 0 ? "+" : ""}${roundOff.toFixed(2)}`, W));
      lines.push(kvLine("Grand Total:", finalGrandTotal.toFixed(2), W));
    } else {
      if (orderDiscount > 0) {
        const beforeDiscount = finalGrandTotal + orderDiscount - roundOff;
        lines.push(kvLine("Subtotal:", beforeDiscount.toFixed(2), W));
        lines.push(kvLine("Discount:", "-" + orderDiscount.toFixed(2), W));
      }
      if (roundOff !== 0) lines.push(kvLine("Round off:", `${roundOff > 0 ? "+" : ""}${roundOff.toFixed(2)}`, W));
      lines.push(kvLine("Total:", finalGrandTotal.toFixed(2), W));
    }

    lines.push(dashes());
    lines.push(center("** THANK YOU! VISIT AGAIN !! **", W));
    lines.push("");

    const body = lines.join("\n");
    const logoEsc = buildLogoEscPos(restaurantProfile);

    return FORCE_FONT_A + logoEsc + body;
  } catch (e) {
    console.error(e);
    return "PRINT ERROR";
  }
}

export async function downloadPdfAndShare(order, bill, restaurantProfile) {
  return downloadTextAndShare(order, bill, restaurantProfile);
}
