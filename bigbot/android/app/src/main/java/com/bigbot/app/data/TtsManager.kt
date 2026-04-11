package com.bigbot.app.data

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Wraps Android's TextToSpeech engine with Hebrew male voice and a simple
 * speak() API. Held as a singleton by Hilt so both the in-app ViewModels and
 * the background [RideForegroundService] share the same instance — this means
 * narration keeps working when the app is closed (the service's process
 * keeps TTS alive).
 */
@Singleton
class TtsManager @Inject constructor(
    @ApplicationContext private val context: Context
) : TextToSpeech.OnInitListener {

    @Volatile
    var enabled: Boolean = false

    private var tts: TextToSpeech? = null
    @Volatile
    private var initialized = false
    private val pending = mutableListOf<String>()

    // Registered callbacks waiting for a specific utterance to finish.
    // Keyed by utteranceId so the right handler fires.
    private val doneCallbacks = ConcurrentHashMap<String, () -> Unit>()

    fun ensureStarted() {
        if (tts == null) {
            tts = TextToSpeech(context.applicationContext, this)
        }
    }

    override fun onInit(status: Int) {
        if (status != TextToSpeech.SUCCESS) {
            Log.w("TTS", "init failed: $status")
            return
        }
        val t = tts ?: return
        val hebrew = Locale("he", "IL")
        val setRes = t.setLanguage(hebrew)
        if (setRes == TextToSpeech.LANG_MISSING_DATA || setRes == TextToSpeech.LANG_NOT_SUPPORTED) {
            Log.w("TTS", "Hebrew not supported, falling back to default")
        }
        // Route TTS through the ALARM stream so it plays at max volume
        // regardless of the notification/media volume, and keeps playing
        // when the phone is silenced (still overridden by Do Not Disturb).
        t.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
        )
        // Try to pick a male Hebrew voice. Android doesn't tag voices with
        // gender consistently; heuristic: names that contain "male" and NOT
        // "female", or known male voice ids.
        selectMaleVoice(t)
        t.setSpeechRate(1.0f)
        t.setPitch(1.0f)

        // Utterance listener — used by voice control to know WHEN the
        // announcement has finished so the microphone can be opened.
        t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) {
                if (utteranceId != null) {
                    doneCallbacks.remove(utteranceId)?.invoke()
                }
            }
            @Deprecated("API 21 signature")
            override fun onError(utteranceId: String?) {
                if (utteranceId != null) doneCallbacks.remove(utteranceId)
            }
            override fun onError(utteranceId: String?, errorCode: Int) {
                if (utteranceId != null) doneCallbacks.remove(utteranceId)
            }
        })

        initialized = true
        // Drain anything that came in during init
        synchronized(pending) {
            pending.forEach { speakNow(it) }
            pending.clear()
        }
    }

    private fun selectMaleVoice(t: TextToSpeech) {
        try {
            val voices: Set<Voice> = t.voices ?: return
            val hebrewVoices = voices.filter { v -> v.locale.language == "he" }
            // First preference: voice explicitly tagged male (not female)
            val male = hebrewVoices.firstOrNull { v ->
                val name = v.name.lowercase()
                name.contains("male") && !name.contains("female")
            }
            // Second preference: known Google male voice ids for Hebrew
            val known = hebrewVoices.firstOrNull { v ->
                v.name.equals("he-il-x-hed-local", true) ||
                v.name.equals("he-il-x-hed-network", true) ||
                v.name.endsWith("#male_1-local", true)
            }
            // Fallback: any Hebrew voice (better than default non-Hebrew)
            val pick = male ?: known ?: hebrewVoices.firstOrNull()
            if (pick != null) {
                t.voice = pick
                Log.d("TTS", "Selected voice: ${pick.name}")
            }
        } catch (e: Exception) {
            Log.w("TTS", "voice selection failed: ${e.message}")
        }
    }

    /**
     * Speak [text] if narration is enabled. Called from both the HomeViewModel
     * (foreground path) and the RideForegroundService (background path).
     * If the engine hasn't finished initializing yet, the text is queued and
     * spoken as soon as init completes.
     *
     * [onDone] fires after the utterance finishes playing — used by voice
     * control to open the microphone right after the announcement. Note that
     * if TTS is [enabled]=false the callback fires immediately so the voice
     * listener can still start on rides when TTS is muted.
     */
    fun speak(text: String, onDone: (() -> Unit)? = null) {
        if (!enabled || text.isBlank()) {
            onDone?.invoke()
            return
        }
        ensureStarted()
        if (!initialized) {
            synchronized(pending) { pending.add(text) }
            // Best-effort: fire onDone roughly when the queued text would finish
            if (onDone != null) {
                android.os.Handler(android.os.Looper.getMainLooper())
                    .postDelayed({ onDone() }, 3000)
            }
            return
        }
        speakNow(text, onDone)
    }

    private fun speakNow(text: String, onDone: (() -> Unit)? = null) {
        val t = tts ?: return
        t.stop()
        val utteranceId = "ride_${System.nanoTime()}"
        if (onDone != null) doneCallbacks[utteranceId] = onDone
        // Max volume (1.0f) through the alarm stream so the user hears the
        // narration clearly even while driving. Pan 0 = centered stereo.
        val params = Bundle().apply {
            putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
            putFloat(TextToSpeech.Engine.KEY_PARAM_PAN, 0f)
            putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_ALARM)
        }
        t.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId)
    }

    /** Always speaks the ride-success announcement regardless of the [enabled] flag. */
    fun speakSuccess() {
        ensureStarted()
        if (!initialized) {
            synchronized(pending) { pending.add("קיבלת את הנסיעה") }
            return
        }
        speakNow("קיבלת את הנסיעה")
    }

    fun stop() {
        try { tts?.stop() } catch (_: Exception) { /* ignore */ }
    }

    fun shutdown() {
        try {
            tts?.stop()
            tts?.shutdown()
        } catch (_: Exception) { /* ignore */ }
        tts = null
        initialized = false
    }
}
