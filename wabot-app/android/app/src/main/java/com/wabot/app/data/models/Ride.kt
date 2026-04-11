package com.wabot.app.data.models

data class Ride(
    val id: String = "",
    val messageId: String = "",
    val groupId: String = "",
    val groupName: String = "",
    val origin: String = "",
    val destination: String = "",
    val originRaw: String = "",
    val destinationRaw: String = "",
    val body: String = "",
    val bodyClean: String = "",
    val senderPhone: String = "",
    val senderName: String = "",
    val price: String = "",
    val timestamp: Long = 0L,
    val hasLink: Boolean = false,
    val linkPhone: String = "",
    val linkText: String = "",
    val isUrgent: Boolean = false,
    val buttons: List<RideButton> = emptyList(),
    val isSpecialGroup: Boolean = false
)

data class RideButton(
    val id: String,
    val label: String
)

data class ChatMessage(
    val id: String = "",
    val from: String = "",
    val fromName: String = "",
    val text: String = "",
    val timestamp: Long = 0L,
    val isOutgoing: Boolean = false
)

data class AppNotification(
    val id: String = "",
    val type: String = "",   // "ride_taken", "auto_taken", "new_ride", "missed", "wa_status"
    val title: String = "",
    val body: String = "",
    val timestamp: Long = 0L,
    val rideId: String = "",
    val read: Boolean = false
)

data class WebSocketMessage(
    val type: String,
    val data: Any? = null
)

data class ActionResultData(
    val rideId: String = "",
    val action: String = "",
    val success: Boolean = false,
    val error: String? = null,
    val status: String? = null,    // "sending", "success", "failed", "waiting_eta", "ride_taken"
    val message: String? = null
)

data class WAStatusData(
    val phone: String = "",
    val connected: Boolean = false
)

data class EtaRequest(
    val rideId: String,
    val minutes: Int
)

data class RideActionRequest(
    val rideId: String,
    val action: String,
    val customText: String = "",
    val linkPhone: String = "",
    val linkText: String = ""
)

data class SetAvailabilityRequest(
    val available: Boolean,
    val keywords: List<String>
)

data class AuthRequest(
    val token: String
)

// Keyword states tracked locally
data class KeywordItem(
    val keyword: String,
    val isActive: Boolean = true
) {
    val displayText: String get() {
        return if (keyword.contains("_")) {
            val parts = keyword.split("_")
            "${parts[0]} ← ${parts[1]}"
        } else keyword
    }
}
