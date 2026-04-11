package com.wabot.app.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore by preferencesDataStore(name = "wabot_prefs")

@Singleton
class Repository @Inject constructor(
    @ApplicationContext private val context: Context,
    val wsService: WebSocketService
) {
    companion object {
        val KEY_DRIVER_PHONE          = stringPreferencesKey("driver_phone")
        val KEY_DRIVER_NAME           = stringPreferencesKey("driver_name")
        val KEY_SERVER_URL            = stringPreferencesKey("server_url")
        val KEY_AVAILABLE             = booleanPreferencesKey("is_available")
        val KEY_KEYWORDS              = stringPreferencesKey("keywords")
        val KEY_ETA_MINUTES           = stringPreferencesKey("eta_minutes")
        val KEY_AUTO_MODE             = booleanPreferencesKey("auto_mode")
        val KEY_AUTO_SEND_DISPATCHER  = booleanPreferencesKey("auto_send_dispatcher")
        val KEY_AUTO_LOCATION         = booleanPreferencesKey("auto_location")
        val KEY_NOTIFICATIONS_ENABLED = booleanPreferencesKey("notifications_enabled")
        val KEY_VIBRATION_ENABLED     = booleanPreferencesKey("vibration_enabled")
        val KEY_LOUD_SOUND_ENABLED    = booleanPreferencesKey("loud_sound_enabled")
        val KEY_SILENT_MODE           = booleanPreferencesKey("silent_mode")
        val KEY_CUSTOM_PRIVATE_MSG    = stringPreferencesKey("custom_private_message")
        val KEY_VEHICLE_TYPE          = stringPreferencesKey("vehicle_type")
    }

    val driverPhone: Flow<String>  = context.dataStore.data.map { it[KEY_DRIVER_PHONE] ?: "" }
    val driverName: Flow<String>   = context.dataStore.data.map { it[KEY_DRIVER_NAME] ?: "" }
    val serverUrl: Flow<String>    = context.dataStore.data.map { it[KEY_SERVER_URL] ?: "ws://10.0.2.2:7879/ws" }
    val isAvailable: Flow<Boolean> = context.dataStore.data.map { it[KEY_AVAILABLE] ?: false }
    val keywords: Flow<List<String>> = context.dataStore.data.map {
        val raw = it[KEY_KEYWORDS] ?: ""
        if (raw.isEmpty()) emptyList() else raw.split(",").map { s -> s.trim() }
    }
    val etaMinutes: Flow<String>          = context.dataStore.data.map { it[KEY_ETA_MINUTES] ?: "5" }
    val autoMode: Flow<Boolean>           = context.dataStore.data.map { it[KEY_AUTO_MODE] ?: false }
    val autoSendToDispatcher: Flow<Boolean> = context.dataStore.data.map { it[KEY_AUTO_SEND_DISPATCHER] ?: false }
    val autoLocationEnabled: Flow<Boolean>  = context.dataStore.data.map { it[KEY_AUTO_LOCATION] ?: false }
    val notificationsEnabled: Flow<Boolean> = context.dataStore.data.map { it[KEY_NOTIFICATIONS_ENABLED] ?: true }
    val vibrationEnabled: Flow<Boolean>     = context.dataStore.data.map { it[KEY_VIBRATION_ENABLED] ?: true }
    val loudSoundEnabled: Flow<Boolean>     = context.dataStore.data.map { it[KEY_LOUD_SOUND_ENABLED] ?: false }
    val silentMode: Flow<Boolean>           = context.dataStore.data.map { it[KEY_SILENT_MODE] ?: false }
    val customPrivateMessage: Flow<String>  = context.dataStore.data.map { it[KEY_CUSTOM_PRIVATE_MSG] ?: "" }
    val vehicleType: Flow<String>           = context.dataStore.data.map { it[KEY_VEHICLE_TYPE] ?: "כולם" }

    suspend fun saveDriverPhone(phone: String) { context.dataStore.edit { it[KEY_DRIVER_PHONE] = phone } }
    suspend fun saveDriverName(name: String)   { context.dataStore.edit { it[KEY_DRIVER_NAME] = name } }
    suspend fun saveServerUrl(url: String)     { context.dataStore.edit { it[KEY_SERVER_URL] = url } }
    suspend fun saveAvailable(available: Boolean) { context.dataStore.edit { it[KEY_AVAILABLE] = available } }
    suspend fun saveKeywords(kws: List<String>)   { context.dataStore.edit { it[KEY_KEYWORDS] = kws.joinToString(",") } }
    suspend fun saveEtaMinutes(eta: String)    { context.dataStore.edit { it[KEY_ETA_MINUTES] = eta } }
    suspend fun saveAutoMode(auto: Boolean)    { context.dataStore.edit { it[KEY_AUTO_MODE] = auto } }
    suspend fun saveAutoSendToDispatcher(v: Boolean) { context.dataStore.edit { it[KEY_AUTO_SEND_DISPATCHER] = v } }
    suspend fun saveAutoLocationEnabled(v: Boolean)  { context.dataStore.edit { it[KEY_AUTO_LOCATION] = v } }
    suspend fun saveNotificationsEnabled(v: Boolean) { context.dataStore.edit { it[KEY_NOTIFICATIONS_ENABLED] = v } }
    suspend fun saveVibrationEnabled(v: Boolean)     { context.dataStore.edit { it[KEY_VIBRATION_ENABLED] = v } }
    suspend fun saveLoudSoundEnabled(v: Boolean)     { context.dataStore.edit { it[KEY_LOUD_SOUND_ENABLED] = v } }
    suspend fun saveSilentMode(v: Boolean)           { context.dataStore.edit { it[KEY_SILENT_MODE] = v } }
    suspend fun saveCustomPrivateMessage(msg: String){ context.dataStore.edit { it[KEY_CUSTOM_PRIVATE_MSG] = msg } }
    suspend fun saveVehicleType(type: String)        { context.dataStore.edit { it[KEY_VEHICLE_TYPE] = type } }
}
