package com.bigbot.app.data.models

import com.google.gson.annotations.SerializedName

data class Ride(
    @SerializedName("messageId") val messageId: String = "",
    @SerializedName("groupName") val groupName: String = "",
    @SerializedName("origin") val origin: String = "",
    @SerializedName("destination") val destination: String = "",
    @SerializedName("price") val price: String = "",
    @SerializedName("seats") val seats: String = "",
    @SerializedName("rawText") val rawText: String = "",
    @SerializedName("timestamp") val timestamp: Long = 0,
    @SerializedName("isUrgent") val isUrgent: Boolean = false,
    @SerializedName("hasLink") val hasLink: Boolean = false,
    @SerializedName("linkPhone") val linkPhone: String = "",
    @SerializedName("linkText") val linkText: String = "",
    @SerializedName("senderPhone") val senderPhone: String = "",
    /** Per-spec message type: "regular_text" (0 links) | "single_link" (1 link) | "two_links" (2 links). */
    @SerializedName("messageType") val messageType: String = "",
    /** Second link in the ride message — the dispatcher chat link (used by "💬 צ'אט עם סדרן"). */
    @SerializedName("chatLink") val chatLink: String = "",
    /** Phone extracted from chatLink — used to OPEN a chat (no message sent). */
    @SerializedName("chatPhone") val chatPhone: String = "",
    /** Pre-filled text from chatLink (e.g. "צ kx8 ..."). Sent via WhatsApp when
     * the user taps the "💬 צ'אט עם סדרן" button. */
    @SerializedName("chatText") val chatText: String = "",
    val uiState: RideUiState = RideUiState.IDLE,
    val successMessage: String = "",
    val dispatcherName: String = "",
    val dispatcherPhone: String = "",
    val minutesAgo: Int = 0,
    /** ETA in minutes from driver's current location to ride origin. -1 = not calculated yet, 0 = calculating. */
    val etaMinutes: Int = -1
)

enum class RideUiState { IDLE, SENDING, WAITING_DISPATCHER, SUCCESS, AUTO_SUCCESS, FAILED, AUTO_PENDING }

data class RideUpdate(
    @SerializedName("rideId") val rideId: String = "",
    @SerializedName("status") val status: String = "",
    @SerializedName("message") val message: String = "",
    @SerializedName("dispatcherName") val dispatcherName: String = "",
    @SerializedName("dispatcherPhone") val dispatcherPhone: String = "",
    // Populated on status=success when a dispatcher replies privately after
    // the user pressed ת לקבוצה / ת לפרטי / ת לשניהם. Used by the success
    // notification in the foreground service to show the correct route.
    @SerializedName("origin") val origin: String = "",
    @SerializedName("destination") val destination: String = ""
)

data class EtaRequest(
    @SerializedName("rideId") val rideId: String = "",
    @SerializedName("linkPhone") val linkPhone: String = ""
)
