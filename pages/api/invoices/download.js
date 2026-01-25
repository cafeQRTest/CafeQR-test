// pages/api/invoices/download.js
import { createClient } from '@supabase/supabase-js';
import { generateBillPdf } from '../../../lib/generateBillPdf';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { order_id } = req.query;
    if (!order_id) {
      return res.status(400).json({ error: 'order_id is required' });
    }

    // 1) Load order with items (for header / fallbacks)
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, order_items(*, menu_items(name))')
      .eq('id', order_id)
      .single();

    if (orderErr || !order) {
      throw new Error('Order not found');
    }

    // 1b) Load invoice header
    const { data: invoice, error: invoiceErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('order_id', order_id)
      .maybeSingle();

    if (invoiceErr) {
      throw new Error('Failed to load invoice data');
    }

    // 1c) Load invoice line items – source of truth for print
    const { data: invoiceItems, error: invItemsErr } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoice?.id);

    if (invItemsErr) {
      throw new Error('Failed to load invoice items');
    }

    // 2) Load restaurant + profile
    const { data: restaurant, error: restErr } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', order.restaurant_id)
      .single();
    if (restErr || !restaurant) throw new Error('Restaurant not found');

    const { data: profile } = await supabase
      .from('restaurant_profiles')
      .select('*')
      .eq('restaurant_id', order.restaurant_id)
      .maybeSingle();

    // 3) Build payloads for PDF Generator
    // Signature: generateBillPdf(invoice, items, totals)

    // A. Invoice Header
    const invoiceHeader = {
      invoice_no: invoice?.invoice_no || `ORD-${order_id.slice(0, 8)}`,
      // Use created_at timestamp for accurate time. invoice_date might be Date-only (00:00 UTC -> 05:30 IST)
      invoice_date: new Date(invoice?.created_at || order.created_at || new Date()).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
      }),
      customer_name: invoice?.customer_name || order.customer_name || 'Guest',
      customer_phone: invoice?.customer_phone || order.customer_phone || ''
    };

    // C. Totals - Unified Derivation (Declare before map)
    let sumTaxable = 0;
    let sumTax = 0;
    let sumTotal = 0;
    let sumGrossBase = 0;
    let sumOrderDiscBase = 0;

    // B. Items
    const pdfItems = (invoiceItems || []).map((row, idx) => {
      let finalName = row.item_name;
      if (!finalName || finalName === 'Unknown Item') {
          const match = order.order_items?.[idx]; 
          if (match) finalName = match.menu_items?.name || match.item_name || 'Item';
      }
      // Use stored variant name if available (Audit Fidelity)
      if (row.variant_name && !finalName.includes(row.variant_name)) {
          finalName += ` (${row.variant_name})`;
      }

      const qty = Number(row.qty || 0);
      const rateEx = Number(row.unit_rate_ex_tax || 0);
      const taxRate = Number(row.tax_rate || 0);
      const lineDiscAmt = Number(row.line_discount_amount || row.discount_amount || 0);
      const orderDiscBaseShare = Number(row.order_discount_base_share || 0);
      
      const isInclusive = taxRate > 0 && !!profile?.prices_include_tax;
      let displayRate = Number(row.unit_price_display || 0);
      if (!displayRate) {
          displayRate = isInclusive ? rateEx * (1 + taxRate / 100) : rateEx;
      }
      
      const taxableValue = Number(row.line_net || row.taxable_amount || (qty * rateEx) - orderDiscBaseShare);
      // Fallback: Calculate tax amount if missing in DB but rate exists
      let taxAmount = Number(row.tax_amount || 0);
      if (taxAmount === 0 && taxRate > 0) {
          taxAmount = taxableValue * (taxRate / 100);
      }
      
      // Line Total: Should be Inclusive of Tax
      // If DB has valid inclusive total, use it. Else derive.
      const lineTotal = Number(row.line_total_inc_tax || row.amount_inc_gst || (taxableValue + taxAmount));

      // Accumulate Totals
      sumTaxable += taxableValue;
      sumTax += taxAmount;
      sumTotal += lineTotal;
      sumOrderDiscBase += orderDiscBaseShare;
      
      // Derive gross base for the walk (Taxable + Base Discount share)
      sumGrossBase += (taxableValue + orderDiscBaseShare);

      return {
        item_name: finalName,
        quantity: qty,
        unit_price: displayRate, 
        discount_amount: lineDiscAmt,
        order_discount_base_share: orderDiscBaseShare,
        taxable_value: taxableValue,
        tax_amount: taxAmount,
        line_total: lineTotal,
        tax_rate: taxRate // Pass explicit rate to PDF generator
      };
    });

    // C. Totals - Unified Derivation from PDF Items
    // If we recalculated tax above, we must ensure totals.total_tax uses the sum
    // rather than the stale invoice header value.


    const roundOff = Number(invoice?.round_off_amount || order.round_off_amount || 0);
    const grandTotal = Number(invoice?.total_amount || order.total_amount || (sumTotal + roundOff));
    
    const gstRate = Number(invoice?.gst_rate || profile?.default_tax_rate || 5);
    const halfRate = Number((gstRate / 2).toFixed(2));
    const halfTax = sumTax / 2;

    const totals = {
      line_subtotal: sumGrossBase, // Gross Ex-Tax before Bill Discount
      order_discount_base: sumOrderDiscBase, // Correct GST Base Deduction
      taxable_amount: sumTaxable,
      total_tax: sumTax,
      total_tax_added: Number(invoice?.total_tax_added || order.total_tax_added || 0),
      total_tax_included: Number(invoice?.total_tax_included || order.total_tax_included || 0),
      cgst_amount: halfTax,
      sgst_amount: halfTax,
      cgst_rate: halfRate,
      sgst_rate: halfRate,
      gst_rate: gstRate,
      round_off_amount: roundOff,
      total_amount: grandTotal
    };

    // 4) Generate PDF
    const { buffer, filename } = await generateBillPdf(
      invoiceHeader,
      pdfItems,
      totals,
      {
        name: restaurant.name,
        address: [
          profile?.shipping_address_line1,
          profile?.shipping_address_line2,
          profile?.shipping_city,
          profile?.shipping_state,
          profile?.shipping_pincode,
        ].filter(Boolean).join(', '),
        phone: profile?.shipping_phone || profile?.phone || '',
        email: profile?.support_email || '',
        gstin: profile?.gstin || ''
      }
    );

    // 5) Send file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    res.setHeader('Content-Length', buffer.length);

    return res.status(200).end(buffer);
  } catch (e) {
    console.error('Download invoice error', e);
    return res
      .status(400)
      .json({ error: e.message || 'Failed to generate invoice PDF' });
  }
}
