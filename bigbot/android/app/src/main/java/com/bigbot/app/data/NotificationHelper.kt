package com.bigbot.app.data

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.content.res.ResourcesCompat
import androidx.core.graphics.drawable.toBitmap
import com.bigbot.app.MainActivity
import com.bigbot.app.R
import com.bigbot.app.data.models.Ride
import com.bigbot.app.data.models.RideUpdate
import com.bigbot.app.ui.components.fullCityName
import com.bigbot.app.util.RideTextParser
import java.util.concurrent.ConcurrentHashMap

/**
 * Builds notifications that mirror the in-app ride card — same origin/destination
 * header and the same three action buttons (ת לקבוצה / ת לפרטי / ת לשניהם) in
 * the same colors (green / blue / purple).
 *
 * Caches each ride by messageId + tracks which actions were already sent,
 * exactly like the in-app `sentButtons` set in HomeViewModel. Only the pressed
 * button switches to "נשלח ✓" — the others stay clickable.
 */
object NotificationHelper {

    const val CHANNEL_SERVICE = "bigbot_service"
    const val CHANNEL_RIDES = "rides"
    const val CHANNEL_RIDES_SILENT = "rides_silent"
    // High-importance channel dedicated to the "🎉 קיבלת את הנסיעה" alert —
    // separate so the user can tune it independently and so every success
    // fires a fresh heads-up pop + sound + vibration, even if a previous
    // success is still on screen.
    const val CHANNEL_RIDE_SUCCESS = "ride_success"

    const val FGS_NOTIF_ID = 1001

    // Per-ride state — mirrors HomeViewModel.sentButtons (keyed by "${rideId}_${action}")
    // but split into two maps for faster lookup. Cleared 30min after the ride
    // arrives to bound memory (same as server-side rideContext TTL).
    private val rideCache = ConcurrentHashMap<String, Ride>()
    private val sentActionsByRide = ConcurrentHashMap<String, MutableSet<String>>()

    fun cacheRide(ride: Ride) {
        if (ride.messageId.isEmpty()) return
        rideCache[ride.messageId] = ride
    }

    fun getRide(rideId: String): Ride? = rideCache[rideId]

    fun markActionSent(rideId: String, action: String) {
        sentActionsByRide.getOrPut(rideId) { mutableSetOf() }.add(action)
    }

    fun sentActionsFor(rideId: String): Set<String> = sentActionsByRide[rideId] ?: emptySet()

    fun clearRide(rideId: String) {
        rideCache.remove(rideId)
        sentActionsByRide.remove(rideId)
    }

    /** Stable per-ride notification id (derived from messageId). */
    fun rideNotifId(rideId: String): Int = (rideId.hashCode() and 0x7FFFFFFF).or(0x10000000)

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return

