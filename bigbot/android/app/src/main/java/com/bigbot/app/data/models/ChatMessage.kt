package com.bigbot.app.data.models

import com.google.gson.annotations.SerializedName
import java.util.UUID

data class ChatMessage(
    @SerializedName("id") val id: String = UUID.randomUUID().toString(),
    @SerializedName("from") val from: String = "",
    @SerializedName("fromName") val fromName: String = "",
    @SerializedName("text") val text: String = "",
    @SerializedName("timestamp") val timestamp: Long = System.currentTimeMillis(),
    @SerializedName("isOutgoing") val isOutgoing: Boolean = false,
    /** Quoted message block (WhatsApp-style reply quote) — multi-line allowed */
    @SerializedName("quotedText") val quotedText: String = "",
    /** When true, the chat tab should auto-select this conversation. Set by
     * the server when a dispatcher's first reply is matched via pending tokens. */
    @SerializedName("autoOpen") val autoOpen: Boolean = false,
    @SerializedName("rideOrigin") val rideOrigin: String = "",
    @SerializedName("rideDestination") val rideDestination: String = "",
    @SerializedName("ridePrice") val ridePrice: String = ""
)
