package com.bigbot.app.data

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.bigbot.app.data.models.RideUiState
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import javax.inject.Inject

/**
 * Long-running foreground service that keeps the WebSocket connection alive
 * while the app is backgrounded or closed. Subscribes to the singleton
 * [WebSocketService] and shows a heads-up notification per incoming ride
 * with the same three action buttons as the in-app ride card.
 */
@AndroidEntryPoint
class RideForegroundService : Service() {

    @Inject lateinit var wsService: WebSocketService
    @Inject lateinit var repo: Repository
    @Inject lateinit var tts: TtsManager

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var started = false
    // Lazy voice listener — created on the first ride that triggers it.
    private val voiceListener by lazy { VoiceCommandListener(this) }
    @Volatile private var voiceControlEnabled = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        NotificationHelper.ensureChannels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!started) {
            started = true
            startForegroundCompat()
            startCollectors()
        }
        // START_STICKY so Android relaunches us if killed under memory pressure
        return START_STICKY
    }

    private fun startForegroundCompat() {
        val notif = NotificationHelper.buildForegroundNotification(
            this, connected = wsService.isConnected()
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NotificationHelper.FGS_NOTIF_ID,
                notif,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NotificationHelper.FGS_NOTIF_ID, notif)
        }
    }

    private fun startCollectors() {
        // Ensure WS is connected using stored phone. Safe to call if already connected.
        scope.launch {
            try {
                val phone = repo.driverPhone.first()
                val url = repo.serverUrl.first()
                if (phone.isNotBlank() && !wsService.isConnected()) {
                    wsService.serverUrl = url
                    wsService.connect(phone, phone)
                }
            } catch (e: Exception) {
                Log.w("RideFGS", "WS bootstrap failed: ${e.message}")
            }
        }

        // Keep the singleton TTS engine in sync with the persisted preference.
        // This is what makes narration work when the app is closed — the
        // service holds the engine alive in the background process.
        scope.launch {
            repo.ttsEnabled.collect { enabled ->
                tts.enabled = enabled
                if (enabled) tts.ensureStarted() else tts.stop()
            }
        }

        // Voice-control toggle — mirrored into a local volatile so the ride
        // collector can check it without a coroutine context switch.
        scope.launch {
            repo.voiceControlEnabled.collect { enabled ->
                voiceControlEnabled = enabled
                if (!enabled) voiceListener.cancel()
            }
        }

        // Update the foreground notification whenever connection state changes
        scope.launch {
            wsService.connected.collect { isConnected ->
                try {
                    val n = NotificationHelper.buildForegroundNotification(this@RideForegroundService, isConnected)
                    NotificationManagerCompat.from(this@RideForegroundService)
                        .notify(NotificationHelper.FGS_NOTIF_ID, n)
                } catch (_: SecurityException) { /* perm missing */ }
            }
        }

        // Ride update listener — fires a "🎉 קיבלת את הנסיעה!" notification
        // when the server marks a ride as success (dispatcher replied privately
        // after the user pressed ת לקבוצה / ת לפרטי / ת לשניהם). Also cancels
        // the original ride notification so the user only sees the success one.
        scope.launch {
            wsService.rideUpdates.collect { update ->
                if (update.status == "success") {
                    try {
                        val n = NotificationHelper.buildRideSuccessNotification(
                            this@RideForegroundService, update
                        )
                        val nm = NotificationManagerCompat.from(this@RideForegroundService)
                        // Use a distinct id so the success notif is separate from the original ride notif
                        val successId = (update.rideId + "_success").hashCode() and 0x7FFFFFFF or 0x20000000
                        nm.notify(successId, n)
                        // Clear the original ride notification so the user sees the success one clearly
                        nm.cancel(NotificationHelper.rideNotifId(update.rideId))
                        NotificationHelper.clearRide(update.rideId)
                    } catch (e: Exception) {
                        Log.w("RideFGS", "success notif failed: ${e.message}")
                    }
                    // קרינה — תמיד מכריז "קיבלת את הנסיעה" ללא תלות בהגדרת TTS
                    tts.speakSuccess()
                }
            }
        }

        // Show a rich ride notification per incoming ride + narrate it
        scope.launch {
            wsService.rides.collect { ride ->
                Log.d("RideFGS", "ride received: id=${ride.messageId} type=${ride.messageType} origin=${ride.origin} dest=${ride.destination}")
                try {
                    // Cache the full ride so button presses can rebuild the
                    // notification without losing origin/destination/rawText.
                    NotificationHelper.cacheRide(ride)
                    val n = NotificationHelper.buildRideNotification(
                        this@RideForegroundService, ride,
                        sentActions = NotificationHelper.sentActionsFor(ride.messageId),
                        // When TTS narration is on we don't want the ringtone too —
                        // the only audio cue should be the spoken city names.
                        silent = tts.enabled
                    )
                    NotificationManagerCompat.from(this@RideForegroundService)
                        .notify(NotificationHelper.rideNotifId(ride.messageId), n)
                } catch (e: SecurityException) {
                    Log.w("RideFGS", "notify missing POST_NOTIFICATIONS perm: ${e.message}")
                } catch (e: Exception) {
                    Log.e("RideFGS", "notify failed: ${e.message}")
                }
                // Narrate "<origin-full-name> <destination-full-name>". Uses
                // the full city names so the engine pronounces them correctly
                // (e.g. "בני ברק ירושלים" instead of reading "בב ים" as letters).
                // After the announcement finishes, open the microphone for a
                // voice command if voice control is enabled.
                val rideId = ride.messageId
                Log.d("RideFGS", "ride arrived id=$rideId ttsEnabled=${tts.enabled} voiceEnabled=$voiceControlEnabled")
                val startListenerAfterSpeech = {
                    Log.d("RideFGS", "startListenerAfterSpeech voiceEnabled=$voiceControlEnabled rideId=$rideId")
                    if (voiceControlEnabled) startVoiceListenerFor(rideId)
                }
                if (tts.enabled) {
                    try {
                        val text = listOf(
                            com.bigbot.app.ui.components.fullCityName(ride.origin),
                            com.bigbot.app.ui.components.fullCityName(ride.destination)
                        ).filter { it.isNotBlank() }.joinToString(" ")
                        tts.speak(text, onDone = startListenerAfterSpeech)
                    } catch (e: Exception) {
                        Log.w("RideFGS", "TTS speak failed: ${e.message}")
                        startListenerAfterSpeech() // continue to voice even if TTS crashed
                    }
                } else if (voiceControlEnabled) {
                    // TTS muted but voice still enabled — open the mic
                    // straight away (the user will have seen the heads-up).
                    startListenerAfterSpeech()
                }
            }
        }
    }

    /**
     * Opens the mic for ~12 seconds and maps the recognized word
     * (אחד/שתיים/שלוש) to a ride_action click. Does nothing if the toggle
     * is off or if the permission is missing.
     */
    private fun startVoiceListenerFor(rideId: String) {
        voiceListener.start { action ->
            if (action == null) {
                Log.d("RideFGS", "voice: no match / timeout for $rideId")
                return@start
            }
            Log.d("RideFGS", "voice command action=$action rideId=$rideId")
            try {
                wsService.sendRideAction(rideId, action)
                // Update the notification to show "נשלח ✓" on the pressed
                // button — same as RideActionReceiver does.
                NotificationHelper.markActionSent(rideId, action)
                val cached = NotificationHelper.getRide(rideId)
                    ?: com.bigbot.app.data.models.Ride(messageId = rideId)
                val notif = NotificationHelper.buildRideNotification(
                    this@RideForegroundService, cached,
                    sentActions = NotificationHelper.sentActionsFor(rideId),
                    silent = true,
                )
                NotificationManagerCompat.from(this@RideForegroundService)
                    .notify(NotificationHelper.rideNotifId(rideId), notif)
                // Give the user a confirmation beep/word so they know it
                // was picked up.
                tts.speak("נשלח")
            } catch (e: Exception) {
                Log.w("RideFGS", "voice action dispatch failed: ${e.message}")
            }
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
