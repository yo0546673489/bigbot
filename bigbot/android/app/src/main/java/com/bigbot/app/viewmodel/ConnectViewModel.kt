package com.bigbot.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bigbot.app.data.Repository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ConnectViewModel @Inject constructor(private val repo: Repository) : ViewModel() {
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    fun connect(phone: String, name: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                repo.saveDriverPhone(phone)
                repo.saveDriverName(name)
                val url = repo.serverUrl.first()
                repo.wsService.serverUrl = url
                repo.wsService.connect(phone, phone)
                onSuccess()
            } catch (e: Exception) {
                _error.value = "שגיאה: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }
}
