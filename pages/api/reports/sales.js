//pages/api/reports/sales.js

import { getSupabase } from '../../../services/supabase';
import { Parser } from 'json2csv';

const supabase = getSupabase();

export default async function handler(req, res) {
  const { from, to, restaurant_id, report_type = 'all' } = req.query;

  if (!restaurant_id || !from || !to) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // Fetch all invoices in date range
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_no,
        invoice_date,
        customer_name,
        payment_method,
        subtotal_ex_tax,
        total_tax,
        cgst,
        sgst,
        igst,
        total_inc_tax,
        status
      `)
      .eq('restaurant_id', restaurant_id)
      .gte('invoice_date', `${from}T00:00:00Z`)
      .lte('invoice_date', `${to}T23:59:59Z`)
      .order('invoice_date', { ascending: true });

    if (error) throw error;

    // Filter based on report type
    let filteredInvoices = invoices || [];

    if (report_type === 'sales') {
      // Exclude CREDIT invoices - only PAID orders
      filteredInvoices = filteredInvoices.filter(inv => inv.payment_method !== 'credit');
    } else if (report_type === 'credit') {
      // Only CREDIT invoices (open, pending payment)
      filteredInvoices = filteredInvoices.filter(inv => inv.payment_method === 'credit');
    }
    // 'all' = include everything

    // Transform data for CSV with payment method details
    // In your GST export CSV
// Update csvData mapping to include mixed payment breakdown:

const csvData = invoices.map(inv => {
  let paymentMethodDisplay = inv.payment_method;
  
  // For mixed payments, show breakdown
  if (inv.payment_method === 'mixed' && inv.mixed_payment_details) {
    const { cash_amount, online_method } = inv.mixed_payment_details;
    paymentMethodDisplay = `Mixed (Cash: ₹${Number(cash_amount).toFixed(2)}, ${online_method.toUpperCase()}: ₹${inv.mixed_payment_details.online_amount})`;
  }
  
  return {
    'Invoice No': inv.invoice_no,
    'Date': new Date(inv.invoice_date).toLocaleDateString(),
    'Customer': inv.customer_name || 'N/A',
    'Taxable Value': parseFloat(inv.subtotal_ex_tax || 0).toFixed(2),
    'CGST': parseFloat(inv.cgst || 0).toFixed(2),
    'SGST': parseFloat(inv.sgst || 0).toFixed(2),
    'Total Tax': parseFloat(inv.total_tax || 0).toFixed(2),
    'Total Amount': parseFloat(inv.total_inc_tax || 0).toFixed(2),
    'Payment Method': paymentMethodDisplay,
    'Status': inv.status || 'paid'
  };
});


    // CSV Headers
    const fields = [
      'Invoice No',
      'Date',
      'Customer',
      'Taxable Value',
      'CGST (9%)',
      'SGST (9%)',
      'IGST (18%)',
      'Total Tax',
      'Total Amount',
      'Payment Method',
      'Status',
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(csvData);

    // Set response headers
    const fileName = `GST_Report_${report_type}_${from}_to_${to}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.status(200).send(csv);
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: error.message });
  }
}