package com.bigbot.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bigbot.app.data.ApiService
import com.bigbot.app.data.Repository
import com.google.gson.Gson
import com.google.gson.JsonObject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val repo: Repository,
    private val api: ApiService,
    private val gson: Gson
) : ViewModel() {

    val driverPhone = repo.driverPhone.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")
    val keywords = repo.keywords.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val pausedKeywords = repo.pausedKeywords.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val waConnected = repo.wsService.waConnected.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    private val _pairCode = MutableStateFlow<String?>(null)
    val pairCode: StateFlow<String?> = _pairCode

    private val _pairStatus = MutableStateFlow("") // "", "loading", "waiting", "connected", "error"
    val pairStatus: StateFlow<String> = _pairStatus

    private val _statusMessage = MutableStateFlow<String?>(null)
    val statusMessage: StateFlow<String?> = _statusMessage

    init {
        viewModelScope.launch {
            repo.wsService.waConnected.collect { connected ->
                if (connected && _pairStatus.value == "waiting") {
                    _pairStatus.value = "connected"
                }
            }
        }
    }

    fun requestPairCode(phoneInput: String) {
        val phone = phoneInput.replace("-", "").replace(" ", "")
            .let { if (it.startsWith("0")) "972${it.substring(1)}" else it }
        _pairStatus.value = "loading"
        _pairCode.value = null
        _statusMessage.value = null
        api.pairPhone(phone) { ok, body ->
            if (!ok) {
                _pairStatus.value = "error"
                _statusMessage.value = "שגיאת רשת — נסה שוב"
                return@pairPhone
            }
            try {
                val obj = gson.fromJson(body, JsonObject::class.java)
                val success = obj.get("success")?.asBoolean ?: true
                val code = obj.get("code")?.asString
                if (!success || code.isNullOrBlank()) {
                    val msg = obj.get("message")?.asString.orEmpty()
                    _pairStatus.value = "error"
                    _statusMessage.value = when {
                        msg.contains("already", ignoreCase = true) ||
                            msg.contains("connected", ignoreCase = true) ||
                            msg.contains("400") -> "המספר כבר מחובר. נתק קודם דרך הוואטסאפ ונסה שוב."
                        msg.isNotBlank() -> "שגיאה: $msg"
                        else -> "שגיאה — נסה שוב"
                    }
                    return@pairPhone
                }
                _pairCode.value = code
                _pairStatus.value = "waiting"
                // Persist the new driver phone and reconnect the WS so wa_status
                // updates for THIS phone reach the app. Otherwise the WS stays
                // bound to the old phone and the app shows "מנותק" forever.
                viewModelScope.launch {
                    repo.saveDriverPhone(phone)
                    repo.saveDriverName(phone)
                    val url = repo.serverUrl.first()
                    repo.wsService.serverUrl = url
                    repo.wsService.connect(phone, phone)
                }
            } catch (e: Exception) {
                _pairStatus.value = "error"
                _statusMessage.value = "שגיאה לא צפויה — נסה שוב"
            }
        }
    }

    fun addKeyword(keyword: String) {
        viewModelScope.launch {
            val phone = repo.driverPhone.first()
            val current = repo.keywords.first().toMutableList()
            if (!current.contains(keyword)) {
                current.add(keyword)
                repo.saveKeywords(current)
                api.addKeyword(phone, keyword) {}
                repo.wsService.addKeyword(keyword)
                _statusMessage.value = "מסלול נוסף: $keyword"
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
            if (paused.contains(keyword)) {
                paused.remove(keyword)
            } else {
                paused.add(keyword)
            }
            repo.savePausedKeywords(paused)
            repo.wsService.pauseKeyword(keyword)
        }
    }

    fun clearStatus() { _statusMessage.value = null }
}
