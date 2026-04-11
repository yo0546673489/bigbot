package com.bigbot.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class BigBotApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel("rides", "נסיעות", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "התראות על נסיעות חדשות"
                }
            )
            manager.createNotificationChannel(
                NotificationChannel("status", "סטטוס", NotificationManager.IMPORTANCE_DEFAULT)
            )
        }
    }
}
