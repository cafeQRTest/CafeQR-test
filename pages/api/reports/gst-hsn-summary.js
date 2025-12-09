// pages/api/reports/gst-hsn-summary.js

import { getSupabase } from '../../../services/supabase';
import { Parser } from 'json2csv';

const supabase = getSupabase();

export default async function handler(req, res) {
  const { from, to, restaurant_id } = req.query;

  if (!restaurant_id || !from || !to) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // 1) Load all invoice line items for the period, joined with invoice header
    const { data, error } = await supabase
      .from('invoice_items')
      .select(`
        hsn,
        qty,
        tax_rate,
        tax_amount,
        line_total_ex_tax,
        cess_amount,
        invoice:invoices (
          igst,
          cgst,
          sgst,
          status,
          invoice_date,
          restaurant_id
        )
      `)
      .eq('invoice.restaurant_id', restaurant_id)
      .gte('invoice.invoice_date', `${from}T00:00:00Z`)
      .lte('invoice.invoice_date', `${to}T23:59:59Z`);

    if (error) throw error;

    // 2) Filter out void/unpaid if you don’t want them in GST figures
    const validLines = (data || []).filter(row => {
      const st = String(row.invoice?.status || '').toLowerCase();
      return st !== 'unpaid' && st !== 'void';
    });

    // 3) Aggregate by HSN + rate + intra/inter state
    const groups = new Map();

    for (const row of validLines) {
      const hsn = row.hsn || 'NA';
      const rate = Number(row.tax_rate || 0);
      const qty = Number(row.qty || 0);
      const taxable = Number(row.line_total_ex_tax || 0);
      const lineTax = Number(row.tax_amount || 0);
      const cessAmt = Number(row.cess_amount || 0);
      const isInterState = Number(row.invoice?.igst || 0) > 0;

      let igstAmt = 0;
      let cgstAmt = 0;
      let sgstAmt = 0;

      if (isInterState) {
        igstAmt = lineTax;
      } else {
        cgstAmt = lineTax / 2;
        sgstAmt = lineTax / 2;
      }

      const key = `${hsn}__${rate.toFixed(2)}__${isInterState ? 'IGST' : 'CGST_SGST'}`;

      if (!groups.has(key)) {
        groups.set(key, {
          hsn,
          rate,
          isInterState,
          totalQty: 0,
          totalTaxable: 0,
          totalIGST: 0,
          totalCGST: 0,
          totalSGST: 0,
          totalCess: 0,
        });
      }

      const g = groups.get(key);
      g.totalQty += qty;
      g.totalTaxable += taxable;
      g.totalIGST += igstAmt;
      g.totalCGST += cgstAmt;
      g.totalSGST += sgstAmt;
      g.totalCess += cessAmt;
    }

    // 4) Build CSV records
    const rows = Array.from(groups.values()).map(g => ({
      HSN: g.hsn,
      Description: '',             // optional – can be filled manually by accountant
      UQC: 'NOS',                  // or leave blank / map from your own config
      'Rate %': g.rate.toFixed(2),
      'Total Quantity': g.totalQty.toFixed(3),
      'Total Taxable Value': g.totalTaxable.toFixed(2),
      'Integrated Tax': g.totalIGST.toFixed(2),
      'Central Tax': g.totalCGST.toFixed(2),
      'State Tax': g.totalSGST.toFixed(2),
      'Cess Amount': g.totalCess.toFixed(2),
    }));

    const fields = [
      'HSN',
      'Description',
      'UQC',
      'Rate %',
      'Total Quantity',
      'Total Taxable Value',
      'Integrated Tax',
      'Central Tax',
      'State Tax',
      'Cess Amount',
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    const fileName = `GST_HSN_Summary_${from}_to_${to}.csv`;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.status(200).send(csv);
  } catch (err) {
    console.error('GST HSN summary error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate HSN summary CSV' });
  }
}
