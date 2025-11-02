// pages/api/invoices/generate.js

import { InvoiceService } from '../../../services/invoiceService'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    order_id,
    restaurant_id,
    payment_method = 'cash',
    mixed_payment_details = null,
    is_credit = false,
    credit_customer_id = null
  } = req.body;

  if (!order_id || typeof order_id !== 'string') {
    return res.status(400).json({ error: 'Valid Order ID is required' })
  }

  if (!restaurant_id || typeof restaurant_id !== 'string') {
    return res.status(400).json({ error: 'Valid Restaurant ID is required' })
  }

  try {
    // ✅ Step 1: Update order with mixed payment details FIRST (before invoice creation)
    if (mixed_payment_details) {
      const { error: orderUpdateErr } = await supabase
        .from('orders')
        .update({ 
          mixed_payment_details,
          payment_method, // Also update payment_method to 'mixed'
          actual_payment_method: payment_method
        })
        .eq('id', order_id)
        .eq('restaurant_id', restaurant_id);

      if (orderUpdateErr) {
        console.error('Failed to update order with mixed payment details:', orderUpdateErr);
        // Don't throw - continue with invoice generation
      }
    }

    // ✅ Step 2: Generate invoice using existing service
    const result = await InvoiceService.createInvoiceFromOrder(order_id, restaurant_id)

    // ✅ Step 3: Update invoice with payment method, credit info, and mixed_payment_details
    if (result.invoiceId) {
      const updatePayload = {
        payment_method: payment_method,
        status: is_credit ? 'open' : 'paid',
        is_open: is_credit,
        credit_customer_id: credit_customer_id || null
      };

      // Add mixed_payment_details if provided
      if (mixed_payment_details) {
        updatePayload.mixed_payment_details = mixed_payment_details;
      }

      const { error: updateErr } = await supabase
        .from('invoices')
        .update(updatePayload)
        .eq('id', result.invoiceId)
        .eq('restaurant_id', restaurant_id);

      if (updateErr) {
        console.error('Failed to update invoice metadata:', updateErr);
        // Continue anyway - invoice is created, just metadata update failed
      }
    }

    return res.status(200).json({ 
      pdf_url: result.pdfUrl,
      invoiceId: result.invoiceId,
      status: is_credit ? 'open' : 'paid',
      payment_method: payment_method,
      mixed_payment_details: mixed_payment_details || null
    })
    
  } catch (error) {
    // Fallback to return existing PDF if duplicate invoice exists (race condition)
    if ((error?.message || '').includes('unique') || (error?.message || '').includes('duplicate')) {
      try {
        const { data, error: fetchErr } = await supabase
          .from('invoices')
          .select('pdf_url, id, payment_method, mixed_payment_details, status')
          .eq('order_id', order_id)
          .eq('restaurant_id', restaurant_id)
          .single();

        if (fetchErr) {
          return res.status(500).json({ error: 'Could not retrieve existing invoice' });
        }

        return res.status(200).json({ 
          pdf_url: data?.pdf_url,
          invoiceId: data?.id,
          payment_method: data?.payment_method || 'cash',
          mixed_payment_details: data?.mixed_payment_details || null,
          status: data?.status || 'paid',
          existing: true
        });
      } catch (fetchError) {
        console.error('Error fetching existing invoice:', fetchError);
        return res.status(500).json({ error: 'Could not retrieve existing invoice' });
      }
    }

    console.error('Invoice generation error:', error);
    return res.status(500).json({ 
      error: error?.message || 'Failed to generate invoice',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}