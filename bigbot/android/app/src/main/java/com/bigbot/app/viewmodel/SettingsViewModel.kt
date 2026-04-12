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
    val minPrice = repo.minPrice.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)
    val kmFilterVisible = repo.kmFilterVisible.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

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

    fun setKmFilterVisible(v: Boolean) {
        viewModelScope.launch {
            repo.saveKmFilterVisible(v)
            if (!v) {
                repo.saveSelectedKm(0)
                try { repo.wsService.setKmFilter(null) } catch (_: Exception) {}
            }
        }
    }

    fun setMinPrice(v: Int) {
        viewModelScope.launch {
            repo.saveMinPrice(v)
            repo.wsService.setMinPrice(if (v > 0) v else null)
        }
    }

    fun setAcceptDeliveries(v: Boolean) {
        viewModelScope.launch {
            repo.saveAcceptDeliveries(v)
            val phone = repo.driverPhone.first()
            api.saveSettings(phone, v) {}
        }
    }

    fun clearStatus() { _statusMessage.value = null }

    fun createPairingCode(onResult: (Boolean, String) -> Unit) {
        viewModelScope.launch {
            val phone = repo.driverPhone.first()
            api.createPairingCode(phone) { ok, code -> onResult(ok, code) }
        }
    }
}
