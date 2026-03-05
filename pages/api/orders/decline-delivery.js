import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

function isPendingDeliveryOrder(order) {
    if (!order) return false;
    const status = String(order.status || '').toLowerCase();
    const orderType = String(order.order_type || '').toLowerCase();
    const table = String(order.table_number || '').toUpperCase();
    return status === 'pending_acceptance' && (orderType === 'delivery' || table === 'DELIVERY');
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!supabaseUrl || !supabaseKey || !supabase) {
        return res.status(500).json({ error: 'Server config error' });
    }

    try {
        const { order_id, restaurant_id } = req.body || {};
        if (!order_id || !restaurant_id) {
            return res.status(400).json({ error: 'order_id and restaurant_id are required' });
        }

        const { data: orderRow, error: orderErr } = await supabase
            .from('orders')
            .select('id, restaurant_id, status, order_type, table_number')
            .eq('id', order_id)
            .eq('restaurant_id', restaurant_id)
            .maybeSingle();

        if (orderErr) {
            return res.status(500).json({ error: orderErr.message || 'Failed to read order' });
        }
        if (!orderRow) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (!isPendingDeliveryOrder(orderRow)) {
            return res.status(200).json({
                ok: true,
                declined: false,
                status: orderRow.status,
                reason: 'not_pending_delivery',
            });
        }

        // Cancel the order
        const { data: cancelledRow, error: updateErr } = await supabase
            .from('orders')
            .update({ status: 'cancelled', description: 'Declined from push notification' })
            .eq('id', order_id)
            .eq('restaurant_id', restaurant_id)
            .eq('status', 'pending_acceptance')
            .select('id, status')
            .maybeSingle();

        if (updateErr) {
            return res.status(500).json({ error: updateErr.message || 'Failed to decline order' });
        }

        if (!cancelledRow) {
            const { data: latest } = await supabase
                .from('orders')
                .select('status')
                .eq('id', order_id)
                .eq('restaurant_id', restaurant_id)
                .maybeSingle();
            return res.status(200).json({
                ok: true,
                declined: false,
                status: latest?.status || 'unknown',
                reason: 'already_processed',
            });
        }

        // Release the DELIVERY table if applicable
        if (orderRow.table_number) {
            try {
                await supabase
                    .from('tables')
                    .update({ status: 'available', current_order_id: null })
                    .eq('restaurant_id', restaurant_id)
                    .eq('identifier', orderRow.table_number);
            } catch (e) {
                console.warn('[decline-delivery] table release failed:', e?.message || e);
            }
        }

        return res.status(200).json({
            ok: true,
            declined: true,
            status: 'cancelled',
        });
    } catch (e) {
        console.error('[decline-delivery] failed:', e?.message || e);
        return res.status(500).json({ error: e?.message || 'Failed to decline delivery order' });
    }
}
