package com.bigbot.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bigbot.app.data.ApiService
import com.bigbot.app.data.Repository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Drives the onboarding wizard:
 *   1. Name
 *   2. Date of birth
 *   3. Vehicle type
 *   4. Phone + WhatsApp pairing (linked devices)
 *
 * Once finished, persists everything locally and tells the server to create
 * the driver record so messages start flowing automatically.
 */
@HiltViewModel
class OnboardingViewModel @Inject constructor(
    private val repo: Repository,
    private val api: ApiService
) : ViewModel() {

    private val _step = MutableStateFlow(OnboardingStep.NAME)
    val step: StateFlow<OnboardingStep> = _step

    private val _name = MutableStateFlow("")
    val name: StateFlow<String> = _name

    private val _dob = MutableStateFlow("")
    val dob: StateFlow<String> = _dob

    private val _vehicle = MutableStateFlow("")
    val vehicle: StateFlow<String> = _vehicle

    private val _phone = MutableStateFlow("")
    val phone: StateFlow<String> = _phone

    private val _isWorking = MutableStateFlow(false)
    val isWorking: StateFlow<Boolean> = _isWorking

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    fun setName(v: String) { _name.value = v }
    fun setDob(v: String) { _dob.value = v }
    fun setVehicle(v: String) { _vehicle.value = v }
    fun setPhone(v: String) { _phone.value = v.filter { it.isDigit() } }

    fun next() {
        _error.value = null
        _step.value = when (_step.value) {
            OnboardingStep.NAME -> {
                if (_name.value.trim().length < 2) { _error.value = "הכנס שם תקין"; return }
                OnboardingStep.DOB
            }
            OnboardingStep.DOB -> {
                if (_dob.value.trim().length < 4) { _error.value = "הכנס תאריך לידה"; return }
                OnboardingStep.VEHICLE
            }
            OnboardingStep.VEHICLE -> {
                if (_vehicle.value.isBlank()) { _error.value = "בחר סוג רכב"; return }
                OnboardingStep.PHONE
            }
            OnboardingStep.PHONE -> {
                if (_phone.value.length < 9) { _error.value = "הכנס מספר טלפון תקין"; return }
                // Register on server then enter the app. WhatsApp pairing
                // happens later from inside the app (Search tab) — exactly
                // like the existing flow.
                registerAndFinish()
                return
            }
            OnboardingStep.DONE -> OnboardingStep.DONE
        }
    }

    fun back() {
        _error.value = null
        _step.value = when (_step.value) {
            OnboardingStep.DOB -> OnboardingStep.NAME
            OnboardingStep.VEHICLE -> OnboardingStep.DOB
            OnboardingStep.PHONE -> OnboardingStep.VEHICLE
            else -> _step.value
        }
    }

    private fun registerAndFinish() {
        viewModelScope.launch {
            _isWorking.value = true
            _error.value = null
            try {
                // Normalize phone — strip leading 0, ensure 972 prefix
                val raw = _phone.value
                val withoutLeading = raw.trimStart('0')
                val intlPhone = if (withoutLeading.startsWith("972")) withoutLeading else "972$withoutLeading"

                // Persist locally first so the rest of the app can use it
                repo.saveDriverPhone(intlPhone)
                repo.saveDriverName(_name.value.trim())
                repo.saveDob(_dob.value.trim())
                repo.saveVehicle(_vehicle.value.trim())

                // Tell the server to create the driver record so the next
                // group message that mentions a matching keyword will be
                // routed to this user immediately.
                val ok = registerOnServer(intlPhone, _name.value.trim(), _dob.value.trim(), _vehicle.value.trim())
                if (!ok) {
                    _error.value = "שגיאה ברישום בשרת — נסה שוב"
                    _isWorking.value = false
                    return@launch
                }

                // Connect WS so wa_status starts flowing immediately
                val url = repo.serverUrl.first()
                repo.wsService.serverUrl = url
                repo.wsService.connect(intlPhone, _name.value.trim())

                // Mark registration done — MainActivity will swap to BigBotApp
                repo.saveRegistered(true)
                _step.value = OnboardingStep.DONE
            } catch (e: Exception) {
                _error.value = e.message ?: "שגיאה לא צפויה"
            } finally {
                _isWorking.value = false
            }
        }
    }

    private suspend fun registerOnServer(phone: String, name: String, dob: String, vehicle: String): Boolean {
        return kotlinx.coroutines.suspendCancellableCoroutine { cont ->
            api.registerDriver(phone, name, dob, vehicle) { ok, _ ->
                if (cont.isActive) cont.resumeWith(Result.success(ok))
            }
        }
    }
}

enum class OnboardingStep {
    NAME, DOB, VEHICLE, PHONE, DONE
}
