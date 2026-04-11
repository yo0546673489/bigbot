package com.wabot.app.data

import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonParser
import com.wabot.app.BuildConfig
import com.wabot.app.data.models.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import okhttp3.*
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WebSocketService @Inject constructor(
    private val gson: Gson
) {
    private val TAG = "BigBotWS"
    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    private val _rides = MutableSharedFlow<Ride>(extraBufferCapacity = 100)
    val rides: SharedFlow<Ride> = _rides

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected

    private val _waConnected = MutableStateFlow(false)
    val waConnected: StateFlow<Boolean> = _waConnected

    private val _actionResult = MutableSharedFlow<ActionResultData>(extraBufferCapacity = 20)
    val actionResult: SharedFlow<ActionResultData> = _actionResult

    private val _chatMessage = MutableSharedFlow<ChatMessage>(extraBufferCapacity = 50)
    val chatMessage: SharedFlow<ChatMessage> = _chatMessage

    private val _etaRequest = MutableSharedFlow<String>(extraBufferCapacity = 5)
    val etaRequest: SharedFlow<String> = _etaRequest  // rideId

    var driverPhone: String = ""
    var serverUrl: String = BuildConfig.SERVER_URL

    fun connect(phone: String, token: String) {
        driverPhone = phone
        val wsUrl = serverUrl.replace("http://", "ws://").replace("https://", "wss://")
        val url = if (wsUrl.endsWith("/drivers")) wsUrl else "$wsUrl/drivers"
        val request = Request.Builder()
            .url(url)
            .addHeader("x-driver-phone", phone)
            .build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                Log.d(TAG, "Connected to server")
                _connected.value = true
                sendMessage("auth", mapOf("token" to token, "phone" to phone))
            }

            override fun onMessage(ws: WebSocket, text: String) {
                handleMessage(text)
            }

            override fun onClosing(ws: WebSocket, code: Int, reason: String) {
                _connected.value = false
                Log.d(TAG, "Disconnecting: $reason")
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                _connected.value = false
                Log.e(TAG, "WebSocket failure: ${t.message}")
                Thread.sleep(3000)
                connect(phone, token)
            }
        })
    }

    fun disconnect() {
        webSocket?.close(1000, "User disconnected")
        webSocket = null
        _connected.value = false
    }

    private fun handleMessage(text: String) {
        try {
            val json = JsonParser.parseString(text).asJsonObject
            val type = json.get("type")?.asString ?: return
            val data = json.get("data")

            when (type) {
                "new_ride" -> {
                    val ride = gson.fromJson(data, Ride::class.java)
                    _rides.tryEmit(ride)
                }
                "ride_update" -> {
                    val result = gson.fromJson(data, ActionResultData::class.java)
                    _actionResult.tryEmit(result)
                }
                "action_result" -> {
                    val result = gson.fromJson(data, ActionResultData::class.java)
                    _actionResult.tryEmit(result)
                }
                "wa_status" -> {
                    val status = gson.fromJson(data, WAStatusData::class.java)
                    _waConnected.value = status.connected
                }
                "chat_message" -> {
                    val msg = gson.fromJson(data, ChatMessage::class.java)
                    _chatMessage.tryEmit(msg)
                }
                "eta_request" -> {
                    val rideId = data?.asJsonObject?.get("rideId")?.asString ?: ""
                    if (rideId.isNotBlank()) _etaRequest.tryEmit(rideId)
                }
                "pong" -> { /* heartbeat ack */ }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling message: ${e.message}")
        }
    }

    // Ride actions
    fun sendRideAction(rideId: String, action: String, linkPhone: String = "", linkText: String = "") {
        sendMessage("ride_action", mapOf(
            "rideId" to rideId,
            "action" to action,
            "linkPhone" to linkPhone,
            "linkText" to linkText
        ))
    }

    // Availability
    fun setAvailability(available: Boolean, keywords: List<String>) {
        sendMessage("set_availability", mapOf(
            "available" to available,
            "keywords" to keywords
        ))
    }

    // Keyword management
    fun pauseKeyword(keyword: String) {
        sendMessage("pause_keyword", mapOf("keyword" to keyword))
    }

    fun resumeKeyword(keyword: String) {
        sendMessage("resume_keyword", mapOf("keyword" to keyword))
    }

    fun addKeyword(keyword: String) {
        sendMessage("add_keyword", mapOf("keyword" to keyword))
    }

    fun removeKeyword(keyword: String) {
        sendMessage("remove_keyword", mapOf("keyword" to keyword))
    }

    // Auto mode
    fun setAutoMode(enabled: Boolean) {
        sendMessage("set_auto_mode", mapOf("enabled" to enabled))
    }

    // ETA response
    fun sendEtaResponse(rideId: String, minutes: Int) {
        sendMessage("eta_response", mapOf("rideId" to rideId, "minutes" to minutes))
    }

    // Ride status
    fun sendRideStatus(rideId: String, status: String) {
        sendMessage("ride_status", mapOf("rideId" to rideId, "status" to status))
    }

    // Cancel auto ride
    fun cancelAutoRide(rideId: String) {
        sendMessage("cancel_auto_ride", mapOf("rideId" to rideId))
    }

    // Chat
    fun sendChatMessage(to: String, text: String) {
        sendMessage("send_message", mapOf("to" to to, "text" to text))
    }

    // Default ETA setting
    fun setDefaultEta(minutes: Int) {
        sendMessage("set_default_eta", mapOf("minutes" to minutes))
    }

    fun ping() {
        sendMessage("ping", null)
    }

    private fun sendMessage(type: String, data: Any?) {
        val payload = mapOf("type" to type, "data" to data)
        val json = gson.toJson(payload)
        webSocket?.send(json)
    }

    fun isConnected() = _connected.value
}
