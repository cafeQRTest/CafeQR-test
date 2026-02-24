// pages/api/push/send-notification.js
import { admin, ensureFirebaseAdminInitialized } from '../../../services/push/firebaseAdmin';

export async function sendOrderNotification(orderData, deviceTokens) {
  const init = ensureFirebaseAdminInitialized();
  if (!init.ok) {
    const missing = init.missing?.join(', ') || 'Firebase Admin env';
    throw new Error(`Firebase Admin not configured: ${missing}`);
  }

  const message = {
    notification: {
      title: '🔔 New Order Alert!',
      body: `Table ${orderData.table_number || 'N/A'} - Order #${String(orderData.id).slice(0, 8)}`
    },
    data: {
      type: 'new_order',
      orderId: String(orderData.id),
      restaurantId: String(orderData.restaurant_id),
      tableNumber: String(orderData.table_number || ''),
      amount: String(orderData.total_inc_tax || orderData.total_amount || 0),
      url: '/owner/orders',
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'orders',
        sound: 'beep',
      }
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { sound: 'default' } }
    },
    tokens: deviceTokens
  };

  const resp = await admin.messaging().sendEachForMulticast(message);
  return { success: true, successCount: resp.successCount, failureCount: resp.failureCount, responses: resp.responses };
}
