package com.bigbot.app.data.models

data class Conversation(
    val phone: String,
    val name: String,
    val lastMessage: String = "",
    val lastTimestamp: Long = System.currentTimeMillis(),
    val unreadCount: Int = 0,
    val rideOrigin: String = "",
    val rideDestination: String = "",
    val ridePrice: String = "",
    val lastFromMe: Boolean = false,
    val avatarUrl: String = ""
)
