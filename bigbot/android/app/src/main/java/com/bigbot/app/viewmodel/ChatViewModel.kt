package com.bigbot.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bigbot.app.data.ChatStore
import com.bigbot.app.data.Repository
import com.bigbot.app.data.models.ChatMessage
import com.bigbot.app.data.models.Conversation
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val repo: Repository,
    private val store: ChatStore
) : ViewModel() {

    /** All conversations sorted by recency (newest first). */
    val conversations: StateFlow<List<Conversation>> =
        store.conversations
            .map { map -> map.values.sortedByDescending { it.lastTimestamp } }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /** Selected conversation, or null when showing the list. */
    val selected: StateFlow<Conversation?> =
        combine(store.selectedPhone, store.conversations) { phone, map ->
            if (phone == null) null else map[phone]
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    /** Messages of the selected conversation. */
    val messages: StateFlow<List<ChatMessage>> =
        combine(store.selectedPhone, store.messagesByPhone) { phone, map ->
            if (phone == null) emptyList() else map[phone].orEmpty()
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val driverPhone = repo.driverPhone.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")

    /** Quick-reply buttons shown above the chat input. */
    val quickReplies: StateFlow<List<String>> = repo.quickReplies
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000),
            listOf("אני בדרך", "עוד 5 דקות", "הגעתי", "תתקשר אליי", "שלח מיקום"))

    fun openConversation(phone: String) = store.selectConversation(phone)
    fun closeConversation() = store.closeConversation()

    fun sendMessage(text: String) = store.sendMessage(text)
    fun sendQuickReply(text: String) = store.sendMessage(text)

    fun sendLocation(lat: Double, lng: Double) {
        store.sendMessage("המיקום שלי: https://maps.google.com/maps?q=$lat,$lng")
    }
}
