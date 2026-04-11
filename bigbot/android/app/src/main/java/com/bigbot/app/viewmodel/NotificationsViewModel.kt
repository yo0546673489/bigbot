package com.bigbot.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bigbot.app.data.Repository
import com.bigbot.app.data.models.AppNotification
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class NotificationsViewModel @Inject constructor(private val repo: Repository) : ViewModel() {

    private val _notifications = MutableStateFlow<List<AppNotification>>(emptyList())
    val notifications: StateFlow<List<AppNotification>> = _notifications

    private val _locationPopup = MutableStateFlow<String?>(null)
    val locationPopup: StateFlow<String?> = _locationPopup

    init {
        viewModelScope.launch {
            repo.wsService.notifications.collect { notif ->
                _notifications.update { current -> (listOf(notif) + current).take(50) }
            }
        }
    }

    fun showLocationPopup(city: String) {
        _locationPopup.value = city
    }

    fun dismissLocationPopup() {
        _locationPopup.value = null
    }

    fun acceptLocationUpdate(city: String) {
        viewModelScope.launch {
            val kws = repo.keywords.first().toMutableList()
            val code = city.take(2)
            if (!kws.contains(code)) kws.add(code)
            repo.saveKeywords(kws)
            repo.saveAvailable(true)
            repo.wsService.setAvailability(true, kws)
            _locationPopup.value = null
        }
    }

    fun dismissNotification(id: String) {
        _notifications.update { current -> current.filter { it.id != id } }
    }

    fun takeRide(notif: AppNotification) {
        repo.wsService.sendRideAction(notif.rideId, "reply_both")
        dismissNotification(notif.id)
    }

    fun cancelAutoRide(notif: AppNotification) {
        repo.wsService.cancelAutoRide(notif.rideId)
        dismissNotification(notif.id)
    }
}
