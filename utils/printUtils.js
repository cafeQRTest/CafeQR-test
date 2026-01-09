// utils/printUtils.js

const ESC = "\x1b";
const GS = "\x1d";

function b(n) {
  return String.fromCharCode(n & 0xff);
}
function b2(n) {
  return b(n & 0xff) + b((n >> 8) & 0xff);
}

// ESC/POS Modes
const MODE_RESET = ESC + "!" + b(0);
const MODE_BOLD = ESC + "E" + b(1);
const MODE_NO_BOLD = ESC + "E" + b(0);
const MODE_DOUBLE = ESC + "!" + b(0x11); // Double-height + Double-width
const MODE_NORMAL = ESC + "!" + b(0);

// Alignment Commands
const ALIGN_LEFT = ESC + "a" + b(0);
const ALIGN_CENTER = ESC + "a" + b(1);
const ALIGN_RIGHT = ESC + "a" + b(2);
const MODE_TALL = ESC + "!" + b(0x01); // double-height only
// GS ! n = character size magnification (width/height). [web:133][web:138]
const SIZE_1X = GS + "!" + b(0x00); // 1x width, 1x height
const SIZE_2X = GS + "!" + b(0x11); // 2x width, 2x height
const SIZE_2H = GS + "!" + b(0x01); // 1x width, 2x height (your current “DH”)



function toDisplayItems(order) {
  // Counter/cart shape
  if (Array.isArray(order?.items) && order.items.length) {
    return order.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      discount_amount:
        i.discount_amount || (i.discount ? Number(i.discount.value || 0) : 0),
      uom: i.uom || "",
      uom_short_code: i.uom_short_code || "",
      uom_precision: i.uom_precision,
    }));
  }

  // DB/API shape
  if (Array.isArray(order?.order_items) && order.order_items.length) {
    return order.order_items.map((oi) => ({
      name: oi.menu_items?.name || oi.item_name || "Item",
      quantity: Number(oi.quantity || 0),
      price: Number(oi.price || oi.unit_price || 0),
      discount_amount: Number(oi.discount_amount || 0),
      uom: oi.uom_short_code || "",
      uom_short_code: oi.uom_short_code || "",
      uom_precision: oi.uom_precision ?? 0,
    }));
  }

  return [];
}

