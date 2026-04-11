package com.wabot.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.wabot.app.BuildConfig
import com.wabot.app.data.Repository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val repo: Repository,
    private val gson: Gson
) : ViewModel() {

    val driverPhone: StateFlow<String> = repo.driverPhone.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), ""
    )
    val serverUrl: StateFlow<String> = repo.serverUrl.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), "ws://10.0.2.2:7879"
    )
    val etaMinutes: StateFlow<String> = repo.etaMinutes.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), "5"
    )
    val autoMode: StateFlow<Boolean> = repo.autoMode.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), false
    )
    val waConnected: StateFlow<Boolean> = repo.wsService.waConnected.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), false
    )
    val autoSendToDispatcher: StateFlow<Boolean> = repo.autoSendToDispatcher.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), false
    )
    val autoLocationEnabled: StateFlow<Boolean> = repo.autoLocationEnabled.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), false
    )
    val notificationsEnabled: StateFlow<Boolean> = repo.notificationsEnabled.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), true
    )
    val vibrationEnabled: StateFlow<Boolean> = repo.vibrationEnabled.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), true
    )
    val loudSoundEnabled: StateFlow<Boolean> = repo.loudSoundEnabled.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), false
    )
    val silentMode: StateFlow<Boolean> = repo.silentMode.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), false
    )
    val customPrivateMessage: StateFlow<String> = repo.customPrivateMessage.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), ""
    )
    val vehicleType: StateFlow<String> = repo.vehicleType.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), "כולם"
    )
    val keywords: StateFlow<List<String>> = repo.keywords.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList()
    )

    fun saveServerUrl(url: String) = viewModelScope.launch { repo.saveServerUrl(url) }
    fun saveEta(eta: String) = viewModelScope.launch { repo.saveEtaMinutes(eta) }
    fun saveAutoMode(auto: Boolean) = viewModelScope.launch { repo.saveAutoMode(auto) }
    fun saveAutoSendToDispatcher(v: Boolean) = viewModelScope.launch { repo.saveAutoSendToDispatcher(v) }
    fun saveAutoLocation(v: Boolean) = viewModelScope.launch { repo.saveAutoLocationEnabled(v) }
    fun saveNotificationsEnabled(v: Boolean) = viewModelScope.launch { repo.saveNotificationsEnabled(v) }
    fun saveVibration(v: Boolean) = viewModelScope.launch { repo.saveVibrationEnabled(v) }
    fun saveLoudSound(v: Boolean) = viewModelScope.launch { repo.saveLoudSoundEnabled(v) }
    fun saveSilentMode(v: Boolean) = viewModelScope.launch { repo.saveSilentMode(v) }
    fun saveCustomPrivateMessage(msg: String) = viewModelScope.launch { repo.saveCustomPrivateMessage(msg) }
    fun saveVehicleType(type: String) = viewModelScope.launch { repo.saveVehicleType(type) }

    fun addKeyword(kw: String) {
        viewModelScope.launch {
            val current = repo.keywords.first().toMutableList()
            if (!current.contains(kw)) { current.add(kw); repo.saveKeywords(current) }
        }
    }

    fun removeKeyword(kw: String) {
        viewModelScope.launch {
            val current = repo.keywords.first().toMutableList()
            current.remove(kw); repo.saveKeywords(current)
        }
    }

    fun reconnect() {
        viewModelScope.launch {
            val phone = repo.driverPhone.first()
            val url = repo.serverUrl.first()
            repo.wsService.serverUrl = url
            repo.wsService.connect(phone, phone)
        }
    }

    fun pairPhone(phone: String, onResult: (String) -> Unit) {
        viewModelScope.launch {
            try {
                val httpUrl = BuildConfig.HTTP_URL
                val client = OkHttpClient()
                val body = gson.toJson(mapOf("phone" to phone))
                val req = Request.Builder()
                    .url("$httpUrl/api/wa/pair")
                    .post(body.toRequestBody("application/json".toMediaType()))
                    .build()
                val response = client.newCall(req).execute()
                val respBody = response.body?.string() ?: ""
                val json = gson.fromJson(respBody, Map::class.java)
                val code = json["code"] as? String ?: ""
                onResult(code)
            } catch (e: Exception) {
                onResult("שגיאה: ${e.message}")
            }
        }
    }
}
