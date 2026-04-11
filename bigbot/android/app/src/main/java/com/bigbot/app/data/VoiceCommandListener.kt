package com.bigbot.app.data

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import android.widget.Toast
import androidx.core.content.ContextCompat

/**
 * Hands-free voice command listener for ride notifications.
 *
 * Opens the microphone for ~12 seconds after the TTS ride announcement
 * finishes. Listens for the Hebrew words אחד / שתיים / שלוש and maps them
 * to the three action buttons on the ride card:
 *
 *   "אחד"  / "ראשון"  → reply_group
 *   "שתיים"/ "שני"   → reply_private
 *   "שלוש" / "שלישי" → reply_both
 *
 * Uses Android's built-in SpeechRecognizer (Google speech engine, "he-IL").
 * Requires RECORD_AUDIO permission — if missing, start() silently no-ops.
 *
 * A singleton is enough — we only ever listen for one ride at a time and
 * the listener auto-cancels if a new ride arrives mid-listen.
 */
class VoiceCommandListener(private val context: Context) {

    private var recognizer: SpeechRecognizer? = null
    private var currentCallback: ((String?) -> Unit)? = null
    private val handler = Handler(Looper.getMainLooper())
    private var timeoutRunnable: Runnable? = null
    // Retry counter — some engines throw ERROR_NO_MATCH / ERROR_SPEECH_TIMEOUT
    // on the first attempt even when the user is about to speak. Auto-restart
    // up to 2 times before giving up.
    private var retryCount = 0
    private val MAX_RETRIES = 2
    private var currentIntent: Intent? = null

    /**
     * Start listening. When a recognized command arrives, [onResult] is invoked
     * with one of "reply_group" / "reply_private" / "reply_both", or null on
     * timeout / error. Safe to call from any thread — internally posts to the
     * main thread because SpeechRecognizer requires it.
     */
    fun start(onResult: (String?) -> Unit) {
        Log.d("VoiceCmd", "start() called")
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Log.w("VoiceCmd", "RECORD_AUDIO permission not granted, skipping")
            onResult(null)
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            Log.w("VoiceCmd", "SpeechRecognizer not available on this device")
            onResult(null)
            return
        }

