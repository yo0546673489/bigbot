package com.bigbot.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bigbot.app.data.ApiService
import com.bigbot.app.data.Repository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val repo: Repository,
    private val api: ApiService
) : ViewModel() {

    val driverPhone = repo.driverPhone.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")
    val driverName = repo.driverName.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")
    val waConnected: StateFlow<Boolean> = repo.wsService.waConnected.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    val autoMode = repo.autoMode.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    val autoSend = repo.autoSend.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    val defaultEta = repo.defaultEta.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 5)
    val autoLocation = repo.autoLocation.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    val notifsEnabled = repo.notifsEnabled.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), true)
    val loudSound = repo.loudSound.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), true)
    val vibration = repo.vibration.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), true)
    val customMessage = repo.customMessage.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")
    val vehicleType = repo.vehicleType.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "כולם")
    val vehicleTypes = repo.vehicleTypes.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val silentMode = repo.silentMode.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    val serviceMode = repo.serviceMode.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    val acceptDeliveries = repo.acceptDeliveries.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), true)
    /** Show the km-range filter row on the home screen? User-togglable here. */
    val kmFilterVisible = repo.kmFilterVisible.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    /** Minimum ride price in shekels — 0 = no filter (default). */
    val minPrice = repo.minPrice.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)
    /** Quick reply buttons for the chat screen. */
    val quickReplies = repo.quickReplies.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val etaEnabled = repo.etaEnabled.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), true)

    private val _statusMessage = MutableStateFlow<String?>(null)
    val statusMessage: StateFlow<String?> = _statusMessage

    fun reconnect() {
        viewModelScope.launch {
            val phone = repo.driverPhone.first()
            api.reconnect(phone) { ok ->
                _statusMessage.value = if (ok) "מחובר מחדש בהצלחה" else "שגיאה בחיבור מחדש"
            }
        }
    }

    fun disconnect() {
        viewModelScope.launch {
            val phone = repo.driverPhone.first()
            api.disconnect(phone) {}
            repo.wsService.disconnect()
        }
    }

    fun setAutoMode(v: Boolean) {
        viewModelScope.launch { repo.saveAutoMode(v); repo.wsService.setAutoMode(v) }
    }

    fun setAutoSend(v: Boolean) {
        viewModelScope.launch { repo.saveAutoSend(v) }
    }

    fun setDefaultEta(v: Int) {
        viewModelScope.launch {
            repo.saveDefaultEta(v)
            repo.wsService.setDefaultEta(v)
        }
    }

    fun setAutoLocation(v: Boolean) {
        viewModelScope.launch { repo.saveAutoLocation(v) }
    }

    fun setNotifsEnabled(v: Boolean) {
        viewModelScope.launch { repo.saveNotifsEnabled(v) }
    }

    fun setLoudSound(v: Boolean) {
        viewModelScope.launch { repo.saveLoudSound(v) }
    }

    fun setVibration(v: Boolean) {
        viewModelScope.launch { repo.saveVibration(v) }
    }

    fun saveCustomMessage(msg: String) {
        viewModelScope.launch {
            repo.saveCustomMessage(msg)
            val phone = repo.driverPhone.first()
            api.saveCustomMessage(phone, msg) {}
        }
    }

    fun setVehicleType(type: String) {
        viewModelScope.launch {
            repo.saveVehicleType(type)
            val phone = repo.driverPhone.first()
            api.saveVehicleType(phone, type) {}
        }
    }

    /** Multi-select vehicle types. If "כולם" is in the list, only "כולם" is saved
     * (it overrides everything). Empty list clears the filter. */
    fun setVehicleTypes(types: List<String>) {
        viewModelScope.launch {
            val normalized = if ("כולם" in types) listOf("כולם") else types.distinct()
            repo.saveVehicleTypes(normalized)
            val phone = repo.driverPhone.first()
            api.saveVehicleTypes(phone, normalized) {}
        }
    }

    fun setSilentMode(v: Boolean) {
        viewModelScope.launch { repo.saveSilentMode(v) }
    }

    fun setServiceMode(v: Boolean) {
        viewModelScope.launch { repo.saveServiceMode(v) }
    }

    fun setAcceptDeliveries(v: Boolean) {
        viewModelScope.launch {
            repo.saveAcceptDeliveries(v)
            val phone = repo.driverPhone.first()
            api.saveSettings(phone, v) {}
        }
    }

    fun setKmFilterVisible(v: Boolean) {
        viewModelScope.launch {
            repo.saveKmFilterVisible(v)
            // If the user is hiding the row, also clear any active selection
            // so no rides get silently blocked by a filter they can't see.
            if (!v) {
                repo.saveSelectedKm(0)
                try { repo.wsService.setKmFilter(null) } catch (_: Exception) {}
            }
        }
    }

    fun setEtaEnabled(v: Boolean) {
        viewModelScope.launch { repo.saveEtaEnabled(v) }
    }

    fun addQuickReply(text: String) {
        viewModelScope.launch {
            val current = repo.quickReplies.first().toMutableList()
            val trimmed = text.trim()
            if (trimmed.isNotBlank() && trimmed !in current) {
                current.add(trimmed)
                repo.saveQuickReplies(current)
            }
        }
    }

    fun removeQuickReply(text: String) {
        viewModelScope.launch {
            val current = repo.quickReplies.first().toMutableList()
            current.remove(text)
            repo.saveQuickReplies(current)
        }
    }

    fun editQuickReply(old: String, new: String) {
        viewModelScope.launch {
            val current = repo.quickReplies.first().toMutableList()
            val idx = current.indexOf(old)
            if (idx >= 0 && new.trim().isNotBlank()) {
                current[idx] = new.trim()
                repo.saveQuickReplies(current)
            }
        }
    }

    /** Persist the min-price filter and push it to the server. 0 = disabled. */
    fun setMinPrice(v: Int) {
        val clamped = if (v < 0) 0 else v
        viewModelScope.launch {
            repo.saveMinPrice(clamped)
            try { repo.wsService.setMinPrice(if (clamped == 0) null else clamped) } catch (_: Exception) {}
        }
    }

    fun clearStatus() { _statusMessage.value = null }
}
