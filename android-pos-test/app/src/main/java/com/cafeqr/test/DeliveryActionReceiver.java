// DeliveryActionReceiver.java
package com.cafeqr.test;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Handles Accept / Decline action button taps from the persistent
 * delivery order notification. Calls the accept/decline API directly
 * (works even on cold start), dismisses the notification, and
 * launches MainActivity.
 */
public class DeliveryActionReceiver extends BroadcastReceiver {
    private static final String TAG = "DeliveryAction";
    // Use the deployed Vercel URL for API calls
    private static final String API_BASE = "https://test-cafeqr.vercel.app";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String orderId = intent.getStringExtra("orderId");
        String restaurantId = intent.getStringExtra("restaurantId");
        Log.d(TAG, "Action received: " + action + ", orderId: " + orderId + ", restaurantId: " + restaurantId);

        // Dismiss the persistent delivery notification
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(2); // DELIVERY_NOTIFICATION_ID = 2
        }

        // Stop the foreground service to kill the looping sound
        Intent stopService = new Intent(context, MyForegroundService.class);
        context.stopService(stopService);

        // Determine action type
        boolean isAccept = "com.cafeqr.test.ACTION_ACCEPT".equals(action);
        String actionParam = isAccept ? "accept" : "decline";

        // Call the API directly on a background thread using goAsync()
        final PendingResult pendingResult = goAsync();

        new Thread(() -> {
            try {
                if (orderId != null && restaurantId != null && !restaurantId.isEmpty()) {
                    if (isAccept) {
                        callAcceptApi(orderId, restaurantId);
                    } else {
                        callDeclineApi(orderId, restaurantId);
                    }
                } else {
                    Log.w(TAG, "Missing orderId or restaurantId, skipping API call");
                }
            } catch (Exception e) {
                Log.e(TAG, "API call failed: " + e.getMessage(), e);
            } finally {
                // Launch MainActivity after API call (regardless of result)
                try {
                    Intent launchIntent = new Intent(context, MainActivity.class);
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    launchIntent.putExtra("orderId", orderId);
                    launchIntent.putExtra("action", actionParam);
                    launchIntent.setData(
                        android.net.Uri.parse(API_BASE + "/owner/orders?highlight=" +
                            (orderId != null ? orderId : "") + "&action=" + actionParam)
                    );
                    context.startActivity(launchIntent);
                } catch (Exception e) {
                    Log.e(TAG, "Failed to launch MainActivity: " + e.getMessage(), e);
                }
                pendingResult.finish();
            }
        }).start();
    }

    private void callAcceptApi(String orderId, String restaurantId) throws Exception {
        URL url = new URL(API_BASE + "/api/orders/accept-delivery/");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        try {
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);

            String json = "{\"order_id\":\"" + orderId + "\",\"restaurant_id\":\"" + restaurantId + "\"}";
            try (OutputStream os = conn.getOutputStream()) {
                os.write(json.getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            Log.d(TAG, "Accept API response code: " + code);
        } finally {
            conn.disconnect();
        }
    }

    private void callDeclineApi(String orderId, String restaurantId) throws Exception {
        // Use Supabase service role to cancel — but since we don't have service key on device,
        // we'll use a dedicated decline endpoint. For now, call accept-delivery with a
        // decline action via a query parameter, or use a separate endpoint.
        // The simplest approach: create a decline-delivery API endpoint.
        URL url = new URL(API_BASE + "/api/orders/decline-delivery/");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        try {
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);

            String json = "{\"order_id\":\"" + orderId + "\",\"restaurant_id\":\"" + restaurantId + "\"}";
            try (OutputStream os = conn.getOutputStream()) {
                os.write(json.getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            Log.d(TAG, "Decline API response code: " + code);
        } finally {
            conn.disconnect();
        }
    }
}
