// pages/api/invoices/void.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { invoice_id, restaurant_id, reason } = req.body || {};
    if (!invoice_id || !restaurant_id) return res.status(400).json({ error: 'invoice_id and restaurant_id are required' });

    // Load invoice + related order id and customer
    const { data: inv, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .eq('restaurant_id', restaurant_id)
      .single();
    if (invErr || !inv) return res.status(404).json({ error: 'Invoice not found' });

    if (String(inv.status || '').toLowerCase() === 'void') {
      return res.status(200).json({ ok: true, alreadyVoided: true });
    }

    // 1) Mark invoice VOID (no deletion)
    const { error: updInvErr } = await supabase
      .from('invoices')
      .update({
        status: 'void',
        is_open: false,
        regeneration_reason: reason ? `void: ${reason}` : 'void',
        closed_date: new Date().toISOString()
      })
      .eq('id', invoice_id)
      .eq('restaurant_id', restaurant_id);
    if (updInvErr) return res.status(400).json({ error: updInvErr.message });

    // 2) Cancel linked order (if present)
    if (inv.order_id) {
      await supabase
        .from('orders')
        .update({ status: 'cancelled', payment_status: 'cancelled' })
        .eq('id', inv.order_id)
        .eq('restaurant_id', restaurant_id);
    }

    // 3) If it was a credit invoice, reverse customer balances and log an adjustment
    if (inv.payment_method === 'credit' && inv.credit_customer_id && inv.total_inc_tax) {
      const amount = Number(inv.total_inc_tax || 0);

      // Fetch current balances
      const { data: cust, error: custErr } = await supabase
        .from('credit_customers')
        .select('current_balance, total_credit_extended')
        .eq('id', inv.credit_customer_id)
        .single();
      if (!custErr && cust) {
        const newBalance = Math.max(0, (cust.current_balance || 0) - amount);
        const newExtended = Math.max(0, (cust.total_credit_extended || 0) - amount);

        await supabase
          .from('credit_customers')
          .update({
            current_balance: newBalance,
            total_credit_extended: newExtended,
            last_transaction: new Date().toISOString()
          })
          .eq('id', inv.credit_customer_id);

        // Write an adjustment (negative) entry for audit and reporting
        await supabase.from('credit_transactions').insert({
          restaurant_id,
          credit_customer_id: inv.credit_customer_id,
          order_id: inv.order_id,
          transaction_type: 'adjustment',        // allowed by your CHECK constraint
          amount: -amount,                        // negative reduces outstanding
          payment_method: 'credit',
          description: `Invoice ${inv.invoice_no} voided${reason ? `: ${reason}` : ''}`,
          transaction_date: new Date().toISOString()
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to void invoice' });
  }
}
