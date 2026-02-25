import { admin, ensureFirebaseAdminInitialized } from './firebaseAdmin';

const isDev = process.env.NODE_ENV !== 'production';

function tokenPrefix(token = '', n = 12) {
  return String(token || '').slice(0, n);
}

function orderLocationLabel(orderType, tableNumber) {
  const t = String(tableNumber || '').trim();
  const o = String(orderType || '').trim().toLowerCase();
  if (t && t.toUpperCase() === 'DELIVERY') return 'Delivery';
  if (t && !Number.isNaN(Number(t))) return `Table ${t}`;
  if (o === 'delivery') return 'Delivery';
  if (o === 'takeaway' || o === 'parcel') return 'Takeaway';
  if (o === 'counter') return 'Counter';
  if (t) return t;
  return 'Order';
}

function formatAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  return ` • ₹${n.toFixed(2)}`;
}

async function fetchRestaurantTokens(supabase, restaurantId) {
  let rows = [];
  let error = null;

  // Preferred path: enabled flag.
  const enabledQuery = await supabase
    .from('push_subscription_restaurants')
    .select('device_token, platform')
    .eq('restaurant_id', restaurantId)
    .eq('enabled', true);

  if (!enabledQuery.error) {
    rows = enabledQuery.data || [];
  } else {
    // Backward-compatible fallback if old schema doesn't have `enabled`.
    const fallback = await supabase
      .from('push_subscription_restaurants')
      .select('device_token, platform')
      .eq('restaurant_id', restaurantId);

    rows = fallback.data || [];
    error = fallback.error || null;
  }

  return { rows, error };
}

async function markLogRow(supabase, id, patch) {
  if (!id) return;
  try {
    await supabase
      .from('push_notifications_log')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
  } catch (e) {
    console.warn('[push:new_order] log update failed:', e?.message || e);
  }
}