function getOrderTypeLabel(order) {
  if (!order) return "";
  if (order.table_number && order.table_number !== null)
    return `Table ${order.table_number}`;
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
function rightAlignEnd(s, w) {
  const x = String(s ?? "");
  const y = x.length > w ? x.slice(-w) : x;
  return " ".repeat(Math.max(0, w - y.length)) + y;
}
function leftAlign(s, w) {
  const x = clip(s, w);
  return x + " ".repeat(Math.max(0, w - x.length));
}
function center(s, w) {
  const x = clip(s, w);
  const padL = Math.max(0, Math.floor((w - x.length) / 2));
  return " ".repeat(padL) + x;
}

function kvLine(label, value, W) {
  const l = String(label);
  const v = String(value);
  if (l.length + v.length + 1 > W) return `${l} ${v}`;
  return l + " ".repeat(W - l.length - v.length) + v;
}

function kvLineScaled(label, value, W, scaleW = 1) {
  const effW = Math.max(10, Math.floor(W / scaleW));
  return kvLine(label, value, effW);
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
  const paperMm = getLocalNum("PRINT_PAPER_MM", 0);

  // Defaults: 32 cols for 58mm, 48 cols for 80mm
  const autoDefault = paperMm >= 76 ? 48 : 32;

  const cols = fromLocal || fromProfile || autoDefault;
  return Math.max(20, Math.min(64, cols));
}

function getLayout(restaurantProfile) {
  const cols = getReceiptWidthCols(restaurantProfile);

  const paperMm = getLocalNum("PRINT_PAPER_MM", cols >= 48 ? 80 : 58);
  const dotWidth = paperMm >= 76 ? 576 : 384;

  const defaultMargin = paperMm >= 76 ? 12 : 8;
  const leftDots = getLocalNum("PRINT_LEFT_MARGIN_DOTS", defaultMargin);
  const rightDots = getLocalNum("PRINT_RIGHT_MARGIN_DOTS", defaultMargin);

  // GS W sets printable area width (dots). [web:116]
  const areaDots = Math.max(200, dotWidth - leftDots - rightDots);

  // Guard cols: useful mainly on 58mm; keep optional on 80mm.
  const guardColsDefault = paperMm >= 76 ? 0 : 1;
  const guardCols = getLocalNum("PRINT_GUARD_COLS", guardColsDefault);

  // Font A is 12×24 dots (your escposPageSetup uses ESC M 0 => Font A). [web:134]
  // If margins shrink areaDots, max printable columns shrink too (e.g. 552 dots => 46 cols).
  const charDots = 12;
  const maxColsFromDots = paperMm >= 76 ? Math.floor(areaDots / charDots) : cols;

  const marginCols = 0;
  const innerCols = Math.max(
    16,
    Math.min(cols - guardCols, maxColsFromDots)
  );

  return {
    cols,
    innerCols,
    marginCols,
    paperMm,
    dotWidth,
    leftDots,
    rightDots,
    areaDots,
    guardCols,
    maxColsFromDots,
  };
}

function withMargins(line, layout) {
  return " ".repeat(layout.marginCols) + clip(line, layout.innerCols);
}

function escposPageSetup(layout) {
  return (
    ESC + "@" + // reset
    ESC + "a" + b(0) + // left align (default)
    GS + "L" + b2(layout.leftDots) + // left margin
    GS + "W" + b2(layout.areaDots) + // printable area width
    ESC + "M" + b(0) + // Font A
    ESC + "E" + b(0) // bold off
  );
}

function buildLogoEscPos(restaurantProfile) {
  const bits = restaurantProfile?.print_logo_bitmap;
  const cols = Number(restaurantProfile?.print_logo_cols || 0);
  const rows = Number(restaurantProfile?.print_logo_rows || 0);
  if (!bits || !cols || !rows || bits.length !== cols * rows) return "";

  const bytesPerRow = Math.ceil(cols / 8);

  let out = "";
  out += ALIGN_CENTER;
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
  out += ALIGN_LEFT;
  return out;
}

function getBillCols(innerW, hasDiscount) {
  const showDiscCol = hasDiscount && innerW >= 38;
  const gaps = showDiscCol ? 4 : 3;

  let qty = innerW >= 44 ? 6 : innerW >= 38 ? 6 : 4;
  let rate = innerW >= 44 ? 7 : innerW >= 38 ? 7 : 5;
  let disc = showDiscCol ? (innerW >= 44 ? 7 : 6) : 0;
  let total = innerW >= 44 ? 8 : innerW >= 38 ? 7 : 6;

  const fixed = qty + rate + total + disc + gaps;
  let name = innerW - fixed;

  if (name < 8) {
    qty = 3;
    rate = 5;
    disc = 0;
    total = 6;
    const fixed2 = qty + rate + total + disc + gaps;
    name = Math.max(6, innerW - fixed2);
  }

  return { name, qty, rate, disc, total, showDiscCol };
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
      restaurantProfile?.restaurant_name ||
        order?.restaurant_name ||
        "RESTAURANT"
    ).toUpperCase();

    const addressParts = [
      restaurantProfile?.shipping_address_line1,
      restaurantProfile?.shipping_address_line2,
      restaurantProfile?.shipping_city,
      restaurantProfile?.shipping_state,
      restaurantProfile?.shipping_pincode,
    ].filter(Boolean);
    const address = addressParts.length
      ? addressParts.join(", ")
      : order?.restaurant_address || "";

    const phone =
      restaurantProfile?.shipping_phone ||
      restaurantProfile?.phone ||
      order?.restaurant_phone ||
      "";

    const orderId = order?.id?.slice(0, 8)?.toUpperCase() || "N/A";
    const tableLabel = getOrderTypeLabel(order);

    const orderDate = new Date(order?.created_at);
    const dateStr = orderDate.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const timeStr = orderDate.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const qtyW = 6;
    const nameW = Math.max(10, W - (qtyW + 1));

    const lines = [];

    // === HEADER ===
    // Use PRINTER ALIGNMENT (ALIGN_CENTER) for the double-width header
    // so it ignores column counting errors.

// === RESTAURANT NAME (center + bold; 80mm = 2xW/2xH, 58mm = normal) ===
const is80 = layout.paperMm >= 76;

lines.push(ALIGN_CENTER);

lines.push(
  MODE_BOLD +
    (is80 ? SIZE_2X : SIZE_1X) +
    restaurantName +
    SIZE_1X +
    MODE_NO_BOLD
);

// go back to normal flow
lines.push(ALIGN_LEFT);




    wrapText(address, W).forEach((l) =>
      lines.push(withMargins(center(l, W), layout))
    );
    if (phone)
      lines.push(withMargins(center(`Contact No.: ${phone}`, W), layout));
    
    lines.push(withMargins(dashes(), layout));

    lines.push(withMargins(center("*** KITCHEN ORDER TICKET ***", W), layout));
    lines.push(withMargins(`${dateStr} ${timeStr}`, layout));
    lines.push(withMargins(`Order: #${orderId}`, layout));
    if (tableLabel) lines.push(withMargins(`For: ${tableLabel}`, layout));
    if (order?.number_of_customers)
      lines.push(
        withMargins(`No. of Customers: ${order.number_of_customers}`, layout)
      );
    lines.push(withMargins(dashes(), layout));

    if (items.length) {
      lines.push(
        withMargins(
          leftAlign("ITEM", nameW) + " " + rightAlign("QTY", qtyW),
          layout
        )
      );
      lines.push(withMargins(dashes(), layout));

      items.forEach((it) => {
        const nameLines = wrapText(it?.name || "Item", nameW);
        const qtyNum = Number(it?.quantity || 1);
        const p = Number.isInteger(it?.uom_precision)
          ? it.uom_precision
          : qtyNum % 1 === 0
          ? 0
          : 2;

        if (!nameLines.length) return;

        const qty = rightAlign(qtyNum.toFixed(p), qtyW);
        lines.push(
          withMargins(leftAlign(nameLines[0], nameW) + " " + qty, layout)
        );
        for (let i = 1; i < nameLines.length; i++) {
          lines.push(withMargins(nameLines[i], layout));
        }
      });
    }

    if (removedItems.length) {
      lines.push(withMargins(dashes(), layout));
      lines.push(withMargins(center("*** REMOVED ITEMS ***", W), layout));
      lines.push(
        withMargins(
          leftAlign("ITEM", nameW) + " " + rightAlign("QTY", qtyW),
          layout
        )
      );

      removedItems.forEach((ri) => {
        const nameLines = wrapText(ri?.name || "Item", nameW);
        const qtyNum = Number(ri?.quantity || 1);
        const p = Number.isInteger(ri?.uom_precision)
          ? ri.uom_precision
          : qtyNum % 1 === 0
          ? 0
          : 2;

        if (!nameLines.length) return;

        const qty = rightAlign(qtyNum.toFixed(p), qtyW);
        lines.push(
          withMargins(leftAlign("- " + nameLines[0], nameW) + " " + qty, layout)
        );
        for (let i = 1; i < nameLines.length; i++) {
          lines.push(withMargins("  " + nameLines[i], layout));
        }
      });
    }

    lines.push(withMargins(dashes(), layout));
    lines.push(withMargins(center("*** SEND TO KITCHEN ***", W), layout));
    lines.push("");

    return escposPageSetup(layout) + lines.join("\n");
  } catch (e) {
    console.error(e);
    return "PRINT ERROR";
  }
}

