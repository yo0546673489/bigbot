package com.bigbot.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bigbot.app.data.ApiService
import com.bigbot.app.data.ChatStore
import com.bigbot.app.data.LocationTracker
import com.bigbot.app.data.Repository
import com.bigbot.app.data.TtsManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.onEach
import com.bigbot.app.data.models.EtaRequest
import com.bigbot.app.data.models.Ride
import com.bigbot.app.data.models.RideUiState
import com.bigbot.app.ui.components.fullCityName
import com.bigbot.app.util.RideTextParser
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val repo: Repository,
    private val api: ApiService,
    private val chatStore: ChatStore,
    private val tts: TtsManager,
    private val locationTracker: LocationTracker
) : ViewModel() {

    private val _rides = MutableStateFlow<List<Ride>>(emptyList())
    val rides: StateFlow<List<Ride>> = _rides

    val isAvailable = repo.isAvailable.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    val isConnected = repo.wsService.connected.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    val waConnected = repo.wsService.waConnected.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    val keywords = repo.keywords.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val pausedKeywords = repo.pausedKeywords.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val driverName = repo.driverName.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")
    val driverPhone = repo.driverPhone.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")
    val autoMode = repo.autoMode.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    val autoSend = repo.autoSend.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    val ttsEnabled = repo.ttsEnabled.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    val voiceControlEnabled = repo.voiceControlEnabled.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    // Km-range filter state — UI reads these three StateFlows and calls the
    // matching action functions below to mutate them.
    val kmOptions = repo.kmOptions.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), listOf(5, 10, 20))
    val selectedKm = repo.selectedKm.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)
    val kmFilterVisible = repo.kmFilterVisible.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    private val _locationCity = MutableStateFlow("")
    val locationCity: StateFlow<String> = _locationCity

    // true = "פנוי מיקום" is active → GPS tracking is running
    private val _locationTrackingActive = MutableStateFlow(false)
    val locationTrackingActive: StateFlow<Boolean> = _locationTrackingActive
    private var locationTrackingJob: Job? = null

    private val _etaRequest = MutableStateFlow<EtaRequest?>(null)
    val etaRequest: StateFlow<EtaRequest?> = _etaRequest

    // מצב כפתורי "ת" — key = "${rideId}_${action}", value = true אם נשלח
    private val _sentButtons = MutableStateFlow<Set<String>>(emptySet())
    val sentButtons: StateFlow<Set<String>> = _sentButtons

    private val gson = Gson()
    private var ridesLoaded = false

    init {
        // Load persisted rides + sent-buttons before subscribing to live updates
        viewModelScope.launch {
            try {
                val ridesJson = repo.ridesJson.first()
                if (ridesJson.isNotBlank()) {
                    val type = object : TypeToken<List<Ride>>() {}.type
                    val list: List<Ride> = gson.fromJson(ridesJson, type) ?: emptyList()
                    _rides.value = list
                }
                val btnJson = repo.sentButtonsJson.first()
                if (btnJson.isNotBlank()) {
                    val type = object : TypeToken<Set<String>>() {}.type
                    val set: Set<String> = gson.fromJson(btnJson, type) ?: emptySet()
                    _sentButtons.value = set
                }
            } catch (_: Exception) { /* corrupt cache */ }
            ridesLoaded = true
        }
        // Persist rides whenever the list changes
        viewModelScope.launch {
            _rides.collect { list ->
                if (ridesLoaded) {
                    try { repo.saveRides(gson.toJson(list)) } catch (_: Exception) {}
                }
            }
        }
        viewModelScope.launch {
            _sentButtons.collect { set ->
                if (ridesLoaded) {
                    try { repo.saveSentButtons(gson.toJson(set)) } catch (_: Exception) {}
                }
            }
        }
        viewModelScope.launch {
            val phone = repo.driverPhone.first()
            val url = repo.serverUrl.first()
            if (phone.isNotBlank() && !repo.wsService.isConnected()) {
                repo.wsService.serverUrl = url
                repo.wsService.connect(phone, phone)
            }
        }
        // Keep TTS enabled flag in sync with the persisted preference so the
        // singleton knows whether to speak (used by the background service too).
        viewModelScope.launch {
            repo.ttsEnabled.collect { enabled ->
                tts.enabled = enabled
                if (enabled) tts.ensureStarted() else tts.stop()
            }
        }
        viewModelScope.launch {
            repo.wsService.rides.collect { ride ->
                // Min price filter — skip ride if below threshold
                val minPriceVal = repo.minPrice.first()
                if (minPriceVal > 0) {
                    var ridePrice = ride.price.replace("[^0-9]".toRegex(), "").toIntOrNull() ?: 0
                    if (ridePrice == 0 && ride.rawText.isNotEmpty()) {
                        val m = Regex("(?:^|\\s)(\\d{2,4})\\s*[₪ש\"ח](?:\\s|$)", RegexOption.MULTILINE).find(ride.rawText)
                        ridePrice = m?.groupValues?.get(1)?.toIntOrNull() ?: 0
                    }
                    if (ridePrice in 1 until minPriceVal) return@collect
                }
                // Delivery filter — skip if ride is a delivery and driver opted out
                val acceptDeliveries = repo.acceptDeliveries.first()
                if (!acceptDeliveries && RideTextParser.isDeliveryRide(ride.rawText)) return@collect

                // Vehicle type filter — match driver's vehicle against ride requirements
                val driverVehicle = repo.vehicleType.first()
                if (driverVehicle != "כולם" && driverVehicle.isNotBlank()) {
                    val parsed = RideTextParser.parse(ride.rawText, ride.origin, ride.destination)
                    if (parsed.vehicleType.isNotBlank()) {
                        val rideSeats = parsed.vehicleSeats.toIntOrNull() ?: 0
                        val isLargeVehicleRide = rideSeats >= 6 || parsed.vehicleType.isNotBlank()
                        val driverSeats = when {
                            driverVehicle.contains("4") -> 4
                            driverVehicle.contains("6") -> 6
                            driverVehicle.contains("7") -> 7
                            driverVehicle.contains("מיניבוס") -> 99
                            else -> 4
                        }
                        // Driver with 4 seats can't take large-vehicle rides
                        if (driverSeats == 4 && isLargeVehicleRide) return@collect
                    }
                }

                val minAgo = if (ride.timestamp > 0) ((System.currentTimeMillis() / 1000 - ride.timestamp) / 60).toInt().coerceAtLeast(0) else 0
                // Auto mode: instantly take the ride and mark as AUTO_PENDING
                val isAuto = autoMode.value && isAvailable.value
                val initialState = if (isAuto) RideUiState.AUTO_PENDING else RideUiState.IDLE
                _rides.update { current ->
                    (listOf(ride.copy(minutesAgo = minAgo, uiState = initialState)) + current.filter { it.messageId != ride.messageId }).take(50)
                }
                // Narrate "<origin full-name> <destination full-name>" if TTS is on.
                // Uses full city names (e.g. "בני ברק ירושלים") so the engine
                // pronounces them correctly rather than reading short codes.
                if (tts.enabled) {
                    val text = listOf(fullCityName(ride.origin), fullCityName(ride.destination))
                        .filter { it.isNotBlank() }
                        .joinToString(" ")
                    tts.speak(text)
                }
                if (isAuto) {
                    if (ride.hasLink && ride.linkPhone.isNotBlank()) {
                        repo.wsService.sendRideAction(ride.messageId, "take_ride_link", ride.linkPhone, ride.linkText)
                        _sentButtons.update { it + "${ride.messageId}_take_ride_link" }
                    } else {
                        repo.wsService.sendRideAction(ride.messageId, "reply_both")
                        _sentButtons.update { it + "${ride.messageId}_reply_both" }
                    }
                }
            }
        }
        viewModelScope.launch {
            repo.wsService.rideUpdates.collect { update ->
                // אם הגיע שם הסדרן — עדכן את שם השיחה הקיימת בצ'אט
                if (update.dispatcherPhone.isNotBlank() && update.dispatcherName.isNotBlank()) {
                    chatStore.updateConversationName(update.dispatcherPhone, update.dispatcherName)
                }
                // For "success" updates, move the ride to the TOP of the
                // list so the SuccessCard pops into view exactly like a new
                // ride arriving (matches the user's mental model: "I want it
                // to arrive in the app like a ride does, just saying קיבלת
                // את הנסיעה").
                if (update.status == "success") {
                    _rides.update { current ->
                        val match = current.firstOrNull { it.messageId == update.rideId }
                        if (match == null) return@update current
                        val updated = match.copy(
                            uiState = RideUiState.SUCCESS,
                            dispatcherName = update.dispatcherName,
                            dispatcherPhone = update.dispatcherPhone,
                            successMessage = update.message
                        )
                        listOf(updated) + current.filter { it.messageId != update.rideId }
                    }
                    return@collect
                }
                _rides.update { current ->
                    current.map { ride ->
                        if (ride.messageId == update.rideId) {
                            // Server status updates apply on top of any local state
                            // EXCEPT: while a card is still IDLE we ignore "sending"
                            // / "waiting" pings (those are local-only states for the
                            // take_ride_link flow). A "success" update from the
                            // dispatcher reply MUST flip an IDLE card to SUCCESS so
                            // the user sees "קיבלת את הנסיעה" inside the app.
                            if (ride.uiState == RideUiState.IDLE &&
                                update.status != "success" &&
                                update.status != "failed"
                            ) return@map ride
                            if (ride.uiState == RideUiState.AUTO_PENDING) {
                                // נסיעה רגילה (בלי קישור) — נשארת תמיד "נשלחה בקשה ממתינה לאישור"
                                // רק נסיעות עם קישור עוברות ל"נלקח אוטומטית" כשמתקבל success מהסדרן
                                val newAutoState = when {
                                    !ride.hasLink -> RideUiState.AUTO_PENDING // לעולם לא משתנה
                                    update.status == "success" || update.status == "auto_success" -> RideUiState.AUTO_SUCCESS
                                    update.status == "failed" -> RideUiState.FAILED
                                    else -> RideUiState.AUTO_PENDING
                                }
                                return@map ride.copy(
                                    uiState = newAutoState,
                                    dispatcherName = update.dispatcherName,
                                    dispatcherPhone = update.dispatcherPhone,
                                    successMessage = update.message
                                )
                            }
                            val newState = when (update.status) {
                                "sending" -> RideUiState.SENDING
                                "waiting" -> RideUiState.WAITING_DISPATCHER
                                "success" -> RideUiState.SUCCESS
                                "auto_success" -> RideUiState.AUTO_SUCCESS
                                "failed" -> RideUiState.FAILED
                                else -> ride.uiState
                            }
                            ride.copy(
                                uiState = newState,
                                dispatcherName = update.dispatcherName,
                                dispatcherPhone = update.dispatcherPhone,
                                successMessage = update.message
                            )
                        } else ride
                    }
                }
            }
        }
        viewModelScope.launch {
            repo.wsService.etaRequests.collect { req ->
                _etaRequest.value = req
            }
        }
        // בכל התחברות מחדש — שלח מחדש את כל המצב כולל keywords מושהים
        viewModelScope.launch {
            repo.wsService.connected
                .filter { it }
                .collect {
                    val available = repo.isAvailable.first()
                    val kws = repo.keywords.first()
                    val paused = repo.pausedKeywords.first()
                    repo.wsService.setAvailability(available, kws, paused)
                }
        }
    }

    fun setAvailability(available: Boolean) {
        viewModelScope.launch {
            repo.saveAvailable(available)
            val kws = repo.keywords.first()
            val paused = repo.pausedKeywords.first()
            repo.wsService.setAvailability(available, kws, paused)
        }
    }

    /** Toggle GPS location tracking. Called when user taps "פנוי מיקום". */
    fun toggleLocationTracking() {
        if (_locationTrackingActive.value) {
            // Turn off tracking only — don't change availability
            locationTrackingJob?.cancel()
            locationTrackingJob = null
            _locationTrackingActive.value = false
            _locationCity.value = ""
        } else {
            // Turn on
            _locationTrackingActive.value = true
            locationTrackingJob = viewModelScope.launch {
                locationTracker.cityUpdates().collect { loc ->
                    _locationCity.value = loc.city
                    setAvailabilityWithCity(loc.city)
                }
            }
        }
    }

    fun setAvailabilityWithCity(city: String) {
        viewModelScope.launch {
            _locationCity.value = city
            val kws = repo.keywords.first().toMutableList()
            val cityCode = cityToCode(city)
            if (!kws.contains(cityCode)) kws.add(cityCode)
            repo.saveKeywords(kws)
            repo.saveAvailable(true)
            val paused = repo.pausedKeywords.first()
            repo.wsService.setAvailability(true, kws, paused)
        }
    }

    private fun cityToCode(city: String): String {
        return when {
            city.contains("בני ברק") || city.contains("בניברק") -> "בב"
            city.contains("ירושלים") -> "ים"
            city.contains("תל אביב") || city.contains("תלאביב") -> "תא"
            city.contains("פתח תקווה") -> "פת"
            city.contains("בית שמש") -> "שמש"
            city.contains("נתניה") -> "נת"
            city.contains("מודיעין") -> "ספר"
            else -> city
        }
    }

    fun setAutoMode(enabled: Boolean) {
        viewModelScope.launch {
            repo.saveAutoMode(enabled)
            repo.wsService.setAutoMode(enabled)
        }
    }

    fun toggleTts() {
        viewModelScope.launch {
            val next = !ttsEnabled.value
            repo.saveTtsEnabled(next)
            tts.enabled = next
            if (next) tts.ensureStarted() else tts.stop()
        }
    }

    /**
     * Toggle hands-free voice commands. When enabling, the caller (MainActivity)
     * is responsible for prompting for RECORD_AUDIO — this function just
     * persists the intent. When disabling, any in-progress listener will
     * self-cancel the next time the foreground service notices the change.
     */
    fun toggleVoiceControl() {
        viewModelScope.launch {
            val next = !voiceControlEnabled.value
            repo.saveVoiceControlEnabled(next)
        }
    }

    /**
     * Select a km-range filter. Pass 0 to clear (no filter). Also sends the
     * new value to the server via WS so the ride dispatcher picks it up
     * immediately without needing a new set_availability roundtrip.
     */
    fun selectKm(km: Int) {
        viewModelScope.launch {
            val current = selectedKm.value
            // Tap the same chip twice → clear (toggle behavior)
            val next = if (current == km) 0 else km
            repo.saveSelectedKm(next)
            try { repo.wsService.setKmFilter(if (next == 0) null else next) } catch (_: Exception) {}
        }
    }

    /** Add a custom km option. No-op if already present or invalid. */
    fun addKmOption(km: Int) {
        if (km <= 0) return
        viewModelScope.launch {
            val current = kmOptions.value.toMutableList()
            if (!current.contains(km)) {
                current.add(km)
                repo.saveKmOptions(current)
            }
        }
    }

    /** Remove a custom km option. If it was currently selected, clear the selection. */
    fun removeKmOption(km: Int) {
        viewModelScope.launch {
            val current = kmOptions.value.toMutableList()
            if (current.remove(km)) {
                repo.saveKmOptions(current)
                if (selectedKm.value == km) {
                    repo.saveSelectedKm(0)
                    try { repo.wsService.setKmFilter(null) } catch (_: Exception) {}
                }
            }
        }
    }

    /** Toggle the km-filter row visibility (used by the Settings screen). */
    fun setKmFilterVisible(v: Boolean) {
        viewModelScope.launch { repo.saveKmFilterVisible(v) }
    }

    fun addKeyword(keyword: String) {
        viewModelScope.launch {
            val phone = repo.driverPhone.first()
            val current = repo.keywords.first().toMutableList()
            if (!current.contains(keyword)) {
                current.add(keyword)
                repo.saveKeywords(current)
                api.addKeyword(phone, keyword) {}
                if (isAvailable.value) repo.wsService.setAvailability(true, current)
            }
        }
    }

    fun removeKeyword(keyword: String) {
        viewModelScope.launch {
            val phone = repo.driverPhone.first()
            val current = repo.keywords.first().toMutableList()
            current.remove(keyword)
            repo.saveKeywords(current)
            api.removeKeyword(phone, keyword) {}
            repo.wsService.removeKeyword(keyword)
        }
    }

    fun pauseKeyword(keyword: String) {
        viewModelScope.launch {
            val paused = repo.pausedKeywords.first().toMutableList()
            if (!paused.contains(keyword)) paused.add(keyword)
            repo.savePausedKeywords(paused)
            repo.wsService.pauseKeyword(keyword)
        }
    }

    fun resumeKeyword(keyword: String) {
        viewModelScope.launch {
            val paused = repo.pausedKeywords.first().toMutableList()
            paused.remove(keyword)
            repo.savePausedKeywords(paused)
            repo.wsService.resumeKeyword(keyword)
        }
    }

    fun toggleKeyword(keyword: String, isPaused: Boolean) {
        if (isPaused) resumeKeyword(keyword) else pauseKeyword(keyword)
    }

    fun performAction(ride: Ride, action: String) {
        when {
            // כפתורי "ת" — רק הכפתור עצמו משתנה, הכרטיס נשאר
            action == "reply_group" || action == "reply_private" || action == "reply_both" -> {
                val key = "${ride.messageId}_$action"
                repo.wsService.sendRideAction(ride.messageId, action)
                _sentButtons.update { it + key }
                // פתח/צור שיחה בטאב צ'אט עם הסדרן (כשאר reply_private/reply_both)
                if (action != "reply_group") {
                    chatStore.openOrCreateForRide(ride)
                }
            }
            // "💬 צ'אט עם סדרן" (two_links button). The second link is to a BOT
            // (not the dispatcher). Sending its chat code triggers the dispatcher
            // to message the user privately. We DO NOT open any chat locally —
            // instead the server identifies the dispatcher's reply via tokens
            // and pushes an autoOpen chat_message which selects the conversation.
            action == "open_chat" -> {
                val phone = ride.chatPhone
                if (phone.isNotBlank()) {
                    val text = ride.chatText.ifEmpty { "צ" }
                    val rideMeta = mapOf<String, Any>(
                        "origin" to ride.origin,
                        "destination" to ride.destination,
                        "price" to (ride.price.ifEmpty { "" })
                    )
                    repo.wsService.openChatRoute(ride.messageId, phone, text, rideMeta)
                    _sentButtons.update { it + "${ride.messageId}_open_chat" }
                }
            }
            // "קח את הנסיעה" — רק הכפתור משתנה לנשלח ✓, הכרטיס נשאר כמו שהוא
            action.startsWith("take_ride_link:") -> {
                val key = "${ride.messageId}_take_ride_link"
                val parts = action.split(":")
                val linkPhone = if (parts.size > 1) parts[1] else ride.linkPhone
                val linkText = if (parts.size > 2) parts[2] else ride.linkText
                repo.wsService.sendRideAction(ride.messageId, "take_ride_link", linkPhone, linkText)
                _sentButtons.update { it + key }
            }
            action == "on_the_way" -> repo.wsService.sendRideStatus(ride.messageId, "on_the_way")
            action == "cancel_auto" -> {
                repo.wsService.cancelAutoRide(ride.messageId)
                _rides.update { current -> current.filter { it.messageId != ride.messageId } }
            }
            action == "retry" -> {
                _rides.update { current ->
                    current.map { if (it.messageId == ride.messageId) it.copy(uiState = RideUiState.IDLE) else it }
                }
            }
            else -> repo.wsService.sendRideAction(ride.messageId, action)
        }
    }

    fun sendEta(rideId: String, minutes: Int) {
        repo.wsService.sendEtaResponse(rideId, minutes)
        _etaRequest.value = null
    }

    fun dismissEta() {
        _etaRequest.value = null
    }
}
