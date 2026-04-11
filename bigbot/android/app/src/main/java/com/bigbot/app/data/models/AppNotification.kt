package com.bigbot.app.data.models

import com.google.gson.annotations.SerializedName
import java.util.UUID

data class AppNotification(
    @SerializedName("id") val id: String = UUID.randomUUID().toString(),
    @SerializedName("notifType") val type: String = "",
    @SerializedName("title") val title: String = "",
    @SerializedName("body") val body: String = "",
    @SerializedName("timestamp") val timestamp: Long = System.currentTimeMillis(),
    @SerializedName("rideId") val rideId: String = "",
    @SerializedName("dispatcherPhone") val dispatcherPhone: String = "",
    @SerializedName("keyword") val keyword: String = "",
    @SerializedName("linkPhone") val linkPhone: String = "",
    @SerializedName("linkText") val linkText: String = ""
)
// type values: "ride_taken", "auto_taken", "new_match", "missed", "wa_status"
