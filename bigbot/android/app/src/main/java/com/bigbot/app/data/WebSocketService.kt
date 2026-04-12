package com.bigbot.app.data

import android.util.Log
import com.bigbot.app.data.models.*
import com.bigbot.app.util.RideTextParser
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import okhttp3.*
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WebSocketService @Inject constructor(private val gson: Gson) {

    // Production: WSS via Hostinger DNS + Let's Encrypt SSL.
    var serverUrl: String = "wss://api.bigbotdrivers.com/drivers"

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .writeTimeout(0, TimeUnit.MILLISECONDS)
        // Disable the hidden default 10s callTimeout — it kills WebSocket
        // connections after ~10 seconds even when the socket is healthy.
        .callTimeout(0, TimeUnit.MILLISECONDS)
        // 20s ping keeps NAT/firewall/cellular connection alive and detects
        // dead sockets fast — without this, idle WebSockets become "zombie"
        // connections and rides silently disappear.
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    @Volatile private var webSocket: WebSocket? = null
    @Volatile private var driverPhone: String = ""
    @Volatile private var driverName: String = ""
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected.asStateFlow()

    private val _waConnected = MutableStateFlow(false)
    val waConnected: StateFlow<Boolean> = _waConnected.asStateFlow()

    private val _rides = MutableSharedFlow<Ride>(replay = 0, extraBufferCapacity = 50)
    val rides: SharedFlow<Ride> = _rides.asSharedFlow()

    private val _rideUpdates = MutableSharedFlow<RideUpdate>(replay = 0, extraBufferCapacity = 50)
    val rideUpdates: SharedFlow<RideUpdate> = _rideUpdates.asSharedFlow()

    private val _chatMessages = MutableSharedFlow<ChatMessage>(replay = 0, extraBufferCapacity = 50)
    val chatMessages: SharedFlow<ChatMessage> = _chatMessages.asSharedFlow()

    private val _notifications = MutableSharedFlow<AppNotification>(replay = 0, extraBufferCapacity = 50)
    val notifications: SharedFlow<AppNotification> = _notifications.asSharedFlow()

    private val _etaRequests = MutableSharedFlow<EtaRequest>(replay = 0, extraBufferCapacity = 10)
    val etaRequests: SharedFlow<EtaRequest> = _etaRequests.asSharedFlow()

    private val _areasUpdated = MutableSharedFlow<String>(replay = 0, extraBufferCapacity = 5)
    val areasUpdated: SharedFlow<String> = _areasUpdated.asSharedFlow()

    // Dedup recently-seen ride messageIds. Server replays buffered rides on
    // reconnect (to recover from disconnect windows), so we MUST drop duplicates
    // here. Bounded LinkedHashSet acts as an LRU.
    private val seenRideIds = object : LinkedHashSet<String>() {
        override fun add(element: String): Boolean {
            val added = super.add(element)
            while (size > 500) iterator().also { it.next(); it.remove() }
            return added
        }
    }

    fun isConnected() = _connected.value

    // Flag to suppress scheduleReconnect() when cancel() is called from
    // inside connect(). Without this, cancel() fires onClosed → reconnect
    // → new connect() → cancel old → onClosed → reconnect → infinite loop.
    @Volatile private var suppressReconnect = false

    // Track the CURRENT WebSocket instance so onClosed/onFailure callbacks
    // from a stale (cancelled) WS don't trigger reconnects for an already-
    // replaced connection.
    @Volatile private var activeWs: WebSocket? = null

    fun connect(phone: String, name: String) {
        // Idempotency: skip if already connected with same phone.
        if (driverPhone == phone && activeWs != null && _connected.value) {
            Log.d("WS", "connect() skipped — already connected as $phone")
            return
        }
        driverPhone = phone
        driverName = name
        val encodedName = try {
            java.net.URLEncoder.encode(name, "UTF-8")
        } catch (_: Exception) { phone }
        val request = Request.Builder()
            .url(serverUrl)
            .header("X-Driver-Phone", phone)
            .header("X-Driver-Name", encodedName)
            .build()
        // Cancel previous WS WITHOUT triggering a reconnect cycle.
        suppressReconnect = true
        webSocket?.cancel()
        suppressReconnect = false

        val newWs = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                // Only update state if this is still the active WS
                if (activeWs !== ws) return
                _connected.value = true
                Log.d("WS", "Connected as $phone")
                send("get_status", mapOf("phone" to phone))
                // Flush any actions that were queued while disconnected
                flushPendingQueue()
            }
            override fun onMessage(ws: WebSocket, text: String) {
                if (activeWs !== ws) return
                handleMessage(text)
            }
            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                // Ignore callbacks from stale (replaced) WS instances
                if (activeWs !== ws) return
                _connected.value = false
                Log.e("WS", "Failure: ${t.message}")
                if (!suppressReconnect) scheduleReconnect()
            }
            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                if (activeWs !== ws) return
                _connected.value = false
                if (!suppressReconnect) scheduleReconnect()
            }
        })
        webSocket = newWs
        activeWs = newWs
    }

    private fun scheduleReconnect() {
        scope.launch {
            delay(2000) // 2s backoff — 500ms was too aggressive and caused storms
            if (!_connected.value && driverPhone.isNotEmpty()) {
                connect(driverPhone, driverName)
            }
        }
    }

    fun disconnect() {
        driverPhone = ""
        suppressReconnect = true
        webSocket?.close(1000, "disconnect")
        webSocket = null
        activeWs = null
        _connected.value = false
        suppressReconnect = false
    }

    private fun handleMessage(text: String) {
        try {
            val obj = gson.fromJson(text, JsonObject::class.java)
            val type = obj.get("type")?.asString ?: return
            val data = obj.get("data") ?: return
            when (type) {
                "new_ride" -> {
                    val ride = gson.fromJson(data, Ride::class.java)
                    val id = ride.messageId
                    if (id.isEmpty() || seenRideIds.add(id)) {
                        scope.launch { _rides.emit(ride) }
                    }
                }
                "wa_status" -> _waConnected.value = data.asJsonObject.get("connected")?.asBoolean ?: false
                "ride_update" -> scope.launch { _rideUpdates.emit(gson.fromJson(data, RideUpdate::class.java)) }
                "chat_message" -> scope.launch { _chatMessages.emit(gson.fromJson(data, ChatMessage::class.java)) }
                "eta_request" -> scope.launch { _etaRequests.emit(gson.fromJson(data, EtaRequest::class.java)) }
                "notification" -> scope.launch { _notifications.emit(gson.fromJson(data, AppNotification::class.java)) }
                "areas_updated" -> {
                    try {
                        val obj2 = data.asJsonObject
                        val shortcuts = mutableListOf<String>()
                        val support = mutableListOf<String>()
                        obj2.getAsJsonArray("shortcuts")?.forEach { el ->
                            val o = el.asJsonObject
                            o.get("shortName")?.asString?.let { shortcuts.add(it) }
                            o.get("fullName")?.asString?.let { shortcuts.add(it) }
                        }
                        obj2.getAsJsonArray("supportAreas")?.forEach { support.add(it.asString) }
                        RideTextParser.updateKnownAreas(shortcuts, support)
                        Log.d("WS", "areas_updated: ${shortcuts.size} shortcuts, ${support.size} support areas")
                        scope.launch { _areasUpdated.emit(obj2.toString()) }
                    } catch (e: Exception) { Log.e("WS", "areas_updated parse error: ${e.message}") }
                }
            }
        } catch (e: Exception) {
            Log.e("WS", "Parse error: ${e.message}")
        }
    }

    fun setAvailability(available: Boolean, keywords: List<String> = emptyList(), pausedKeywords: List<String> = emptyList()) {
        val data = mutableMapOf<String, Any>("available" to available)
        if (keywords.isNotEmpty()) data["keywords"] = keywords
        if (pausedKeywords.isNotEmpty()) data["pausedKeywords"] = pausedKeywords
        send("set_availability", data)
    }

    fun setAutoMode(enabled: Boolean) = send("set_auto_mode", mapOf("enabled" to enabled))
    /** Set the km-range filter on the server. Pass 0 or null to clear it. */
    fun setKmFilter(km: Int?) {
        val value: Any = km ?: 0
        send("set_km_filter", mapOf("km" to value))
    }
    /** Set the minimum ride price filter on the server. Pass 0/null to clear. */
    fun setMinPrice(minPrice: Int?) {
        val value: Any = minPrice ?: 0
        send("set_min_price", mapOf("minPrice" to value))
    }
    fun addKeyword(keyword: String) = send("add_keyword", mapOf("keyword" to keyword))
    fun removeKeyword(keyword: String) = send("remove_keyword", mapOf("keyword" to keyword))
    fun pauseKeyword(keyword: String) = send("pause_keyword", mapOf("keyword" to keyword))
    fun resumeKeyword(keyword: String) = send("resume_keyword", mapOf("keyword" to keyword))

    fun sendRideAction(rideId: String, action: String, linkPhone: String = "", linkText: String = "") {
        val data = mutableMapOf<String, Any>("rideId" to rideId, "action" to action, "text" to "ת")
        if (linkPhone.isNotEmpty()) data["linkPhone"] = linkPhone
        if (linkText.isNotEmpty()) data["linkText"] = linkText
        send("ride_action", data)
    }

    /** Tell the server to send the dispatcher's chat code via WhatsApp.
     * The server stashes ride tokens so it can identify the dispatcher when
     * their first private message arrives. */
    fun openChatRoute(rideId: String, chatPhone: String, chatText: String, ride: Map<String, Any>? = null) {
        val data = mutableMapOf<String, Any>(
            "rideId" to rideId,
            "action" to "open_chat",
            "chatPhone" to chatPhone,
            "chatText" to chatText
        )
        if (ride != null) data["ride"] = ride
        send("ride_action", data)
    }

    fun sendEtaResponse(rideId: String, minutes: Int) =
        send("eta_response", mapOf("rideId" to rideId, "minutes" to minutes))

    fun sendRideStatus(rideId: String, status: String) =
        send("ride_status", mapOf("rideId" to rideId, "status" to status))

    fun cancelAutoRide(rideId: String) = send("cancel_auto_ride", mapOf("rideId" to rideId))

    fun sendChatMessage(to: String, text: String) =
        send("send_message", mapOf("to" to to, "text" to text))

    fun setDefaultEta(minutes: Int) = send("set_default_eta", mapOf("eta" to minutes))

    // ── Pending queue: retry critical messages when WS reconnects ──
    private data class PendingMsg(val type: String, val data: Map<String, Any>, val ts: Long = System.currentTimeMillis())
    private val pendingQueue = java.util.concurrent.ConcurrentLinkedQueue<PendingMsg>()
    private val CRITICAL_TYPES = setOf("ride_action", "send_message")

    private fun send(type: String, data: Map<String, Any>) {
        val msg = gson.toJson(mapOf("type" to type, "data" to data))
        val ok = webSocket?.send(msg) ?: false
        if (!ok) {
            Log.w("WS", "Send failed: $type — queuing for retry")
            if (type in CRITICAL_TYPES) {
                pendingQueue.add(PendingMsg(type, data))
            }
        }
    }

    /** Flush any queued critical messages after reconnect. Called from onOpen. */
    private fun flushPendingQueue() {
        val now = System.currentTimeMillis()
        var msg = pendingQueue.poll()
        while (msg != null) {
            // Drop messages older than 2 minutes — they're stale
            if (now - msg.ts < 2 * 60 * 1000) {
                val json = gson.toJson(mapOf("type" to msg.type, "data" to msg.data))
                val ok = webSocket?.send(json) ?: false
                Log.i("WS", "Retry queued ${msg.type}: ${if (ok) "OK" else "FAILED"}")
            }
            msg = pendingQueue.poll()
        }
    }
}
