package com.wabot.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.wabot.app.data.Repository
import com.wabot.app.data.models.*
import com.wabot.app.service.LocationService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class ButtonState { IDLE, SENDING, SENT, FAILED }

data class RideButtonState(
    val rideId: String,
    val action: String,
    val state: ButtonState
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val repo: Repository
) : ViewModel() {

    private val _rides = MutableStateFlow<List<Ride>>(emptyList())
    val rides: StateFlow<List<Ride>> = _rides

    // keywords stored as KeywordItem with active/inactive state
    private val _keywords = MutableStateFlow<List<KeywordItem>>(emptyList())
    val keywords: StateFlow<List<KeywordItem>> = _keywords

    val isAvailable: StateFlow<Boolean> = repo.isAvailable.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), false
    )

    val isConnected: StateFlow<Boolean> = repo.wsService.connected.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), false
    )

    val waConnected: StateFlow<Boolean> = repo.wsService.waConnected.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), false
    )

    val driverPhone: StateFlow<String> = repo.driverPhone.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), ""
    )

    val autoMode: StateFlow<Boolean> = repo.autoMode.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), false
    )

    // Button states per (rideId + action)
    private val _buttonStates = MutableStateFlow<Map<String, ButtonState>>(emptyMap())
    val buttonStates: StateFlow<Map<String, ButtonState>> = _buttonStates

    // Toast events
    private val _toastEvent = MutableSharedFlow<String>(extraBufferCapacity = 5)
    val toastEvent: SharedFlow<String> = _toastEvent

    // ETA bottom sheet
    private val _etaRideId = MutableStateFlow<String?>(null)
    val etaRideId: StateFlow<String?> = _etaRideId

    // Chat messages
    private val _chatMessages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val chatMessages: StateFlow<List<ChatMessage>> = _chatMessages

    // Notifications
    private val _notifications = MutableStateFlow<List<AppNotification>>(emptyList())
    val notifications: StateFlow<List<AppNotification>> = _notifications

    // Smart location popup city name (null = hidden)
    private val _smartLocationCity = MutableStateFlow<String?>(null)
    val smartLocationCity: StateFlow<String?> = _smartLocationCity

    init {
        viewModelScope.launch {
            val phone = repo.driverPhone.first()
            val serverUrl = repo.serverUrl.first()
            if (phone.isNotBlank() && !repo.wsService.isConnected()) {
                repo.wsService.serverUrl = serverUrl
                repo.wsService.connect(phone, phone)
            }
        }

        // Load saved keywords as KeywordItems
        viewModelScope.launch {
            repo.keywords.collect { saved ->
                _keywords.value = saved.map { kw ->
                    _keywords.value.find { it.keyword == kw } ?: KeywordItem(kw, isActive = true)
                }
            }
        }

        // Collect incoming rides
        viewModelScope.launch {
            repo.wsService.rides.collect { ride ->
                _rides.update { current ->
                    val updated = listOf(ride) + current.filter { it.messageId != ride.messageId }
                    updated.take(50)
                }
            }
        }

        // Collect action results → update button states + toast
        viewModelScope.launch {
            repo.wsService.actionResult.collect { result ->
                val key = "${result.rideId}_${result.action}"
                if (result.success || result.status == "success") {
                    _buttonStates.update { it + (key to ButtonState.SENT) }
                    _toastEvent.tryEmit("ההודעה נשלחה בהצלחה")
                    // Reset to IDLE after 4 seconds
                    kotlinx.coroutines.delay(4000)
                    _buttonStates.update { it + (key to ButtonState.IDLE) }
                } else if (result.status == "failed" || (!result.success && result.error != null)) {
                    _buttonStates.update { it + (key to ButtonState.FAILED) }
                    _toastEvent.tryEmit("שליחה נכשלה, נסה שוב")
                    kotlinx.coroutines.delay(3000)
                    _buttonStates.update { it + (key to ButtonState.IDLE) }
                }
            }
        }

        // Collect ETA requests
        viewModelScope.launch {
            repo.wsService.etaRequest.collect { rideId ->
                _etaRideId.value = rideId
            }
        }

        // Collect chat messages
        viewModelScope.launch {
            repo.wsService.chatMessage.collect { msg ->
                _chatMessages.update { current -> current + msg }
            }
        }

        // Listen for GPS city changes from LocationService
        viewModelScope.launch {
            LocationService.cityChangeFlow.collect { city ->
                if (repo.autoLocationEnabled.first()) {
                    showSmartLocationPopup(city)
                }
            }
        }

        // Collect notifications from WS action results / ride events
        viewModelScope.launch {
            repo.wsService.actionResult.collect { result ->
                if (result.status == "ride_taken" || result.status == "success") {
                    val notif = AppNotification(
                        id = System.currentTimeMillis().toString(),
                        type = if (result.action == "take_ride_link") "auto_taken" else "ride_taken",
                        title = if (result.action == "take_ride_link") "נלקח אוטומטית!" else "קיבלת את הנסיעה!",
                        body = result.message ?: "",
                        timestamp = System.currentTimeMillis(),
                        rideId = result.rideId
                    )
                    _notifications.update { listOf(notif) + it }
                }
            }
        }
    }

    fun showSmartLocationPopup(city: String) {
        _smartLocationCity.value = city
    }

    fun confirmSmartLocation(city: String) {
        viewModelScope.launch {
            _smartLocationCity.value = null
            // Set available with city as keyword
            repo.saveAvailable(true)
            val cityKeyword = city.take(2) // simple short form
            repo.wsService.setAvailability(true, listOf(cityKeyword))
            _toastEvent.tryEmit("עודכן פנוי באזור $city")
        }
    }

    fun dismissSmartLocation() {
        _smartLocationCity.value = null
    }

    fun takeRideFromNotification(rideId: String) {
        viewModelScope.launch {
            repo.wsService.sendRideAction(rideId, "reply_both")
        }
    }

    fun setAvailability(available: Boolean) {
        viewModelScope.launch {
            repo.saveAvailable(available)
            val activeKws = _keywords.value.filter { it.isActive }.map { it.keyword }
            repo.wsService.setAvailability(available, activeKws)
        }
    }

    // Toggle keyword active/inactive
    fun toggleKeyword(keyword: String) {
        viewModelScope.launch {
            _keywords.update { list ->
                list.map { item ->
                    if (item.keyword == keyword) {
                        val newActive = !item.isActive
                        if (newActive) repo.wsService.resumeKeyword(keyword)
                        else repo.wsService.pauseKeyword(keyword)
                        item.copy(isActive = newActive)
                    } else item
                }
            }
        }
    }

    fun addKeyword(keyword: String) {
        viewModelScope.launch {
            val current = _keywords.value
            if (current.none { it.keyword == keyword }) {
                val newItem = KeywordItem(keyword, isActive = true)
                _keywords.update { it + newItem }
                val allKws = _keywords.value.map { it.keyword }
                repo.saveKeywords(allKws)
                repo.wsService.addKeyword(keyword)
                if (isAvailable.value) {
                    repo.wsService.setAvailability(true, allKws)
                }
            }
        }
    }

    fun removeKeyword(keyword: String) {
        viewModelScope.launch {
            _keywords.update { it.filter { item -> item.keyword != keyword } }
            val allKws = _keywords.value.map { it.keyword }
            repo.saveKeywords(allKws)
            repo.wsService.removeKeyword(keyword)
        }
    }

    fun setAutoMode(enabled: Boolean) {
        viewModelScope.launch {
            repo.saveAutoMode(enabled)
            repo.wsService.setAutoMode(enabled)
        }
    }

    fun performAction(ride: Ride, action: String) {
        val key = "${ride.messageId}_$action"
        val current = _buttonStates.value[key] ?: ButtonState.IDLE
        if (current != ButtonState.IDLE) return

        _buttonStates.update { it + (key to ButtonState.SENDING) }

        viewModelScope.launch {
            when (action) {
                "reply_group" -> repo.wsService.sendRideAction(ride.messageId, "reply_group")
                "reply_private" -> repo.wsService.sendRideAction(ride.messageId, "reply_private")
                "reply_both" -> repo.wsService.sendRideAction(ride.messageId, "reply_both")
                "take_ride_link" -> repo.wsService.sendRideAction(
                    ride.messageId, "take_ride_link",
                    linkPhone = ride.linkPhone,
                    linkText = ride.linkText
                )
            }

            // אם תוך 2.5 שניות לא הגיע אישור מהשרת — נניח הצלחה
            kotlinx.coroutines.delay(2500)
            if ((_buttonStates.value[key] ?: ButtonState.IDLE) == ButtonState.SENDING) {
                _buttonStates.update { it + (key to ButtonState.SENT) }
                _toastEvent.tryEmit("נשלח ✓")
                kotlinx.coroutines.delay(3000)
                _buttonStates.update { it + (key to ButtonState.IDLE) }
            }
        }
    }

    fun sendEtaResponse(rideId: String, minutes: Int) {
        viewModelScope.launch {
            repo.wsService.sendEtaResponse(rideId, minutes)
            _etaRideId.value = null
        }
    }

    fun dismissEta() {
        _etaRideId.value = null
    }

    fun cancelAutoRide(rideId: String) {
        viewModelScope.launch {
            repo.wsService.cancelAutoRide(rideId)
        }
    }

    fun sendChatMessage(to: String, text: String) {
        viewModelScope.launch {
            val outgoing = ChatMessage(
                id = System.currentTimeMillis().toString(),
                from = driverPhone.value,
                text = text,
                timestamp = System.currentTimeMillis(),
                isOutgoing = true
            )
            _chatMessages.update { it + outgoing }
            repo.wsService.sendChatMessage(to, text)
        }
    }

    fun getButtonState(rideId: String, action: String): ButtonState {
        return _buttonStates.value["${rideId}_$action"] ?: ButtonState.IDLE
    }
}
