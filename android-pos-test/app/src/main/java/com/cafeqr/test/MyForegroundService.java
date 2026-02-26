// MyForegroundService.java
package com.cafeqr.test;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

public class MyForegroundService extends Service {
    private static final String CHANNEL_ID = "orders";
    private static final String CHANNEL_NAME = "Order Alerts";
    private static final String DELIVERY_CHANNEL_ID = "delivery_alerts";
    private static final String DELIVERY_CHANNEL_NAME = "Delivery Order Alerts";
    private static final int NOTIFICATION_ID = 1;
    private static final int DELIVERY_NOTIFICATION_ID = 2;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String type = intent.getStringExtra("type");
        boolean isDelivery = "delivery_pending".equals(type);

        createNotificationChannel();
        if (isDelivery) {
            createDeliveryNotificationChannel();
        }

        Notification notification = isDelivery
            ? buildDeliveryNotification(intent)
            : buildNotification(intent);

        startForeground(isDelivery ? DELIVERY_NOTIFICATION_ID : NOTIFICATION_ID, notification);
        stopSelf();
        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Channel for new order notifications");
            Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.beep);
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();
            channel.setSound(soundUri, audioAttributes);
            channel.enableVibration(true);
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            notificationManager.createNotificationChannel(channel);
        }
    }

    private void createDeliveryNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                DELIVERY_CHANNEL_ID,
                DELIVERY_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_MAX
            );
            channel.setDescription("Persistent alerts for incoming delivery orders");
            Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.beep);
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_ALARM)
                .build();
            channel.setSound(soundUri, audioAttributes);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 500, 200, 500});
            channel.enableLights(true);
            channel.setLightColor(0xFFF97316); // Orange
            channel.setBypassDnd(true);
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            notificationManager.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(Intent intent) {
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        String orderId = intent.getStringExtra("orderId");

        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        notificationIntent.putExtra("orderId", orderId);

        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent, PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.beep);
            notificationBuilder.setSound(soundUri);
        }

        return notificationBuilder.build();
    }

    private Notification buildDeliveryNotification(Intent intent) {
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        String orderId = intent.getStringExtra("orderId");

        // Tap body → open orders page
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        notificationIntent.putExtra("orderId", orderId);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this, 100, notificationIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Accept action
        Intent acceptIntent = new Intent(this, DeliveryActionReceiver.class);
        acceptIntent.setAction("com.cafeqr.test.ACTION_ACCEPT");
        acceptIntent.putExtra("orderId", orderId);
        PendingIntent acceptPending = PendingIntent.getBroadcast(
            this, 200, acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Decline action
        Intent declineIntent = new Intent(this, DeliveryActionReceiver.class);
        declineIntent.setAction("com.cafeqr.test.ACTION_DECLINE");
        declineIntent.putExtra("orderId", orderId);
        PendingIntent declinePending = PendingIntent.getBroadcast(
            this, 300, declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, DELIVERY_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(false)        // Don't dismiss on tap
            .setOngoing(true)             // Can't swipe away
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setContentIntent(contentIntent)
            .addAction(0, "\u2705 Accept", acceptPending)
            .addAction(0, "\u274c Decline", declinePending);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.beep);
            builder.setSound(soundUri);
        }

        Notification notification = builder.build();

        // FLAG_INSISTENT makes the sound loop until user interacts
        notification.flags |= Notification.FLAG_INSISTENT;

        return notification;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
