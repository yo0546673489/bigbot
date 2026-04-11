package com.bigbot.app.data

import com.bigbot.app.data.models.ChatMessage
import com.bigbot.app.data.models.Conversation
import com.bigbot.app.data.models.Ride
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Multi-conversation chat store.
 *
 * Holds conversations keyed by remote phone, plus messages per phone.
 * Subscribes to incoming chat_message events from WebSocketService and routes them.
 * Persists to DataStore so chats survive app restarts.
 */
@Singleton
class ChatStore @Inject constructor(
    private val ws: WebSocketService,
    private val repo: Repository,
    private val api: ApiService
) {
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private val gson = Gson()
    private var loaded = false

    // phone -> Conversation
    private val _conversations = MutableStateFlow<Map<String, Conversation>>(emptyMap())
    val conversations: StateFlow<Map<String, Conversation>> = _conversations.asStateFlow()

    // phone -> messages
    private val _messagesByPhone = MutableStateFlow<Map<String, List<ChatMessage>>>(emptyMap())
    val messagesByPhone: StateFlow<Map<String, List<ChatMessage>>> = _messagesByPhone.asStateFlow()

    private val _selectedPhone = MutableStateFlow<String?>(null)
    val selectedPhone: StateFlow<String?> = _selectedPhone.asStateFlow()

    /** Emits when a dispatcher's first reply arrives via token-match.
     * MainActivity observes this and navigates to the chat tab. */
    private val _autoOpenChatRequests = MutableSharedFlow<String>(replay = 0, extraBufferCapacity = 4)
    val autoOpenChatRequests: SharedFlow<String> = _autoOpenChatRequests.asSharedFlow()

    init {
        // Load persisted state once, then start collecting incoming messages
        scope.launch {
            try {
                val convJson = repo.chatConversationsJson.first()
                if (convJson.isNotBlank()) {
                    // Parse via JsonObject so missing fields (e.g. avatarUrl in older data)
                    // don't bypass Kotlin's null-safety via Gson's reflection.
                    val root = com.google.gson.JsonParser.parseString(convJson).asJsonObject
                    val map = mutableMapOf<String, Conversation>()
                    for ((phone, el) in root.entrySet()) {
                        val o = el.asJsonObject
                        fun str(k: String) = o.get(k)?.takeIf { !it.isJsonNull }?.asString.orEmpty()
                        fun lng(k: String) = o.get(k)?.takeIf { !it.isJsonNull }?.asLong ?: 0L
                        fun int(k: String) = o.get(k)?.takeIf { !it.isJsonNull }?.asInt ?: 0
                        fun bool(k: String) = o.get(k)?.takeIf { !it.isJsonNull }?.asBoolean ?: false
                        map[phone] = Conversation(
                            phone = str("phone").ifBlank { phone },
                            name = str("name").ifBlank { phone },
                            lastMessage = str("lastMessage"),
                            lastTimestamp = lng("lastTimestamp").let { if (it == 0L) System.currentTimeMillis() else it },
                            unreadCount = int("unreadCount"),
                            rideOrigin = str("rideOrigin"),
                            rideDestination = str("rideDestination"),
                            ridePrice = str("ridePrice"),
                            lastFromMe = bool("lastFromMe"),
                            avatarUrl = str("avatarUrl")
                        )
                    }
                    // One-time cleanup: drop any conversation that did NOT originate
                    // from an in-app ride action. Only chats that were opened from a
                    // ride card (reply_private / reply_both / open_chat / take_ride_link)
                    // ever set rideOrigin or rideDestination, so use those as the proxy.
                    val cleaned = map.filterValues { it.rideOrigin.isNotBlank() || it.rideDestination.isNotBlank() }
                    _conversations.value = cleaned
                    val needsPersist = cleaned.size != map.size
                    if (needsPersist) {
                        try { repo.saveChatConversations(gson.toJson(cleaned)) } catch (_: Exception) {}
                        // Also drop messages for conversations that were filtered out
                        val keepPhones = cleaned.keys
                        val msgs = _messagesByPhone.value.filterKeys { it in keepPhones }
                        _messagesByPhone.value = msgs
                        try { repo.saveChatMessages(gson.toJson(msgs)) } catch (_: Exception) {}
                    }
                }
                val msgJson = repo.chatMessagesJson.first()
                if (msgJson.isNotBlank()) {
                    val root = com.google.gson.JsonParser.parseString(msgJson).asJsonObject
                    val map = mutableMapOf<String, List<ChatMessage>>()
                    for ((phone, arr) in root.entrySet()) {
                        val list = mutableListOf<ChatMessage>()
                        for (el in arr.asJsonArray) {
                            val o = el.asJsonObject
                            fun str(k: String) = o.get(k)?.takeIf { !it.isJsonNull }?.asString.orEmpty()
                            fun lng(k: String) = o.get(k)?.takeIf { !it.isJsonNull }?.asLong ?: 0L
                            fun bool(k: String) = o.get(k)?.takeIf { !it.isJsonNull }?.asBoolean ?: false
                            list += ChatMessage(
                                id = str("id").ifBlank { java.util.UUID.randomUUID().toString() },
                                from = str("from"),
                                fromName = str("fromName"),
                                text = str("text"),
                                timestamp = lng("timestamp").let { if (it == 0L) System.currentTimeMillis() else it },
                                isOutgoing = bool("isOutgoing"),
                                quotedText = str("quotedText")
                            )
                        }
                        map[phone] = list
                    }
                    _messagesByPhone.value = map
                }
            } catch (_: Exception) {
                // Corrupt cache — start fresh
            }
            loaded = true
            // Backfill profile pictures for any conversation missing one
            scope.launch {
                val phones = _conversations.value.filterValues { it.avatarUrl.isBlank() }.keys.toList()
                for (phone in phones) {
                    val url = api.getProfilePictureUrl(phone)
                    if (url.isNotBlank()) {
                        _conversations.update { current ->
                            current[phone]?.let { conv ->
                                current + (phone to conv.copy(avatarUrl = url))
                            } ?: current
                        }
                        persistConversations()
                    }
                }
            }
        }
        scope.launch {
            ws.chatMessages.collect { msg ->
                if (msg.from.isNotEmpty()) {
                    if (msg.isOutgoing) addOutgoingFromServer(msg) else addIncoming(msg)
                }
            }
        }
    }

    /** Adds an outgoing message that was sent directly via the user's WhatsApp
     * (not via the app) and synced back from the server. */
    private fun addOutgoingFromServer(msg: ChatMessage) {
        val phone = msg.from
        // Avoid duplicates: if the message id already exists in this conversation, skip.
        val existing = _messagesByPhone.value[phone].orEmpty()
        if (existing.any { it.id == msg.id }) return
        appendMessage(phone, msg.copy(isOutgoing = true))
        upsertConversation(
            phone = phone,
            name = msg.fromName.ifEmpty { _conversations.value[phone]?.name ?: phone },
            lastMessage = msg.text,
            lastTimestamp = msg.timestamp,
            fromMe = true,
            incrementUnread = false
        )
    }

    private fun persistConversations() {
        if (!loaded) return
        scope.launch {
            try { repo.saveChatConversations(gson.toJson(_conversations.value)) } catch (_: Exception) {}
        }
    }

    private fun persistMessages() {
        if (!loaded) return
        scope.launch {
            try { repo.saveChatMessages(gson.toJson(_messagesByPhone.value)) } catch (_: Exception) {}
        }
    }

    /** Adds an incoming message from the server (someone messaged us). */
    private fun addIncoming(msg: ChatMessage) {
        val phone = msg.from
        appendMessage(phone, msg.copy(isOutgoing = false))
        upsertConversation(
            phone = phone,
            name = msg.fromName.ifEmpty { phone },
            lastMessage = msg.text,
            lastTimestamp = msg.timestamp,
            fromMe = false,
            incrementUnread = (_selectedPhone.value != phone)
        )
        // Tag the conversation with ride context coming from the dispatcher's
        // very first message (server fills these only on auto-open events).
        if (msg.rideOrigin.isNotBlank() || msg.rideDestination.isNotBlank() || msg.ridePrice.isNotBlank()) {
            _conversations.update { current ->
                current[phone]?.let { conv ->
                    current + (phone to conv.copy(
                        rideOrigin = msg.rideOrigin.ifEmpty { conv.rideOrigin },
                        rideDestination = msg.rideDestination.ifEmpty { conv.rideDestination },
                        ridePrice = msg.ridePrice.ifEmpty { conv.ridePrice }
                    ))
                } ?: current
            }
            persistConversations()
        }
        // Server signaled this is the dispatcher's first reply matched by token —
        // auto-select the conversation AND signal MainActivity to switch to the
        // chat tab so the user lands directly in the conversation.
        if (msg.autoOpen) {
            selectConversation(phone)
            scope.launch { _autoOpenChatRequests.emit(phone) }
        }
    }

    /** Open or create a conversation tied to a ride (called when user taps reply_*). */
    fun openOrCreateForRide(ride: Ride, replyText: String = "ת") {
        val phone = ride.dispatcherPhone.ifEmpty { ride.senderPhone }
        if (phone.isBlank()) return
        // Prefer the dispatcher's personal name; fall back to formatted phone (NOT group name)
        val name = ride.dispatcherName.ifEmpty { formatPhone(phone) }
        val now = System.currentTimeMillis()

        // Build the quoted-reply block exactly as WhatsApp shows it on the dispatcher's side:
        //   את/ה • <groupName>
        //   <full raw ride text>
        val quoted = buildString {
            append("את/ה")
            if (ride.groupName.isNotBlank()) {
                append(" • ")
                append(ride.groupName)
            }
            // Use the full raw message text — exactly what WhatsApp quotes
            val body = ride.rawText.ifBlank {
                listOf(ride.origin, ride.destination).filter { it.isNotBlank() }.joinToString(" ")
            }
            if (body.isNotBlank()) {
                append('\n')
                append(body)
            }
        }

        // Append the actual text we sent ("ת") as an outgoing message in the chat history,
        // with the quoted ride block above it (matching WhatsApp's quoted-reply visual)
        val msg = ChatMessage(
            id = UUID.randomUUID().toString(),
            from = "",
            text = replyText,
            timestamp = now,
            isOutgoing = true,
            quotedText = quoted
        )
        appendMessage(phone, msg)

        _conversations.update { current ->
            val existing = current[phone]
            val updated = (existing ?: Conversation(phone = phone, name = name)).copy(
                name = if (existing?.name?.isNotBlank() == true) existing.name else name,
                rideOrigin = ride.origin,
                rideDestination = ride.destination,
                ridePrice = ride.price,
                lastMessage = replyText,
                lastTimestamp = now,
                lastFromMe = true
            )
            current + (phone to updated)
        }
        persistConversations()
    }

    /** Selects a conversation for viewing (resets its unread count). Fetches profile pic if missing. */
    fun selectConversation(phone: String) {
        _selectedPhone.value = phone
        _conversations.update { current ->
            current[phone]?.let { conv ->
                current + (phone to conv.copy(unreadCount = 0))
            } ?: current
        }
        persistConversations()
        // Fetch profile picture in background if not yet loaded
        val existing = _conversations.value[phone]
        if (existing != null && existing.avatarUrl.isBlank()) {
            scope.launch {
                val url = api.getProfilePictureUrl(phone)
                if (url.isNotBlank()) {
                    _conversations.update { current ->
                        current[phone]?.let { conv ->
                            current + (phone to conv.copy(avatarUrl = url))
                        } ?: current
                    }
                    persistConversations()
                }
            }
        }
    }

    fun closeConversation() {
        _selectedPhone.value = null
    }

    /** Called from notification tap or in-app success button to jump directly into a chat. */
    fun triggerDirectOpen(phone: String, name: String = "", ride: Ride? = null) {
        if (phone.isBlank()) return
        openChatWithDispatcher(phone, name.ifBlank { phone }, ride)
        scope.launch { _autoOpenChatRequests.emit(phone) }
    }

    /** Open or create a chat with the given dispatcher phone WITHOUT sending any
     * message. Used by the "💬 צ'אט עם סדרן" button on a 2-link ride card. */
    fun openChatWithDispatcher(phone: String, displayName: String, ride: Ride? = null) {
        if (phone.isBlank()) return
        val name = displayName.ifBlank { formatPhone(phone) }
        _conversations.update { current ->
            val existing = current[phone]
            val updated = (existing ?: Conversation(phone = phone, name = name)).copy(
                name = if (existing?.name?.isNotBlank() == true) existing.name else name,
                rideOrigin = ride?.origin ?: existing?.rideOrigin ?: "",
                rideDestination = ride?.destination ?: existing?.rideDestination ?: "",
                ridePrice = ride?.price ?: existing?.ridePrice ?: ""
            )
            current + (phone to updated)
        }
        persistConversations()
        selectConversation(phone)
    }

    /** Sends an outgoing message in the currently selected conversation. */
    fun sendMessage(text: String) {
        val phone = _selectedPhone.value ?: return
        if (text.isBlank()) return
        val msg = ChatMessage(
            id = UUID.randomUUID().toString(),
            from = "",
            text = text,
            timestamp = System.currentTimeMillis(),
            isOutgoing = true
        )
        appendMessage(phone, msg)
        upsertConversation(
            phone = phone,
            name = _conversations.value[phone]?.name ?: phone,
            lastMessage = text,
            lastTimestamp = msg.timestamp,
            fromMe = true,
            incrementUnread = false
        )
        ws.sendChatMessage(phone, text)
    }

    /** Update an existing conversation's display name (e.g. when dispatcherName arrives via RideUpdate). */
    fun updateConversationName(phone: String, name: String) {
        if (phone.isBlank() || name.isBlank()) return
        _conversations.update { current ->
            val existing = current[phone] ?: return@update current
            current + (phone to existing.copy(name = name))
        }
        persistConversations()
    }

    private fun formatPhone(phone: String): String {
        val digits = phone.filter { it.isDigit() }
        val local = if (digits.startsWith("972")) "0" + digits.substring(3) else digits
        return when {
            local.length == 10 -> "${local.substring(0, 3)}-${local.substring(3, 6)}-${local.substring(6)}"
            local.length == 9 -> "${local.substring(0, 2)}-${local.substring(2, 5)}-${local.substring(5)}"
            else -> local
        }
    }

    private fun appendMessage(phone: String, msg: ChatMessage) {
        _messagesByPhone.update { current ->
            val list = current[phone].orEmpty()
            current + (phone to (list + msg).takeLast(200))
        }
        persistMessages()
    }

    private fun upsertConversation(
        phone: String,
        name: String,
        lastMessage: String,
        lastTimestamp: Long,
        fromMe: Boolean,
        incrementUnread: Boolean
    ) {
        _conversations.update { current ->
            val existing = current[phone]
            val newUnread = if (incrementUnread) (existing?.unreadCount ?: 0) + 1 else (existing?.unreadCount ?: 0)
            val updated = (existing ?: Conversation(phone = phone, name = name)).copy(
                name = if (existing?.name?.isNotBlank() == true) existing.name else name,
                lastMessage = lastMessage,
                lastTimestamp = lastTimestamp,
                lastFromMe = fromMe,
                unreadCount = newUnread
            )
            current + (phone to updated)
        }
        persistConversations()
    }
}