        handler.post {
            cancelInternal()
            currentCallback = onResult
            retryCount = 0

            // Prefer Google's recognizer explicitly — on Samsung/OEM phones the
            // default SpeechRecognizer often binds to Bixby or an OEM engine
            // that doesn't support Hebrew, even though Google keyboard
            // dictation works fine. Forcing the Google component fixes it.
            val googleComponent = findGoogleRecognizerComponent()
            val r = try {
                if (googleComponent != null) {
                    Log.d("VoiceCmd", "using Google recognizer: $googleComponent")
                    SpeechRecognizer.createSpeechRecognizer(context, googleComponent)
                } else {
                    Log.d("VoiceCmd", "Google recognizer not found, falling back to default")
                    SpeechRecognizer.createSpeechRecognizer(context)
                }
            } catch (e: Exception) {
                Log.e("VoiceCmd", "createSpeechRecognizer failed: ${e.message}")
                onResult(null)
                return@post
            }
            if (r == null) {
                Log.e("VoiceCmd", "createSpeechRecognizer returned null (no recognizer service visible?)")
                toast("לא נמצא מנוע דיבור תואם")
                onResult(null)
                return@post
            }
            Log.d("VoiceCmd", "recognizer created OK")
            recognizer = r
            toast("🎤 מקשיב...")
            r.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) { Log.d("VoiceCmd", "ready") }
                override fun onBeginningOfSpeech() { Log.d("VoiceCmd", "speech start") }
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() { Log.d("VoiceCmd", "speech end") }
                override fun onError(error: Int) {
                    Log.d("VoiceCmd", "error=$error (${errorName(error)})")
                    // NO_MATCH / SPEECH_TIMEOUT are recoverable — restart the
                    // listener so the user gets another chance (up to MAX_RETRIES).
                    val recoverable = error == SpeechRecognizer.ERROR_NO_MATCH ||
                                      error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                    if (recoverable && retryCount < MAX_RETRIES) {
                        retryCount++
                        Log.d("VoiceCmd", "retry $retryCount/$MAX_RETRIES")
                        toast("לא תפסתי, נסה שוב (${retryCount}/$MAX_RETRIES)")
                        // Destroy + recreate — some engines get stuck if you
                        // call startListening() on the same instance after error.
                        try { recognizer?.destroy() } catch (_: Exception) {}
                        handler.postDelayed({ restartInternal() }, 300)
                        return
                    }
                    toast("שגיאה: ${errorName(error)}")
                    finish(null)
                }
                override fun onResults(results: Bundle?) {
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val action = matches?.let { matchAction(it) }
                    Log.d("VoiceCmd", "results=$matches action=$action")
                    val heard = matches?.joinToString(" | ") ?: "כלום"
                    if (action != null) {
                        toast("שמעתי: $heard → $action")
                    } else {
                        toast("שמעתי: $heard (לא התאים)")
                    }
                    finish(action)
                }
                override fun onPartialResults(partialResults: Bundle?) {
                    // Try to match early — if the user says just one clear word
                    // we can react before they finish a pause.
                    val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val action = matches?.let { matchAction(it) }
                    if (action != null) {
                        Log.d("VoiceCmd", "partial match action=$action")
                        toast("שמעתי: ${matches.firstOrNull()} → $action")
                        finish(action)
                    }
                }
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "he-IL")
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "he-IL")
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                // PREFER_OFFLINE removed — requires Hebrew offline lang pack
                // (usually missing on emulator + many phones). Let the engine
                // fall back to online recognition which is more reliable.
                // More generous silence windows so Google doesn't time out
                // before the user finishes saying "אחד".
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1000L)
            }
            currentIntent = intent
            try {
                r.startListening(intent)
            } catch (e: Exception) {
                Log.e("VoiceCmd", "startListening failed: ${e.message}")
                finish(null)
                return@post
            }

            // Hard 12-second timeout — if the user says nothing, bail out
            timeoutRunnable = Runnable {
                Log.d("VoiceCmd", "hard timeout — giving up")
                finish(null)
            }
            handler.postDelayed(timeoutRunnable!!, 12_000L)
        }
    }

    /** Stop any in-progress listening. Safe to call from any thread. */
    fun cancel() { handler.post { cancelInternal() } }

    private fun cancelInternal() {
        timeoutRunnable?.let { handler.removeCallbacks(it) }
        timeoutRunnable = null
        try { recognizer?.cancel() } catch (_: Exception) {}
        try { recognizer?.destroy() } catch (_: Exception) {}
        recognizer = null
        currentCallback = null
    }

    private fun finish(action: String?) {
        val cb = currentCallback
        cancelInternal()
        cb?.invoke(action)
    }

    /**
     * Scan installed recognition services for Google's. Returns the explicit
     * ComponentName or null if Google's isn't installed/visible. We prefer the
     * quicksearchbox package because it supports he-IL reliably.
     */
    private fun findGoogleRecognizerComponent(): ComponentName? {
        return try {
            val pm = context.packageManager
            val intent = Intent("android.speech.RecognitionService")
            val services: List<ResolveInfo> = pm.queryIntentServices(intent, 0)
            Log.d("VoiceCmd", "available recognition services: ${services.joinToString { it.serviceInfo.packageName }}")
            val googleSvc = services.firstOrNull {
                it.serviceInfo.packageName == "com.google.android.googlequicksearchbox" ||
                it.serviceInfo.packageName == "com.google.android.tts"
            } ?: services.firstOrNull { it.serviceInfo.packageName.startsWith("com.google.") }
            googleSvc?.let { ComponentName(it.serviceInfo.packageName, it.serviceInfo.name) }
        } catch (e: Exception) {
            Log.w("VoiceCmd", "findGoogleRecognizerComponent failed: ${e.message}")
            null
        }
    }

    /** Recreate the recognizer with the same listener + intent after a recoverable error. */
    private fun restartInternal() {
        val cb = currentCallback ?: return
        val intent = currentIntent ?: return
        val googleComponent = findGoogleRecognizerComponent()
        val r = try {
            if (googleComponent != null) SpeechRecognizer.createSpeechRecognizer(context, googleComponent)
            else SpeechRecognizer.createSpeechRecognizer(context)
        } catch (e: Exception) {
            Log.e("VoiceCmd", "restart createSpeechRecognizer failed: ${e.message}")
            finish(null)
            return
        }
        if (r == null) {
            Log.e("VoiceCmd", "restart createSpeechRecognizer returned null")
            finish(null)
            return
        }
        recognizer = r
        // Re-attach the SAME listener object by delegating through finish() —
        // but we need the listener, so re-subscribe to a fresh one that calls
        // back into our state via the saved callback + retry logic.
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { Log.d("VoiceCmd", "ready (retry)") }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onError(error: Int) {
                Log.d("VoiceCmd", "retry error=$error")
                val recoverable = error == SpeechRecognizer.ERROR_NO_MATCH ||
                                  error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                if (recoverable && retryCount < MAX_RETRIES) {
                    retryCount++
                    toast("לא תפסתי, נסה שוב (${retryCount}/$MAX_RETRIES)")
                    try { recognizer?.destroy() } catch (_: Exception) {}
                    handler.postDelayed({ restartInternal() }, 300)
                    return
                }
                toast("שגיאה: ${errorName(error)}")
                finish(null)
            }
            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val action = matches?.let { matchAction(it) }
                val heard = matches?.joinToString(" | ") ?: "כלום"
                if (action != null) toast("שמעתי: $heard → $action")
                else toast("שמעתי: $heard (לא התאים)")
                finish(action)
            }
            override fun onPartialResults(partialResults: Bundle?) {
                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val action = matches?.let { matchAction(it) }
                if (action != null) {
                    toast("שמעתי: ${matches.firstOrNull()} → $action")
                    finish(action)
                }
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        try {
            r.startListening(intent)
        } catch (e: Exception) {
            Log.e("VoiceCmd", "restartInternal startListening failed: ${e.message}")
            finish(null)
        }
    }

    private fun errorName(error: Int): String = when (error) {
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "אין תגובה מהרשת"
        SpeechRecognizer.ERROR_NETWORK -> "בעיית רשת"
        SpeechRecognizer.ERROR_AUDIO -> "בעיית מיקרופון"
        SpeechRecognizer.ERROR_SERVER -> "בעיית שרת של גוגל"
        SpeechRecognizer.ERROR_CLIENT -> "שגיאת קליינט (5)"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "לא שמעתי כלום"
        SpeechRecognizer.ERROR_NO_MATCH -> "לא זיהיתי את המילה"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "המנוע עסוק"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "אין הרשאת מיקרופון"
        12 /* ERROR_LANGUAGE_NOT_SUPPORTED */ -> "עברית לא נתמכת במנוע"
        13 /* ERROR_LANGUAGE_UNAVAILABLE */ -> "חבילת עברית לא זמינה"
        else -> "שגיאה $error"
    }

    private fun toast(text: String) {
        handler.post {
            try { Toast.makeText(context, text, Toast.LENGTH_SHORT).show() } catch (_: Exception) {}
        }
    }

    /**
     * Scan recognition matches (ranked by confidence) and return the first
     * match to אחד / שתיים / שלוש (or their variants). Uses substring matching
     * so phrases like "אחד בבקשה" or "שלוש תודה" still match, and normalizes
     * Hebrew niqqud/punctuation away before comparing.
     */
    private fun matchAction(matches: List<String>): String? {
        // Hebrew word variants → action. Checked in order so longer/more specific
        // forms win over shorter ones (e.g. "שלוש" before "לוש").
        val groupWords = listOf("אחד", "אחת", "ראשון", "ראשונה", "1", "one")
        val privateWords = listOf("שתיים", "שניים", "שתים", "שני", "שנייה", "2", "two")
        val bothWords = listOf("שלוש", "שלושה", "שלישי", "שלישית", "3", "three")

        for (raw in matches) {
            val text = normalize(raw)
            if (text.isEmpty()) continue
            // Check בשלושה groups in order — more specific first to avoid "שני"
            // matching inside "שניים"? they're separate strings so it's fine.
            if (bothWords.any { text.contains(it) }) return "reply_both"
            if (privateWords.any { text.contains(it) }) return "reply_private"
            if (groupWords.any { text.contains(it) }) return "reply_group"
        }
        return null
    }

    /** Strip niqqud, punctuation, trim, lowercase — so matching is forgiving. */
    private fun normalize(s: String): String {
        // Hebrew niqqud range: U+0591..U+05C7
        val sb = StringBuilder(s.length)
        for (c in s) {
            if (c in '\u0591'..'\u05C7') continue
            if (c.isLetterOrDigit() || c.isWhitespace()) sb.append(c) else sb.append(' ')
        }
        return sb.toString().trim().lowercase()
    }
}
