package com.bigbot.app.data

import android.content.Context
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore by preferencesDataStore(name = "bigbot_prefs")

@Singleton
class Repository @Inject constructor(
    @ApplicationContext private val context: Context,
    val wsService: WebSocketService
) {
    companion object {
        val KEY_DRIVER_PHONE = stringPreferencesKey("driver_phone")
        val KEY_DRIVER_NAME = stringPreferencesKey("driver_name")
        val KEY_SERVER_URL = stringPreferencesKey("server_url")
        val KEY_AVAILABLE = booleanPreferencesKey("is_available")
        val KEY_KEYWORDS = stringPreferencesKey("keywords")
        val KEY_PAUSED_KEYWORDS = stringPreferencesKey("paused_keywords")
        val KEY_AUTO_MODE = booleanPreferencesKey("auto_mode")
        val KEY_AUTO_SEND = booleanPreferencesKey("auto_send")
        val KEY_DEFAULT_ETA = intPreferencesKey("default_eta")
        val KEY_AUTO_LOCATION = booleanPreferencesKey("auto_location")
        val KEY_NOTIFS_ENABLED = booleanPreferencesKey("notifs_enabled")
        val KEY_LOUD_SOUND = booleanPreferencesKey("loud_sound")
        val KEY_VIBRATION = booleanPreferencesKey("vibration")
        val KEY_CUSTOM_MESSAGE = stringPreferencesKey("custom_message")
        val KEY_VEHICLE_TYPE = stringPreferencesKey("vehicle_type")
        val KEY_SILENT_MODE = booleanPreferencesKey("silent_mode")
        val KEY_SERVICE_MODE = booleanPreferencesKey("service_mode")
        val KEY_CHAT_CONVERSATIONS = stringPreferencesKey("chat_conversations_json")
        val KEY_CHAT_MESSAGES = stringPreferencesKey("chat_messages_json")
        val KEY_RIDES = stringPreferencesKey("rides_json")
        val KEY_SENT_BUTTONS = stringPreferencesKey("sent_buttons_json")
        val KEY_TTS_ENABLED = booleanPreferencesKey("tts_enabled")
        val KEY_REGISTERED = booleanPreferencesKey("registered")
        val KEY_DOB = stringPreferencesKey("dob")
        val KEY_VEHICLE = stringPreferencesKey("vehicle")
        val KEY_ACCEPT_DELIVERIES = booleanPreferencesKey("accept_deliveries")
        val KEY_VOICE_CONTROL_ENABLED = booleanPreferencesKey("voice_control_enabled")
        val KEY_KM_OPTIONS = stringPreferencesKey("km_options")
        val KEY_KM_SELECTED = intPreferencesKey("km_selected")
        val KEY_KM_FILTER_VISIBLE = booleanPreferencesKey("km_filter_visible")
        val KEY_ETA_ENABLED = booleanPreferencesKey("eta_enabled")
        val KEY_MIN_PRICE = intPreferencesKey("min_price")
        val KEY_QUICK_REPLIES = stringPreferencesKey("quick_replies")
    }

    val chatConversationsJson: Flow<String> = context.dataStore.data.map { it[KEY_CHAT_CONVERSATIONS] ?: "" }
    val chatMessagesJson: Flow<String> = context.dataStore.data.map { it[KEY_CHAT_MESSAGES] ?: "" }
    val ridesJson: Flow<String> = context.dataStore.data.map { it[KEY_RIDES] ?: "" }
    val sentButtonsJson: Flow<String> = context.dataStore.data.map { it[KEY_SENT_BUTTONS] ?: "" }

    suspend fun saveChatConversations(json: String) = context.dataStore.edit { it[KEY_CHAT_CONVERSATIONS] = json }
    suspend fun saveChatMessages(json: String) = context.dataStore.edit { it[KEY_CHAT_MESSAGES] = json }
    suspend fun saveRides(json: String) = context.dataStore.edit { it[KEY_RIDES] = json }
    suspend fun saveSentButtons(json: String) = context.dataStore.edit { it[KEY_SENT_BUTTONS] = json }

    val driverPhone: Flow<String> = context.dataStore.data.map { it[KEY_DRIVER_PHONE] ?: "" }
    val driverName: Flow<String> = context.dataStore.data.map { it[KEY_DRIVER_NAME] ?: "" }
    // Production: WSS via Hostinger DNS + Let's Encrypt SSL.
    val serverUrl: Flow<String> = context.dataStore.data.map { it[KEY_SERVER_URL] ?: "wss://api.bigbotdrivers.com/drivers" }
    val isAvailable: Flow<Boolean> = context.dataStore.data.map { it[KEY_AVAILABLE] ?: false }
    val keywords: Flow<List<String>> = context.dataStore.data.map {
        val raw = it[KEY_KEYWORDS] ?: ""; if (raw.isEmpty()) emptyList() else raw.split(",").map { s -> s.trim() }
    }
    val pausedKeywords: Flow<List<String>> = context.dataStore.data.map {
        val raw = it[KEY_PAUSED_KEYWORDS] ?: ""; if (raw.isEmpty()) emptyList() else raw.split(",").map { s -> s.trim() }
    }
    val autoMode: Flow<Boolean> = context.dataStore.data.map { it[KEY_AUTO_MODE] ?: false }
    val autoSend: Flow<Boolean> = context.dataStore.data.map { it[KEY_AUTO_SEND] ?: false }
    val defaultEta: Flow<Int> = context.dataStore.data.map { it[KEY_DEFAULT_ETA] ?: 5 }
    val autoLocation: Flow<Boolean> = context.dataStore.data.map { it[KEY_AUTO_LOCATION] ?: false }
    val notifsEnabled: Flow<Boolean> = context.dataStore.data.map { it[KEY_NOTIFS_ENABLED] ?: true }
    val loudSound: Flow<Boolean> = context.dataStore.data.map { it[KEY_LOUD_SOUND] ?: true }
    val vibration: Flow<Boolean> = context.dataStore.data.map { it[KEY_VIBRATION] ?: true }
    val customMessage: Flow<String> = context.dataStore.data.map { it[KEY_CUSTOM_MESSAGE] ?: "" }
    val vehicleType: Flow<String> = context.dataStore.data.map { it[KEY_VEHICLE_TYPE] ?: "כולם" }
    /** Multi-select vehicle types — comma-joined list of Hebrew labels.
     * Empty list = "כולם" (default, accept all). */
    val vehicleTypes: Flow<List<String>> = context.dataStore.data.map {
        val raw = it[KEY_VEHICLE_TYPE] ?: ""
        if (raw.isBlank()) emptyList() else raw.split(",").map { s -> s.trim() }.filter { s -> s.isNotEmpty() }
    }
    val silentMode: Flow<Boolean> = context.dataStore.data.map { it[KEY_SILENT_MODE] ?: false }
    val serviceMode: Flow<Boolean> = context.dataStore.data.map { it[KEY_SERVICE_MODE] ?: false }
    /** TTS narration of new rides. Default OFF — user opts in. */
    val ttsEnabled: Flow<Boolean> = context.dataStore.data.map { it[KEY_TTS_ENABLED] ?: false }
    /** True after the user completed onboarding (name + dob + vehicle + phone). */
    val registered: Flow<Boolean> = context.dataStore.data.map { it[KEY_REGISTERED] ?: false }
    val dob: Flow<String> = context.dataStore.data.map { it[KEY_DOB] ?: "" }
    val vehicle: Flow<String> = context.dataStore.data.map { it[KEY_VEHICLE] ?: "" }
    val acceptDeliveries: Flow<Boolean> = context.dataStore.data.map { it[KEY_ACCEPT_DELIVERIES] ?: true }
    val voiceControlEnabled: Flow<Boolean> = context.dataStore.data.map { it[KEY_VOICE_CONTROL_ENABLED] ?: false }
    val kmOptions: Flow<List<Int>> = context.dataStore.data.map {
        val raw = it[KEY_KM_OPTIONS] ?: ""; if (raw.isEmpty()) listOf(5, 10, 20) else raw.split(",").mapNotNull { s -> s.trim().toIntOrNull() }
    }
    val selectedKm: Flow<Int> = context.dataStore.data.map { it[KEY_KM_SELECTED] ?: 0 }
    val kmFilterVisible: Flow<Boolean> = context.dataStore.data.map { it[KEY_KM_FILTER_VISIBLE] ?: false }
    val etaEnabled: Flow<Boolean> = context.dataStore.data.map { it[KEY_ETA_ENABLED] ?: true }
    val minPrice: Flow<Int> = context.dataStore.data.map { it[KEY_MIN_PRICE] ?: 0 }
    val quickReplies: Flow<String> = context.dataStore.data.map { it[KEY_QUICK_REPLIES] ?: "אני בדרך|||כמה דקות אני שם|||תודה" }

    suspend fun saveDriverPhone(v: String) = context.dataStore.edit { it[KEY_DRIVER_PHONE] = v }
    suspend fun saveDriverName(v: String) = context.dataStore.edit { it[KEY_DRIVER_NAME] = v }
    suspend fun saveServerUrl(v: String) = context.dataStore.edit { it[KEY_SERVER_URL] = v }
    suspend fun saveAvailable(v: Boolean) = context.dataStore.edit { it[KEY_AVAILABLE] = v }
    suspend fun saveKeywords(kws: List<String>) = context.dataStore.edit { it[KEY_KEYWORDS] = kws.joinToString(",") }
    suspend fun savePausedKeywords(kws: List<String>) = context.dataStore.edit { it[KEY_PAUSED_KEYWORDS] = kws.joinToString(",") }
    suspend fun saveAutoMode(v: Boolean) = context.dataStore.edit { it[KEY_AUTO_MODE] = v }
    suspend fun saveAutoSend(v: Boolean) = context.dataStore.edit { it[KEY_AUTO_SEND] = v }
    suspend fun saveDefaultEta(v: Int) = context.dataStore.edit { it[KEY_DEFAULT_ETA] = v }
    suspend fun saveAutoLocation(v: Boolean) = context.dataStore.edit { it[KEY_AUTO_LOCATION] = v }
    suspend fun saveNotifsEnabled(v: Boolean) = context.dataStore.edit { it[KEY_NOTIFS_ENABLED] = v }
    suspend fun saveLoudSound(v: Boolean) = context.dataStore.edit { it[KEY_LOUD_SOUND] = v }
    suspend fun saveVibration(v: Boolean) = context.dataStore.edit { it[KEY_VIBRATION] = v }
    suspend fun saveCustomMessage(v: String) = context.dataStore.edit { it[KEY_CUSTOM_MESSAGE] = v }
    suspend fun saveVehicleType(v: String) = context.dataStore.edit { it[KEY_VEHICLE_TYPE] = v }
    suspend fun saveVehicleTypes(types: List<String>) =
        context.dataStore.edit { it[KEY_VEHICLE_TYPE] = types.joinToString(",") }
    suspend fun saveSilentMode(v: Boolean) = context.dataStore.edit { it[KEY_SILENT_MODE] = v }
    suspend fun saveServiceMode(v: Boolean) = context.dataStore.edit { it[KEY_SERVICE_MODE] = v }
    suspend fun saveTtsEnabled(v: Boolean) = context.dataStore.edit { it[KEY_TTS_ENABLED] = v }
    suspend fun saveRegistered(v: Boolean) = context.dataStore.edit { it[KEY_REGISTERED] = v }
    suspend fun saveDob(v: String) = context.dataStore.edit { it[KEY_DOB] = v }
    suspend fun saveVehicle(v: String) = context.dataStore.edit { it[KEY_VEHICLE] = v }
    suspend fun saveAcceptDeliveries(v: Boolean) = context.dataStore.edit { it[KEY_ACCEPT_DELIVERIES] = v }
    suspend fun saveVoiceControlEnabled(v: Boolean) = context.dataStore.edit { it[KEY_VOICE_CONTROL_ENABLED] = v }
    suspend fun saveKmOptions(options: List<Int>) = context.dataStore.edit { it[KEY_KM_OPTIONS] = options.joinToString(",") }
    suspend fun saveSelectedKm(v: Int) = context.dataStore.edit { it[KEY_KM_SELECTED] = v }
    suspend fun saveKmFilterVisible(v: Boolean) = context.dataStore.edit { it[KEY_KM_FILTER_VISIBLE] = v }
    suspend fun saveEtaEnabled(v: Boolean) = context.dataStore.edit { it[KEY_ETA_ENABLED] = v }
    suspend fun saveMinPrice(v: Int) = context.dataStore.edit { it[KEY_MIN_PRICE] = v }
    suspend fun saveQuickReplies(v: String) = context.dataStore.edit { it[KEY_QUICK_REPLIES] = v }
}
