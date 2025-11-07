// pages/api/thermer/receipt.js
export default async function handler(req, res) {
  try {
    const t = req.query.t || '';
    const html = `<pre style="font-family:monospace">${String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre>`;
    const payload = { "0": { type: 4, content: html }, "1": { type: 0, content: " ", bold: 0, align: 0, format: 0 } };
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(payload));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
