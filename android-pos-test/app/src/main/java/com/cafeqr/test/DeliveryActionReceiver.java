// DeliveryActionReceiver.java
package com.cafeqr.test;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Handles Accept / Decline action button taps from the persistent
 * delivery order notification. Dismisses the notification and
 * launches MainActivity with the appropriate action query parameter.
 */
public class DeliveryActionReceiver extends BroadcastReceiver {
    private static final String TAG = "DeliveryAction";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String orderId = intent.getStringExtra("orderId");
        Log.d(TAG, "Action received: " + action + ", orderId: " + orderId);

        // Dismiss the persistent delivery notification
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(2); // DELIVERY_NOTIFICATION_ID = 2
        }

        // Stop the foreground service to kill the looping sound
        Intent stopService = new Intent(context, MyForegroundService.class);
        context.stopService(stopService);

        // Determine action type
        String actionParam = "accept";
        if ("com.cafeqr.test.ACTION_DECLINE".equals(action)) {
            actionParam = "decline";
        }

        // Launch MainActivity with deep-link URL containing the action
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launchIntent.putExtra("orderId", orderId);
        launchIntent.putExtra("action", actionParam);
        // The WebView/Capacitor will pick up these extras or the URL
        launchIntent.setData(
            android.net.Uri.parse("https://test-cafeqr.vercel.app/owner/orders?highlight=" +
                (orderId != null ? orderId : "") + "&action=" + actionParam)
        );
        context.startActivity(launchIntent);
    }
}
