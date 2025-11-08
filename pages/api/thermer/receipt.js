// pages/api/thermer/receipt.js
export default async function handler(req, res) {
  try {
    const W = 32;                          // 58‑mm = 32 columns (Font A)
    const raw = String(req.query.t || '');
    const rows = raw.split(/\r?\n/);

    const out = {};
    let i = 0;

    for (let line of rows) {
      // Normalize TABs and clamp width
      line = line.replace(/\t/g, ' ');
      if (line.length > W) line = line.slice(0, W);

      // Center lines that were padded in app (header/address)
      const trimmed = line.trim();
      const leading = line.length - trimmed.length;
      const isDivider = /^-+$/.test(trimmed);
      const align = isDivider ? 0 : (leading >= 2 ? 1 : 0);  // 0:left, 1:center, 2:right

      out[i++] = { type: 0, content: trimmed || ' ', bold: 0, align, format: 0 };
    }

    res.setHeader('Content-Type', 'application/json');
    // Thermer expects JSON object with numeric keys (JSON_FORCE_OBJECT style)
    res.status(200).send(JSON.stringify(out));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
