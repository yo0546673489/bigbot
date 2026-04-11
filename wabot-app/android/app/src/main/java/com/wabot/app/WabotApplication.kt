package com.wabot.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class WabotApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)

            nm.createNotificationChannel(
                NotificationChannel(
                    "rides",
                    getString(R.string.notification_channel_rides),
                    NotificationManager.IMPORTANCE_HIGH
                ).apply { description = "נסיעות חדשות שמתאימות לך" }
            )

            nm.createNotificationChannel(
                NotificationChannel(
                    "service",
                    getString(R.string.notification_channel_service),
                    NotificationManager.IMPORTANCE_LOW
                ).apply { description = "שירות רקע של ביגבוט" }
            )
        }
    }
}