export async function sendNewOrderPush({
  supabase,
  restaurantId,
  orderId,
  orderType = null,
  tableNumber = null,
  totalAmount = null,
}) {
  if (!supabase) return { ok: false, reason: 'no_supabase' };
  if (!restaurantId || !orderId) return { ok: false, reason: 'missing_ids' };

  const now = new Date().toISOString();

  // Idempotency gate: if already logged for this order/kind, skip sending.
  const { data: logRow, error: logErr } = await supabase
    .from('push_notifications_log')
    .insert({
      restaurant_id: restaurantId,
      order_id: orderId,
      kind: 'new_order',
      dedupe_key: `new_order:${orderId}`,
      status: 'queued',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();

  let logId = null;
  if (logErr) {
    if (logErr.code === '23505') {
      console.log('[push:new_order] duplicate skipped', { restaurantId, orderId });
      return { ok: true, duplicate: true, successCount: 0, failureCount: 0 };
    }
    const missingLogTable =
      logErr.code === '42P01' ||
      String(logErr.message || '').toLowerCase().includes('push_notifications_log');
    if (missingLogTable) {
      console.warn('[push:new_order] push_notifications_log table missing; sending without idempotency');
    } else {
      console.error('[push:new_order] log insert failed:', logErr);
      return { ok: false, reason: 'log_insert_failed', error: logErr.message };
    }
  } else {
    logId = logRow?.id || null;
  }

  // Guard: only send for orders still in "new" status.
  const { data: orderRow } = await supabase
    .from('orders')
    .select('status, table_number, order_type, total_amount, total_inc_tax, total')
    .eq('id', orderId)
    .maybeSingle();

  const resolvedStatus = String(orderRow?.status || 'new').toLowerCase();
  if (resolvedStatus !== 'new') {
    await markLogRow(supabase, logId, { status: 'skipped_not_new', success_count: 0, failure_count: 0 });
    return { ok: true, skipped: true, reason: 'status_not_new', successCount: 0, failureCount: 0 };
  }

  const resolvedTable = orderRow?.table_number ?? tableNumber;
  const resolvedOrderType = orderRow?.order_type ?? orderType;
  const resolvedAmount = orderRow?.total_amount ?? orderRow?.total_inc_tax ?? orderRow?.total ?? totalAmount;

  const { rows, error: tokenFetchErr } = await fetchRestaurantTokens(supabase, restaurantId);
  if (tokenFetchErr) {
    await markLogRow(supabase, logId, { status: 'token_fetch_failed', success_count: 0, failure_count: 0 });
    console.error('[push:new_order] token fetch failed:', tokenFetchErr);
    return { ok: false, reason: 'token_fetch_failed', error: tokenFetchErr.message };
  }

  const uniqueTokens = Array.from(new Set((rows || []).map((r) => r.device_token).filter(Boolean)));
  if (!uniqueTokens.length) {
    await markLogRow(supabase, logId, { status: 'no_subscribers', success_count: 0, failure_count: 0 });
    console.log('[push:new_order] no subscribers', { restaurantId });
    return { ok: true, successCount: 0, failureCount: 0 };
  }

  const firebaseInit = ensureFirebaseAdminInitialized();
  if (!firebaseInit.ok) {
    await markLogRow(supabase, logId, { status: 'missing_firebase_env', success_count: 0, failure_count: 0 });
    console.warn('[push:new_order] Firebase Admin unavailable; push skipped', {
      reason: firebaseInit.reason,
      missing: firebaseInit.missing || [],
    });
    return { ok: false, reason: 'firebase_not_initialized', details: firebaseInit };
  }

  const shortOrderId = String(orderId).slice(0, 8).toUpperCase();
  const locationLabel = orderLocationLabel(resolvedOrderType, resolvedTable);
  const body = `${locationLabel} • #${shortOrderId}${formatAmount(resolvedAmount)}`;
  const url = `/owner/orders?highlight=${encodeURIComponent(String(orderId))}`;

  const message = {
    tokens: uniqueTokens,
    notification: {
      title: 'New Order',
      body,
    },
    data: {
      type: 'new_order',
      orderId: String(orderId),
      restaurantId: String(restaurantId),
      url,
      title: 'New Order',
      body,
    },
    webpush: {
      fcmOptions: { link: url },
      notification: {
        title: 'New Order',
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: `new-order-${orderId}`,
      },
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'orders_sound',
        sound: 'beep',
        tag: `new-order-${orderId}`,
      },
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { sound: 'beep.wav' } },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    const invalidTokens = [];

    response.responses.forEach((resp, index) => {
      if (!resp.success) {
        const code = resp.error?.code || '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
          invalidTokens.push(uniqueTokens[index]);
        }
      }
    });

    if (invalidTokens.length) {
      await supabase
        .from('push_subscription_restaurants')
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .in('device_token', invalidTokens)
        .eq('restaurant_id', restaurantId);
    }

    await markLogRow(supabase, logId, {
      status: response.failureCount > 0 ? 'sent_partial' : 'sent',
      success_count: response.successCount,
      failure_count: response.failureCount,
      token_count: uniqueTokens.length,
      payload: {
        title: 'New Order',
        body,
        orderId,
        restaurantId,
        tokenPrefixes: uniqueTokens.map((t) => tokenPrefix(t)),
      },
    });

    console.log('[push:new_order] send result', {
      restaurantId,
      orderId,
      successCount: response.successCount,
      failureCount: response.failureCount,
      tokenCount: uniqueTokens.length,
    });

    return {
      ok: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      tokenCount: uniqueTokens.length,
      pruned: invalidTokens.length,
    };
  } catch (e) {
    await markLogRow(supabase, logId, {
      status: 'failed',
      success_count: 0,
      failure_count: uniqueTokens.length,
      token_count: uniqueTokens.length,
      error_message: e?.message || 'send_failed',
    });
    console.error('[push:new_order] FCM send failed:', e?.message || e);
    return { ok: false, reason: 'send_failed', error: e?.message || 'send_failed' };
  }
}
