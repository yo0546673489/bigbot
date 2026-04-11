package com.bigbot.app.data

import android.util.Log
import com.bigbot.app.data.models.*
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

    var serverUrl: String = "ws://194.36.89.169:7878/drivers"

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        // 20s ping keeps NAT/firewall/cellular connection alive and detects
        // dead sockets fast — without this, idle WebSockets become "zombie"
        // connections and rides silently disappear.
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private var driverPhone: String = ""
    private var driverName: String = ""
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

    // Dedup recently-seen ride messageIds. Server replays buffered rides on
    // reconnect (to recover from disconnect windows), so we MUST drop duplicates
    // here. Bounded LinkedHashSet acts as an LRU.
    private val seenRideIds = object : LinkedHashSet<String>() {
        override fun add(element: String): Boolean {
            val added = super.add(element)
            if (size > 500) iterator().also { it.next(); it.remove() }
            return added
        }
    }

    fun isConnected() = _connected.value

    fun connect(phone: String, name: String) {
        driverPhone = phone
        driverName = name
        val request = Request.Builder()
            .url(serverUrl)
            .header("X-Driver-Phone", phone)
            .header("X-Driver-Name", name)
            .build()
        webSocket?.cancel()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                _connected.value = true
                Log.d("WS", "Connected as $phone")
                // בקש סטטוס WhatsApp מהשרת
                send("get_status", mapOf("phone" to phone))
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _connected.value = false
                Log.e("WS", "Failure: ${t.message}")
                scheduleReconnect()
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                _connected.value = false
            }
        })
    }

    private fun scheduleReconnect() {
        scope.launch {
            delay(500) // fast reconnect — was 3000ms which lost too many rides
            if (!_connected.value && driverPhone.isNotEmpty()) {
                connect(driverPhone, driverName)
            }
        }
    }

    fun disconnect() {
        driverPhone = ""
        webSocket?.close(1000, "disconnect")
        webSocket = null
        _connected.value = false
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

    fun setDefaultEta(minutes: Int) = send("set_default_eta", mapOf("minutes" to minutes))

    private fun send(type: String, data: Map<String, Any>) {
        val msg = gson.toJson(mapOf("type" to type, "data" to data))
        val ok = webSocket?.send(msg) ?: false
        if (!ok) Log.w("WS", "Send failed: $type")
    }
}
