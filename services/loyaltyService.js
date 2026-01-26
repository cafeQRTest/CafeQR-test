
/**
 * LoyaltyService
 * Centralized service to handle loyalty point calculations and transactions.
 */
export class LoyaltyService {
    /**
     * Records an earning transaction for a customer based on order total.
     */
    static async handleOrderEarning(supabase, {
        restaurant_id,
        customer_id,
        order_id,
        order_total,
        loyalty_amount_used = 0,
        loyalty_points_used = null // Optional: explicit points to deduct
    }) {
        if (!customer_id || !order_id) return { success: false, reason: 'Missing customer or order ID' };

        console.log(`[LoyaltyService] Processing earning for order ${order_id}, customer ${customer_id}`);

        try {
            // 1. Fetch Customer's Program
            const { data: custData, error: custErr } = await supabase
               .from('restaurant_customers')
               .select('loyalty_program_id')
               .eq('restaurant_id', restaurant_id)
               .eq('customer_id', customer_id)
               .single();
            
            if (custErr) throw custErr;
            
            let progId = custData?.loyalty_program_id;
            
            // If no specific program, find default
            if (!progId) {
               const { data: defProg } = await supabase
                 .from('loyalty_programs')
                 .select('id')
                 .eq('restaurant_id', restaurant_id)
                 .eq('is_default', true)
                 .maybeSingle();
               progId = defProg?.id;
            }

            if (!progId) return { success: false, reason: 'No loyalty program found' };

            // 2. Fetch Program Details
            const { data: prog } = await supabase
               .from('loyalty_programs')
               .select('*')
               .eq('id', progId)
               .single();

            if (!prog || !prog.is_active) return { success: false, reason: 'Program not active' };

            // 3. Calculate Rate
            let rate = 0;
            if (prog.earn_rate_ratio != null) {
                rate = prog.earn_rate_ratio > 0 ? (1 / prog.earn_rate_ratio) : 0;
            } else if (prog.amount_spent_conversion_rate) {
                rate = Number(prog.amount_spent_conversion_rate);
            }

            if (rate <= 0) return { success: false, reason: 'Invalid earn rate' };

            // 4. Check Min Order Value
            const minOrderValue = Number(prog.min_order_value_for_earning || prog.min_order_amount || 0);
            if (order_total < minOrderValue) {
                return { success: false, reason: 'Order total below minimum' };
            }

            // 5. Process Redemption (Priority: Deduct points first)
            if (loyalty_amount_used > 0) {
                // Calculate points for the amount (using redemption rate) OR use explicit points
                const redemptionPoints = loyalty_points_used != null 
                    ? Math.abs(loyalty_points_used)
                    : Math.ceil(loyalty_amount_used / (prog.redemption_conversion_rate || 1.0));
                
                await supabase.from('loyalty_transactions').upsert({
                    restaurant_id,
                    customer_id,
                    order_id,
                    txn_type: 'redeem',
                    points_delta: -redemptionPoints,
                    points_earned: 0,
                    points_redeemed: redemptionPoints,
                    amount_value: loyalty_amount_used,
                    note: `Redeemed on Order #${order_id.slice(0,8)}`,
                    created_at: new Date().toISOString()
                }, { onConflict: 'restaurant_id, order_id, txn_type' });
            }

            // 6. Calculate Effective Spend and Points for Earning
            const effectiveSpend = order_total - (loyalty_amount_used || 0);
            
            if (effectiveSpend <= 0) {
                 // Nothing left to earn points on, but success if we redeemed.
                 return { success: true, redeemed: loyalty_amount_used > 0, earned: false, reason: 'Effective spend zero' };
            }

            // Calculate Rate & Points
            // Note: `rate` calculation logic (Lines 57-65) should have happened before this block.
            // Assuming `rate` variable from earlier scope is available.
            // Wait, I am replacing lines 73+, so `rate` (calculated lines 58-62) is preserved above.
            
            const pointsEarned = Math.floor(effectiveSpend / rate);
            if (pointsEarned <= 0) {
                return { success: true, redeemed: loyalty_amount_used > 0, earned: false, reason: 'Points earned is zero' };
            }

            // 7. Check for existing "earn" transaction (Idempotency)
            const { data: existingTx } = await supabase
                .from('loyalty_transactions')
                .select('id, points_delta')
                .eq('order_id', order_id)
                .eq('txn_type', 'earn')
                .maybeSingle();

            if (existingTx) {
                if (existingTx.points_delta === pointsEarned) {
                    return { success: true, skipped: true, reason: 'Already rewarded' };
                }
                
                // Update existing
                const { error: updErr } = await supabase.from('loyalty_transactions')
                    .update({
                        points_delta: pointsEarned,
                        points_earned: pointsEarned,
                        amount_value: effectiveSpend,
                        note: `Updated earning based on edited order total`
                    })
                    .eq('id', existingTx.id);
                
                if (updErr) throw updErr;
                return { success: true, updated: true, points: pointsEarned };
            }

            // 8. Insert New Earning Transaction
            const { error: txInsertErr } = await supabase.from('loyalty_transactions').upsert({
                restaurant_id,
                customer_id,
                order_id,
                txn_type: 'earn',
                points_delta: pointsEarned,
                points_earned: pointsEarned,
                points_redeemed: 0,
                amount_value: effectiveSpend,
                created_at: new Date().toISOString()
            }, { onConflict: 'restaurant_id, order_id, txn_type' });

            if (txInsertErr) throw txInsertErr;

            return { success: true, awarded: true, points: pointsEarned };

        } catch (err) {
            console.error('[LoyaltyService] Error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Reverses all loyalty transactions for a given order (e.g. on void/cancel).
     */
    static async handleOrderReversal(supabase, {
        restaurant_id,
        order_id
    }) {
        try {
            console.log(`[LoyaltyService.handleOrderReversal] Fetching txs for order: ${order_id}`);
            const { data: txs, error: fetchErr } = await supabase
              .from('loyalty_transactions')
              .select('*')
              .eq('order_id', order_id)
              .eq('restaurant_id', restaurant_id);

            if (fetchErr) {
                console.error('[LoyaltyService.handleOrderReversal] Fetch error:', fetchErr);
                throw fetchErr;
            }

            if (!txs || txs.length === 0) {
                console.log('[LoyaltyService.handleOrderReversal] No transactions found to reverse');
                return { success: true, reason: 'No transactions to reverse' };
            }

            console.log(`[LoyaltyService.handleOrderReversal] Found ${txs.length} transactions. Processing reversals...`);

            const reversals = txs
                .filter(tx => tx.txn_type !== 'void' && tx.txn_type !== 'adjust') // Don't reverse reversals
                .map(tx => ({
                    restaurant_id: tx.restaurant_id,
                    customer_id: tx.customer_id,
                    order_id: tx.order_id,
                    txn_type: 'adjust',
                    points_delta: -(tx.points_delta || 0),
                    points_earned: -(tx.points_earned || 0),
                    points_redeemed: -(tx.points_redeemed || 0),
                    amount_value: -(tx.amount_value || 0),
                    note: `REVERSAL: ${tx.txn_type} voided for order ${order_id.slice(0,8)}`,
                    created_at: new Date().toISOString()
                }));

            if (reversals.length === 0) return { success: true, reason: 'Nothing to reverse' };

            // Aggregate multiple reversals for the same order into a single row to avoid unique constraint issues
            // on (restaurant_id, order_id, txn_type)
            const aggregatedReversal = reversals.reduce((acc, curr) => {
                return {
                    ...acc,
                    points_delta: acc.points_delta + curr.points_delta,
                    points_earned: acc.points_earned + curr.points_earned,
                    points_redeemed: acc.points_redeemed + curr.points_redeemed,
                    amount_value: acc.amount_value + curr.amount_value,
                    note: acc.note + " | " + curr.note
                };
            });

            console.log('[LoyaltyService.handleOrderReversal] Inserting aggregated reversal:', aggregatedReversal);
            const { error: revErr } = await supabase.from('loyalty_transactions').insert([aggregatedReversal]);
            if (revErr) {
                console.error('[LoyaltyService.handleOrderReversal] Insert error:', revErr);
                throw revErr;
            }

            return { success: true, reversedCount: reversals.length, aggregated: true };
        } catch (err) {
            console.error('[LoyaltyService] Reversal error:', err);
            return { success: false, error: err.message };
        }
    }
}
