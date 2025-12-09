// pages/api/reports/sales.js

import { getSupabase } from '../../../services/supabase';
import { Parser } from 'json2csv';

const supabase = getSupabase();

export default async function handler(req, res) {
  const { from, to, restaurant_id, report_type = 'all' } = req.query;

  if (!restaurant_id || !from || !to) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // 1) Load invoices + line items for the period
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_no,
        invoice_date,
        customer_name,
        customer_gstin,
        place_of_supply,
        payment_method,
        subtotal_ex_tax,
        total_tax,
        cgst,
        sgst,
        igst,
        total_inc_tax,
        status,
        mixed_payment_details,
        invoice_items (
          line_no,
          item_name,
          hsn,
          qty,
          unit_rate_ex_tax,
          tax_rate,
          tax_amount,
          line_total_ex_tax,
          line_total_inc_tax,
          cess_rate,
          cess_amount
        )
      `)
      .eq('restaurant_id', restaurant_id)
      .gte('invoice_date', `${from}T00:00:00Z`)
      .lte('invoice_date', `${to}T23:59:59Z`)
      .order('invoice_date', { ascending: true })
      .order('line_no', { referencedTable: 'invoice_items', ascending: true });

    if (error) throw error;

    // 2) Base filtering (ignore totally unpaid invoices for GST)
    let filteredInvoices = (data || []).filter(
      inv => String(inv.status || '').toLowerCase() !== 'unpaid'
    );

    // 3) Filter by report type similar to billing screen
    const lowerReportType = String(report_type || 'all').toLowerCase();

    if (lowerReportType === 'sales') {
      filteredInvoices = filteredInvoices.filter(
        inv =>
          inv.payment_method !== 'credit' &&
          String(inv.status || '').toLowerCase() !== 'void'
      );
    } else if (lowerReportType === 'credit') {
      filteredInvoices = filteredInvoices.filter(
        inv =>
          inv.payment_method === 'credit' &&
          String(inv.status || '').toLowerCase() !== 'void'
      );
    } else if (lowerReportType === 'voided') {
      filteredInvoices = filteredInvoices.filter(
        inv => String(inv.status || '').toLowerCase() === 'void'
      );
    }
    // 'all' keeps everything except explicit unpaid

    // 4) Build item-wise CSV rows
    const rows = [];

    for (const inv of filteredInvoices) {
      // Normalised payment method, including mixed breakdown
      let paymentMethodDisplay = inv.payment_method || 'unknown';

      if (
        inv.payment_method === 'mixed' &&
        inv.mixed_payment_details
      ) {
        const details = inv.mixed_payment_details || {};
        const cash = Number(details.cash_amount || 0).toFixed(2);
        const onlineAmt = Number(details.online_amount || 0).toFixed(2);
        const onlineMethod = (details.online_method || 'online').toUpperCase();
        paymentMethodDisplay = `Mixed (Cash ₹${cash} + ₹${onlineAmt} ${onlineMethod})`;
      }

      const common = {
        'Invoice No': inv.invoice_no,
        'Date': new Date(inv.invoice_date).toLocaleDateString('en-IN'),
        'Customer Name': inv.customer_name || 'Walk-in',
        'Customer GSTIN': inv.customer_gstin || '',
        'Place of Supply': inv.place_of_supply || '',
        'Payment Method': paymentMethodDisplay,
        'Status': inv.status || 'paid',
      };

      const items = inv.invoice_items || [];

      if (!items.length) {
        // Fallback: still emit one line so invoice is visible
        rows.push({
          ...common,
          'Line No': '',
          'Item Name': '',
          HSN: '',
          'Tax Rate %': '',
          Qty: '',
          'Unit Rate (Ex Tax)': '',
          'Line Taxable Value': '',
          'CGST Amt': '',
          'SGST Amt': '',
          'IGST Amt': '',
          'Cess %': '',
          'Cess Amt': '',
          'Line Total Incl Tax': '',
        });
        continue;
      }

      const isInterState = Number(inv.igst || 0) > 0;

      for (const line of items) {
        const qty = Number(line.qty || 0);
        const unitRateEx = Number(line.unit_rate_ex_tax || 0);
        const lineTaxable = Number(line.line_total_ex_tax || qty * unitRateEx);
        const totalLineTax = Number(line.tax_amount || 0);
        const lineTotalIncTax = Number(
          line.line_total_inc_tax || lineTaxable + totalLineTax
        );

        let cgstAmt = 0;
        let sgstAmt = 0;
        let igstAmt = 0;

        if (isInterState) {
          // Inter‑state: entire GST goes to IGST
          igstAmt = totalLineTax;
        } else {
          // Intra‑state: GST split equally between CGST and SGST
          cgstAmt = totalLineTax / 2;
          sgstAmt = totalLineTax / 2;
        }

        rows.push({
          ...common,
          'Line No': line.line_no,
          'Item Name': line.item_name,
          HSN: line.hsn || '',
          'Tax Rate %': Number(line.tax_rate || 0).toFixed(2),
          Qty: qty,
          'Unit Rate (Ex Tax)': unitRateEx.toFixed(2),
          'Line Taxable Value': lineTaxable.toFixed(2),
          'CGST Amt': cgstAmt.toFixed(2),
          'SGST Amt': sgstAmt.toFixed(2),
          'IGST Amt': igstAmt.toFixed(2),
          'Cess %': Number(line.cess_rate || 0).toFixed(2),
          'Cess Amt': Number(line.cess_amount || 0).toFixed(2),
          'Line Total Incl Tax': lineTotalIncTax.toFixed(2),
        });
      }
    }

    // 5) CSV headers (must match keys above)
    const fields = [
      'Invoice No',
      'Date',
      'Customer Name',
      'Customer GSTIN',
      'Place of Supply',
      'Line No',
      'Item Name',
      'HSN',
      'Tax Rate %',
      'Qty',
      'Unit Rate (Ex Tax)',
      'Line Taxable Value',
      'CGST Amt',
      'SGST Amt',
      'IGST Amt',
      'Cess %',
      'Cess Amt',
      'Line Total Incl Tax',
      'Payment Method',
      'Status',
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    const fileName = `GST_Itemwise_Report_${report_type}_${from}_to_${to}.csv`;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.status(200).send(csv);
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate CSV' });
  }
}
