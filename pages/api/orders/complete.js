// pages/api/orders/complete.js
import { createClient } from '@supabase/supabase-js';
import { OrderService } from '../../../services/orderService';
import { calculateOrderTotals } from '../../../utils/orderCalculations';

/**
 * API Endpoint to complete/settle an existing order.
 * This unifies frontend settlement logic with the backend persistence service.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    order_id,
    restaurant_id,
    payment_method = 'cash',
    discount_obj = null, // { type: 'percent', value: 10 } or { type: 'amount', value: 50 }
    round_off_amount = 0,
    updated_items = null, // Array of items with potential line-discounts
    mixed_payment_details = null,
    base_tax_rate = 5
  } = req.body;

  if (!order_id || !restaurant_id) {
    return res.status(400).json({ error: 'order_id and restaurant_id are required' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // 1. Fetch current order and settings
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', order_id)
      .single();

    if (orderErr || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const { data: profile } = await supabase
      .from('restaurant_profiles')
      .select('*')
      .eq('restaurant_id', restaurant_id)
      .single();

    // 2. Prepare items for calculation
    // Priority: updated_items (from frontend) > order_items (from DB)
    let calculationItems = [];
    if (updated_items && Array.isArray(updated_items)) {
      calculationItems = updated_items.map(it => ({
        ...it,
        id: it.menu_item_id || it.id,
        price: Number(it.price || 0),
        quantity: Number(it.quantity || 0),
        discount: it.discount || { type: 'amount', value: it.discount_amount || 0 }
      }));
    } else {
      calculationItems = order.order_items.map(oi => ({
        ...oi,
        id: oi.menu_item_id,
        price: Number(oi.price || 0),
        quantity: Number(oi.quantity || 0),
        discount: { type: 'amount', value: oi.discount_amount || 0 }
      }));
    }

    // 3. Run Calculation Engine
    // If round_off_amount is provided from frontend, use manual mode to preserve it
    const hasManualRoundOff = round_off_amount !== undefined && round_off_amount !== null && round_off_amount !== 0;
    
    const serviceInclude =
      !!profile?.gst_enabled &&
      (profile?.prices_include_tax === true ||
        profile?.prices_include_tax === 'true' ||
        profile?.prices_include_tax === 1 ||
        profile?.prices_include_tax === '1');

    const calcResult = calculateOrderTotals(
      calculationItems,
      discount_obj || 
        (order.total_discount_percent > 0 
          ? { type: 'percent', value: order.total_discount_percent } 
          : { type: 'amount', value: order.discount_amount || 0 }),
      {
        gst_enabled: !!profile?.gst_enabled,
        default_tax_rate: base_tax_rate || profile?.default_tax_rate || 5,
        prices_include_tax: serviceInclude,
        round_off_config: {
          round_off_enabled: !!profile?.round_off_enabled,
          round_off_mode: hasManualRoundOff ? 'manual' : (profile?.round_off_mode || 'automatic'),
          round_off_manual_value: hasManualRoundOff ? Number(round_off_amount) : 0,
          round_off_auto_factor: Number(profile?.round_off_auto_factor || 1)
        }
      }
    );

    // 4. Persist via Unified Service
    const result = await OrderService.persistCalculatedOrder(supabase, {
      orderId: order_id,
      restaurantId: restaurant_id,
      calculationResult: calcResult,
      metadata: {
        status: 'completed',
        payment_status: 'paid', // Standardize to 'paid'
        payment_method,
        customer_id: order.customer_id, // Persist customer link!
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        number_of_customers: order.number_of_customers,
        order_type: order.order_type,
        table_number: order.table_number,
        is_credit: payment_method === 'credit',
        credit_customer_id: order.credit_customer_id,
        mixed_payment_details,
        created_at: order.created_at
      }
    });

    // 4.1 Handle LOYALTY EARNING
    if (order.customer_id && calcResult.total_amount > 0 && payment_method !== 'credit') {
      try {
        const { LoyaltyService } = await import('../../../services/loyaltyService');
        await LoyaltyService.handleOrderEarning(supabase, {
          restaurant_id,
          customer_id: order.customer_id,
          order_id: order_id,
          order_total: calcResult.total_amount,
          loyalty_amount_used: req.body.loyalty_amount_used || 0,
          loyalty_points_used: req.body.loyalty_points_used || null
        });
      } catch (loyErr) {
        console.error('[/api/orders/complete] Loyalty error:', loyErr);
      }
    }

    // 5. Build response for printing
    // Re-fetch everything to ensure fidelity (or use OrderService return)
    const { data: finalOrder } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', order_id)
      .single();

    return res.status(200).json({
      success: true,
      order_id,
      invoice_no: result.invoiceNo,
      bill_no: result.billNo,
      order_for_print: finalOrder
    });

  } catch (error) {
    console.error('[/api/orders/complete] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
