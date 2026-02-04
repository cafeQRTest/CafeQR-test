// MyFirebaseMessagingService.java
package com.cafeqr.test;

import android.content.Intent;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class MyFirebaseMessagingService extends FirebaseMessagingService {
    private static final String TAG = "FCM_Service";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Log.d(TAG, "=== FCM MESSAGE RECEIVED ===");
        Log.d(TAG, "From: " + remoteMessage.getFrom());
        Log.d(TAG, "Message ID: " + remoteMessage.getMessageId());
        Log.d(TAG, "Data payload size: " + remoteMessage.getData().size());

        if (remoteMessage.getData().size() > 0) {
            Log.d(TAG, "Data payload: " + remoteMessage.getData());

            String title = remoteMessage.getNotification() != null ? remoteMessage.getNotification().getTitle() : remoteMessage.getData().get("title");
            String body = remoteMessage.getNotification() != null ? remoteMessage.getNotification().getBody() : remoteMessage.getData().get("body");
            String orderId = remoteMessage.getData().get("orderId");

            if (title != null && body != null && orderId != null) {
                Intent foregroundServiceIntent = new Intent(this, MyForegroundService.class);
                foregroundServiceIntent.putExtra("title", title);
                foregroundServiceIntent.putExtra("body", body);
                foregroundServiceIntent.putExtra("orderId", orderId);
                ContextCompat.startForegroundService(this, foregroundServiceIntent);
            } else {
                Log.e(TAG, "Notification title, body, or orderId missing in payload.");
            }
        }
    }
}
