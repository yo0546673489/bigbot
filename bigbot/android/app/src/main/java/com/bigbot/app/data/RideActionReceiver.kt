package com.bigbot.app.data

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.bigbot.app.data.models.Ride
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Handles the action buttons on ride notifications (ת לקבוצה / ת לפרטי / ת לשניהם).
 * Sends the action over WebSocket and updates ONLY the pressed button to
 * "נשלח ✓" — the other buttons stay clickable, mirroring the in-app ride card.
 */
@AndroidEntryPoint
class RideActionReceiver : BroadcastReceiver() {

    @Inject lateinit var wsService: WebSocketService

    override fun onReceive(context: Context, intent: Intent) {
        val rideId = intent.getStringExtra(EXTRA_RIDE_ID) ?: return
        val action = intent.getStringExtra(EXTRA_ACTION) ?: return
        Log.d("RideActionRX", "action=$action rideId=$rideId")

        // action may be "take_ride_link:phone:text" — split it out
        val parts = action.split(":")
        val baseAction = parts[0]
        val linkPhone = if (parts.size > 1) parts[1] else ""
        val linkText  = if (parts.size > 2) parts.drop(2).joinToString(":") else ""

        // Forward to server over the singleton WS. Safe to call even if the
        // socket is momentarily down — server-side buffer handles reconnects.
        try {
            wsService.sendRideAction(rideId, baseAction, linkPhone, linkText)
        } catch (e: Exception) {
            Log.e("RideActionRX", "sendRideAction failed: ${e.message}")
        }

        // Mark this specific action as sent and rebuild the notification —
        // only the pressed button flips to "נשלח ✓", others stay clickable.
        NotificationHelper.markActionSent(rideId, baseAction)
        val cached = NotificationHelper.getRide(rideId) ?: Ride(messageId = rideId)
        try {
            // Rebuild silently so the button update doesn't re-ring the chime.
            val notif = NotificationHelper.buildRideNotification(
                context, cached,
                sentActions = NotificationHelper.sentActionsFor(rideId),
                silent = true
            )
            NotificationManagerCompat.from(context)
                .notify(NotificationHelper.rideNotifId(rideId), notif)
        } catch (e: Exception) {
            Log.w("RideActionRX", "update notif failed: ${e.message}")
        }
    }

    companion object {
        private const val EXTRA_RIDE_ID = "rideId"
        private const val EXTRA_ACTION = "action"

        fun pendingIntent(context: Context, rideId: String, action: String): PendingIntent {
            val intent = Intent(context, RideActionReceiver::class.java).apply {
                putExtra(EXTRA_RIDE_ID, rideId)
                putExtra(EXTRA_ACTION, action)
                // Unique action per (rideId,action) pair so PendingIntent is distinct
                setAction("com.bigbot.app.RIDE_ACTION.$rideId.$action")
                `package` = context.packageName
            }
            return PendingIntent.getBroadcast(
                context,
                (rideId + action).hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }
    }
}