        if (nm.getNotificationChannel(CHANNEL_RIDES) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_RIDES, "נסיעות", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "התראות על נסיעות חדשות — עם כפתורי שליחה"
                    enableVibration(true)
                }
            )
        }
        // Silent variant — used when TTS narration is enabled so the only
        // audio feedback is the spoken city names, not the ringtone.
        if (nm.getNotificationChannel(CHANNEL_RIDES_SILENT) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_RIDES_SILENT, "נסיעות (שקטות)", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "נסיעות חדשות בלי צלצול — שילוב עם קריינות"
                    setSound(null, null)
                    enableVibration(false)
                }
            )
        }
        // Ride-success channel — IMPORTANCE_HIGH + sound + strong vibration.
        // This is the "🎉 קיבלת את הנסיעה!" pop that MUST grab the driver's
        // attention immediately.
        if (nm.getNotificationChannel(CHANNEL_RIDE_SUCCESS) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_RIDE_SUCCESS, "קיבלת נסיעה", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "התראה כשהסדרן מאשר שקיבלת את הנסיעה"
                    enableVibration(true)
                    enableLights(true)
                    vibrationPattern = longArrayOf(0, 300, 200, 300, 200, 300)
                }
            )
        }
        if (nm.getNotificationChannel(CHANNEL_SERVICE) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_SERVICE, "BigBot פעיל", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "שמירה על חיבור לשרת ברקע"
                    setShowBadge(false)
                }
            )
        }
    }

    /** Persistent notification used by the foreground service. */
    fun buildForegroundNotification(context: Context, connected: Boolean): android.app.Notification {
        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentPi = PendingIntent.getActivity(
            context, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val title = if (connected) "BigBot פעיל" else "BigBot — מתחבר..."
        val text = if (connected) "מאזין לנסיעות ברקע" else "מנסה להתחבר לשרת..."
        return NotificationCompat.Builder(context, CHANNEL_SERVICE)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(contentPi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setShowWhen(false)
            .build()
    }

    /**
     * Build the rich ride notification. [sentActions] is the set of actions
     * that have already been pressed — those buttons show "נשלח ✓" and are
     * no longer clickable, exactly like the in-app card.
     */
    fun buildRideNotification(
        context: Context,
        ride: Ride,
        sentActions: Set<String> = emptySet(),
        silent: Boolean = false
    ): android.app.Notification {
        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentPi = PendingIntent.getActivity(
            context, ride.messageId.hashCode(), openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Parse price / seats / vehicle type from the raw text — same parser the
        // in-app card uses so the two match.
        val parsed = try {
            RideTextParser.parse(ride.rawText, ride.origin, ride.destination)
        } catch (_: Throwable) { null }

        val seatsText = when {
            parsed?.vehicleSeats?.isNotEmpty() == true -> "${parsed.vehicleSeats} מקומות"
            ride.seats.isNotEmpty() -> "${ride.seats} מקומות"
            else -> "4 מקומות"
        }
        val typeText = parsed?.vehicleType?.ifEmpty { "רגיל" } ?: "רגיל"
        val infoText = "$seatsText • $typeText"

        val rv = RemoteViews(context.packageName, R.layout.notif_ride)
        rv.setTextViewText(R.id.notif_group, ride.groupName)
        // Badge — just "● עכשיו", no clock time (user request).
        rv.setTextViewText(R.id.notif_origin, ride.origin)
        rv.setTextViewText(R.id.notif_origin_full, fullCityName(ride.origin))
        rv.setTextViewText(R.id.notif_destination, ride.destination)
        rv.setTextViewText(R.id.notif_destination_full, fullCityName(ride.destination))
        rv.setTextViewText(R.id.notif_info, infoText)

        if (parsed?.price?.isNotEmpty() == true) {
            rv.setTextViewText(R.id.notif_price, "${parsed.price} \u20AA")
            rv.setViewVisibility(R.id.notif_price, View.VISIBLE)
        } else {
            rv.setViewVisibility(R.id.notif_price, View.GONE)
        }

        // Address + Waze icon row — mirrors the in-app card exactly:
        // round Waze logo on the left, address text on the right.
        val street = parsed?.street?.ifBlank { null }
        val streetNum = parsed?.streetNumber?.ifBlank { null }
        if (street != null) {
            val addr = if (streetNum != null) "📍 $street $streetNum" else "📍 $street"
            rv.setTextViewText(R.id.notif_address_with_waze, addr)
            // Make Waze icon circular — same as in-app RideCard
            val sizePx = (context.resources.displayMetrics.density * 38).toInt()
            val wazeRound = circularBitmap(context, R.drawable.logo_waze, sizePx)
            rv.setImageViewBitmap(R.id.notif_waze_icon, wazeRound)
            rv.setViewVisibility(R.id.notif_waze_row, View.VISIBLE)
            rv.setViewVisibility(R.id.notif_address, View.GONE)
        } else {
            rv.setViewVisibility(R.id.notif_waze_row, View.GONE)
            rv.setViewVisibility(R.id.notif_address, View.GONE)
        }

        // ETA line (🚗 X דק' ממיקומך) — only when the ride has a computed ETA
        android.util.Log.d("NotifETA", "ride=${ride.messageId} etaMinutes=${ride.etaMinutes}")
        if (ride.etaMinutes > 0) {
            rv.setTextViewText(R.id.notif_eta, "🚗 ${ride.etaMinutes} דק' ממיקומך")
            rv.setViewVisibility(R.id.notif_eta, View.VISIBLE)
        } else {
            rv.setViewVisibility(R.id.notif_eta, View.GONE)
        }

        // Determine effective message type — same fallback logic as RideCard
        val effectiveType = when {
            ride.messageType.isNotBlank() -> ride.messageType
            ride.hasLink && ride.chatPhone.isNotBlank() -> "two_links"
            ride.hasLink -> "single_link"
            else -> "regular_text"
        }

        // Raw text — hide when we already have structured data (address,
        // price, route) so it doesn't duplicate information. Also hide for
        // link rides (wa.me URL is noisy and irrelevant).
        rv.setViewVisibility(R.id.notif_raw, View.GONE)

        // Show only the relevant button row, hide the others
        rv.setViewVisibility(R.id.notif_row_regular, if (effectiveType == "regular_text") View.VISIBLE else View.GONE)
        rv.setViewVisibility(R.id.notif_row_single,  if (effectiveType == "single_link")  View.VISIBLE else View.GONE)
        rv.setViewVisibility(R.id.notif_row_two,     if (effectiveType == "two_links")     View.VISIBLE else View.GONE)

        when (effectiveType) {
            "regular_text" -> {
                configureActionButton(context, rv, R.id.notif_btn_group,   ride, "reply_group",   label = "ת לקבוצה", sent = "reply_group"   in sentActions)
                configureActionButton(context, rv, R.id.notif_btn_private, ride, "reply_private", label = "ת לפרטי",  sent = "reply_private" in sentActions)
                configureActionButton(context, rv, R.id.notif_btn_both,    ride, "reply_both",    label = "ת לשניהם", sent = "reply_both"    in sentActions)
            }
            "single_link" -> {
                configureActionButton(
                    context, rv, R.id.notif_btn_take_ride, ride,
                    "take_ride_link:${ride.linkPhone}:${ride.linkText}",
                    label = "⚡ קח את הנסיעה",
                    sent = "take_ride_link" in sentActions
                )
            }
            "two_links" -> {
                configureActionButton(
                    context, rv, R.id.notif_btn_request_ride, ride,
                    "take_ride_link:${ride.linkPhone}:${ride.linkText}",
                    label = "🚗 בקש נסיעה",
                    sent = "take_ride_link" in sentActions
                )
                configureActionButton(
                    context, rv, R.id.notif_btn_chat_dispatcher, ride,
                    "open_chat",
                    label = "💬 צ'אט עם סדרן",
                    sent = "open_chat" in sentActions
                )
            }
        }

        val route = listOfNotNull(
            ride.origin.takeIf { it.isNotBlank() },
            ride.destination.takeIf { it.isNotBlank() }
        ).joinToString(" ← ")

        // For link rides — strip URLs from contentText so Android doesn't add
        // "פתיחת הקישור" as a smart action button.
        val contentText = if (effectiveType == "regular_text") {
            ride.rawText.take(80)
        } else {
            ride.rawText.replace(Regex("https?://\\S+|wa\\.me/\\S+"), "").trim().take(80)
                .ifBlank { "${ fullCityName(ride.origin)} ← ${fullCityName(ride.destination)}" }
        }

        val channel = if (silent) CHANNEL_RIDES_SILENT else CHANNEL_RIDES
        return NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(route.ifBlank { "נסיעה חדשה" })
            .setContentText(contentText)
            .setAllowSystemGeneratedContextualActions(false)
            // Same RV for collapsed / expanded / heads-up → always shows the
            // full card with buttons, from the first pop-up.
            // Set BOTH big and heads-up to the full rv. Skip setCustomContentView
            // so Android has no "collapsed" alternative and is forced to use
            // the big view in the shade as well (the only reliable trick to
            // auto-expand a custom view on Android 12+).
            .setCustomBigContentView(rv)
            .setCustomHeadsUpContentView(rv)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setGroup("ride_${ride.messageId}")
            .setContentIntent(contentPi)
            .setAutoCancel(false)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            // Always use current device time so Android shows "עכשיו" instead
            // of "1 דק'" (server timestamp can lag a few seconds behind).
            .setWhen(System.currentTimeMillis())
            .build()
    }

    private fun configureActionButton(
        context: Context,
        rv: RemoteViews,
        viewId: Int,
        ride: Ride,
        action: String,
        label: String,
        sent: Boolean
    ) {
        if (sent) {
            rv.setTextViewText(viewId, "נשלח ✓")
            // Clear the click handler so it's inert (matches the "sent" state in the app)
            rv.setOnClickPendingIntent(viewId, noopPendingIntent(context))
        } else {
            rv.setTextViewText(viewId, label)
            rv.setOnClickPendingIntent(
                viewId,
                RideActionReceiver.pendingIntent(context, ride.messageId, action)
            )
        }
    }

    /** Clips a drawable resource to a circle — used so logos appear round in RemoteViews. */
    private fun circularBitmap(context: Context, drawableRes: Int, sizePx: Int): Bitmap {
        val src = ResourcesCompat.getDrawable(context.resources, drawableRes, null)
            ?.toBitmap(sizePx, sizePx) ?: Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val output = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val rect = Rect(0, 0, sizePx, sizePx)
        canvas.drawOval(android.graphics.RectF(rect), paint)
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        canvas.drawBitmap(src, rect, rect, paint)
        return output
    }

    private fun noopPendingIntent(context: Context): PendingIntent {
        // A PendingIntent that does nothing — used to replace the onClick of
        // a button that was already pressed so the user can't re-trigger it.
        val intent = Intent(context, RideActionReceiver::class.java).apply {
            setAction("com.bigbot.app.RIDE_ACTION.NOOP")
            `package` = context.packageName
        }
        return PendingIntent.getBroadcast(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    /**
     * Success notification fired when the dispatcher replies privately after
     * the user pressed ת לקבוצה / ת לפרטי / ת לשניהם. Shows "קיבלת את
     * הנסיעה!" with two action buttons: open the in-app chat with the
     * dispatcher, and navigate to the destination via Waze.
     */
    fun buildRideSuccessNotification(context: Context, update: RideUpdate): android.app.Notification {
        // Tapping the notification body opens the app chat tab
        val openChatIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("openChat", true)
            putExtra("chatPhone", update.dispatcherPhone)
        }
        val openChatPi = PendingIntent.getActivity(
            context, update.rideId.hashCode(), openChatIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Waze — uses the full city name so Waze's search matches cleanly
        val destinationFull = fullCityName(update.destination).ifBlank { update.destination }
        val wazeUri = Uri.parse("https://waze.com/ul?q=${Uri.encode(destinationFull)}")
        val wazeIntent = Intent(Intent.ACTION_VIEW, wazeUri).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        val wazePi = PendingIntent.getActivity(
            context, (update.rideId + "waze").hashCode(), wazeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val route = listOfNotNull(
            update.origin.takeIf { it.isNotBlank() },
            update.destination.takeIf { it.isNotBlank() }
        ).joinToString(" ← ")

        val dispatcherDisplay = if (update.dispatcherName.isNotBlank()) update.dispatcherName else update.dispatcherPhone

        // Custom RemoteViews — same two logo-buttons as the in-app SuccessCard
        val sizePx = (context.resources.displayMetrics.density * 44).toInt()
        val waLogo = circularBitmap(context, R.drawable.logo_whatsapp, sizePx)
        val wazeLogo = circularBitmap(context, R.drawable.logo_waze, sizePx)

        val rv = RemoteViews(context.packageName, R.layout.notif_ride_success)
        rv.setTextViewText(R.id.success_route, route)
        rv.setTextViewText(R.id.success_dispatcher, "הסדרן $dispatcherDisplay מדבר איתך בפרטי")
        rv.setImageViewBitmap(R.id.success_icon_chat, waLogo)
        rv.setImageViewBitmap(R.id.success_icon_waze, wazeLogo)
        rv.setOnClickPendingIntent(R.id.success_btn_chat, openChatPi)
        rv.setOnClickPendingIntent(R.id.success_btn_waze, wazePi)

        return NotificationCompat.Builder(context, CHANNEL_RIDE_SUCCESS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("✅ קיבלת את הנסיעה!")
            .setContentText(route)
            .setCustomBigContentView(rv)
            .setCustomHeadsUpContentView(rv)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setContentIntent(openChatPi)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
            .setVibrate(longArrayOf(0, 300, 200, 300, 200, 300))
            .setOnlyAlertOnce(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
    }
}
