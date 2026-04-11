package com.wabot.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.wabot.app.data.Repository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ConnectViewModel @Inject constructor(
    private val repo: Repository
) : ViewModel() {

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

                val serverUrl = repo.serverUrl.first()
                repo.wsService.serverUrl = serverUrl

                repo.wsService.connect(phone, phone) // token = phone for simplicity
                onSuccess()
            } catch (e: Exception) {
                _error.value = "שגיאה: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }
}