export async function downloadTextAndShare(order, bill, restaurantProfile) {
  try {
    const text = buildReceiptText(order, bill, restaurantProfile)
      // Strip ESC/POS commands
      .replace(/[\x00-\x1f\x7f]/g, (c) =>
        c === "\n" || c === "\r" || c === "\t" ? c : ""
      )
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
      restaurantProfile?.restaurant_name ||
        order?.restaurant_name ||
        "RESTAURANT"
    ).toUpperCase();

    const addressParts = [
      restaurantProfile?.shipping_address_line1,
      restaurantProfile?.shipping_address_line2,
      restaurantProfile?.shipping_city,
      restaurantProfile?.shipping_state,
      restaurantProfile?.shipping_pincode,
    ].filter(Boolean);
    const address = addressParts.length
      ? addressParts.join(", ")
      : order?.restaurant_address || "";

    const phone =
      restaurantProfile?.shipping_phone ||
      restaurantProfile?.phone ||
      order?.restaurant_phone ||
      "";

    const orderType = getOrderTypeLabel(order);
    const invoiceNo = bill?.invoice_no || order?.invoice_no || "";
    const billNo = bill?.bill_no || order?.bill_no || "";

    const orderDate = new Date(order?.created_at);
    const dateStr = orderDate.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const timeStr = orderDate.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const taxAmount = Number(
      bill?.tax_total || bill?.total_tax || order?.tax_amount || order?.total_tax || 0
    );
    const orderDiscount = Number(order?.discount_amount || bill?.discount_amount || 0);
    const roundOff = Number(order?.round_off_amount || bill?.round_off_amount || 0);
    const oGrandTotal = Number(order?.total_amount || bill?.total_amount || 0);

    const getDisc = (it) => {
      if (it?.discount_amount !== undefined) return Number(it.discount_amount);
      if (it?.discount?.value) return Number(it.discount.value);
      return 0;
    };

    const hasLineDiscount = items.some((it) => getDisc(it) > 0);
    const cols = getBillCols(W, hasLineDiscount);
    const { name, qty, rate, disc, total, showDiscCol } = cols;

    const lines = [];

// === RESTAURANT NAME (center + bold; 80mm = 2xW/2xH, 58mm = normal) ===
const is80 = layout.paperMm >= 76;

lines.push(ALIGN_CENTER);

lines.push(
  MODE_BOLD +
    (is80 ? SIZE_2X : SIZE_1X) +
    restaurantName +
    SIZE_1X +
    MODE_NO_BOLD
);

// go back to normal flow
lines.push(ALIGN_LEFT);



    wrapText(address, W).forEach((l) =>
      lines.push(withMargins(center(l, W), layout))
    );
    if (phone)
      lines.push(withMargins(center(`Contact No.: ${phone}`, W), layout));
    if (restaurantProfile?.fssai_license)
      lines.push(
        withMargins(center(`FSSAI: ${restaurantProfile.fssai_license}`, W), layout)
      );
    if (restaurantProfile?.gst_enabled && restaurantProfile?.gstin)
      lines.push(
        withMargins(center(`GSTIN: ${restaurantProfile.gstin}`, W), layout)
      );

    lines.push(withMargins(dashes(), layout));

    // Meta
    lines.push(withMargins(`${dateStr} ${timeStr}`, layout));
    if (invoiceNo) lines.push(withMargins(`Invoice: ${invoiceNo}`, layout));
    if (billNo) lines.push(withMargins(`Bill No: ${billNo}`, layout));
    if (orderType) lines.push(withMargins(`Order Type: ${orderType}`, layout));
    if (order?.number_of_customers)
      lines.push(
        withMargins(`No. of Customers: ${order.number_of_customers}`, layout)
      );

    lines.push(withMargins(dashes(), layout));

    // Items Header
    let header =
      leftAlign("ITEM", name) +
      " " +
      rightAlign("QTY", qty) +
      " " +
      rightAlign("RATE", rate);

    if (showDiscCol) {
      header += " " + rightAlign("DISC", disc);
    }
    header += " " + rightAlign("TOTAL", total);

    lines.push(withMargins(header, layout));
    lines.push(withMargins(dashes(), layout));

    // Items
    items.forEach((it) => {
      const itemName = it?.name || "Item";
      const nameLines = wrapText(itemName, name);
      if (!nameLines.length) return;

      const rateNum = Number(it?.price || 0);
      const qtyNum = Number(it?.quantity || 1);
      const itemDiscount = getDisc(it);

      const p = Number.isInteger(it?.uom_precision)
        ? it.uom_precision
        : qtyNum % 1 === 0
        ? 0
        : 2;

      let qtyStr = qtyNum.toFixed(p);
      const uom = it?.uom_short_code || it?.uom || "";

      if (W >= 34 && uom && uom.toLowerCase() !== "pc") qtyStr += " " + uom;

      const grossLineTotal = rateNum * qtyNum;
      const netLineTotal = grossLineTotal - itemDiscount;

      const rateStr = rateNum % 1 === 0 ? rateNum.toFixed(0) : rateNum.toFixed(2);
      const totalStr = netLineTotal % 1 === 0 ? netLineTotal.toFixed(0) : netLineTotal.toFixed(2);
      const discStr =
        showDiscCol && itemDiscount > 0
          ? "-" + itemDiscount.toFixed(2)
          : showDiscCol
          ? "0.00"
          : "";

      let row1 =
        leftAlign(nameLines[0], name) +
        " " +
        rightAlignEnd(qtyStr, qty) +
        " " +
        rightAlignEnd(rateStr, rate);

      if (showDiscCol) {
        row1 += " " + rightAlignEnd(discStr, disc);
      }
      row1 += " " + rightAlignEnd(totalStr, total);

      lines.push(withMargins(row1, layout));

      for (let i = 1; i < nameLines.length; i++) {
        lines.push(withMargins(nameLines[i], layout));
      }

      if (!showDiscCol && itemDiscount > 0) {
        lines.push(
          withMargins(
            leftAlign(" (Disc: -" + itemDiscount.toFixed(2) + ")", W),
            layout
          )
        );
      }
    });

    lines.push(withMargins(dashes(), layout));

    // Totals
    const oSubtotalEx = Number(order?.subtotal_ex_tax || order?.subtotal_ex_gst || 0);
    const oTotalTax = Number(order?.total_tax || bill?.total_tax || 0);
    const displayNet = oSubtotalEx - orderDiscount;

    if (oSubtotalEx > 0 || oTotalTax > 0) {
      lines.push(withMargins(kvLine("Subtotal:", oSubtotalEx.toFixed(2), W), layout));
      
      if (orderDiscount > 0) {
        lines.push(withMargins(kvLine("Discount:", "-" + orderDiscount.toFixed(2), W), layout));
        lines.push(withMargins(kvLine("Net Amt:", displayNet.toFixed(2), W), layout));
      }

      if (oTotalTax > 0) {
        lines.push(withMargins(kvLine("GST:", oTotalTax.toFixed(2), W), layout));
      }

      if (roundOff !== 0) {
        lines.push(
          withMargins(
            kvLine(
              "Round Off:",
              (roundOff > 0 ? "+" : "") + roundOff.toFixed(2),
              W
            ),
            layout
          )
        );
      }
    lines.push(withMargins(dashes(), layout));

      // === GRAND TOTAL: BOLD + DOUBLE SIZE ===
      // FIX: Manually calculate spacing for double-width characters with buffer.
      // Double width means characters are effectively 2x wide, so we have W/2 columns.
      // We subtract 2 extra columns for safety buffer to prevent wrapping.
      const label = "Grand Total:";
      const val = oGrandTotal.toFixed(2);
      // Floor(W/2) minus 1 or 2 for margin safety on 58mm printers
      const effectiveW = Math.floor(W / 2) - 1; 
      
      let spacing = effectiveW - label.length - val.length;
      if (spacing < 1) spacing = 1;
      
      const gtLine = label + " ".repeat(spacing) + val;
      
const gtLabel = (oSubtotalEx > 0 || oTotalTax > 0) ? "Grand Total:" : "Total:";
const gtVal = oGrandTotal.toFixed(2);

if (is80) {
  // 2x width => use scaled width to avoid overflow/wrap
  lines.push(
    MODE_BOLD +
      SIZE_2X +
      withMargins(kvLineScaled(gtLabel, gtVal, W, 2), { ...layout, innerCols: Math.floor(W / 2) }) +
      SIZE_1X +
      MODE_NO_BOLD
  );
} else {
  // 58mm: keep it tall (double-height only), stable for alignment
  lines.push(
    MODE_BOLD +
      SIZE_2H +
      withMargins(kvLine(gtLabel, gtVal, W), layout) +
      SIZE_1X +
      MODE_NO_BOLD
  );
}

    } else {
      // === TOTAL (Simple): BOLD + DOUBLE SIZE ===
      const label = "Total:";
      const val = oGrandTotal.toFixed(2);
      // Floor(W/2) minus 1 or 2 for margin safety on 58mm printers
      const effectiveW = Math.floor(W / 2) - 1;
      
      let spacing = effectiveW - label.length - val.length;
      if (spacing < 1) spacing = 1;
      
      const gtLine = label + " ".repeat(spacing) + val;
      
  lines.push(
    MODE_BOLD +
      SIZE_2H +
      withMargins(kvLine("Total:", oGrandTotal.toFixed(2), W), layout) +
      SIZE_1X +
      MODE_NO_BOLD
  )
    }

    lines.push(withMargins(dashes(), layout));
    lines.push(withMargins(center("** THANK YOU! VISIT AGAIN !! **", W), layout));
    lines.push(withMargins(center("Powered by Cafe QR", W), layout));
    lines.push("");

    const body = lines.join("\n");
    const logoEsc = buildLogoEscPos(restaurantProfile);

    return escposPageSetup(layout) + logoEsc + body;
  } catch (e) {
    console.error(e);
    return "PRINT ERROR";
  }
}

export async function downloadPdfAndShare(order, bill, restaurantProfile) {
  return downloadTextAndShare(order, bill, restaurantProfile);
}
