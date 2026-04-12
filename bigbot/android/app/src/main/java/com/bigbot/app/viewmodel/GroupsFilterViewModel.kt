package com.bigbot.app.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bigbot.app.data.ApiService
import com.bigbot.app.data.Repository
import com.google.gson.Gson
import com.google.gson.JsonParser
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import javax.inject.Inject

@HiltViewModel
class GroupsFilterViewModel @Inject constructor(
    private val repo: Repository,
    private val api: ApiService,
    private val gson: Gson
) : ViewModel() {

    data class GroupItem(
        val groupId: String,
        val name: String,
        val memberCount: Int,
        val isBlacklisted: Boolean
    )

    data class UiState(
        val isLoading: Boolean = true,
        val groups: List<GroupItem> = emptyList(),
        val searchQuery: String = "",
        val error: String? = null
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private val _blacklistedIds = MutableStateFlow<Set<String>>(emptySet())

    private var patchJob: Job? = null

    val filteredGroups: StateFlow<List<GroupItem>> = combine(
        _uiState.map { it.groups },
        _uiState.map { it.searchQuery }
    ) { groups, query ->
        if (query.isBlank()) groups
        else groups.filter { it.name.contains(query, ignoreCase = true) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val totalCount: StateFlow<Int> = _uiState.map { it.groups.size }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val blacklistedCount: StateFlow<Int> = _uiState.map { state ->
        state.groups.count { it.isBlacklisted }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    init {
        loadGroups()
    }

    fun loadGroups() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            // Step 1: Load cached blacklist instantly
            val cachedBlacklist = repo.blacklistedGroups.first()
            _blacklistedIds.value = cachedBlacklist

            val phone = repo.driverPhone.first()
            if (phone.isBlank()) {
                _uiState.update { it.copy(isLoading = false, error = "לא מחובר") }
                return@launch
            }

            // Step 2: Fetch blacklist from server
            fetchBlacklist(phone)

            // Step 3: Fetch groups from server
            fetchGroups(phone)
        }
    }

    private suspend fun fetchBlacklist(phone: String) {
        val result = CompletableDeferred<Unit>()
        api.getBlacklist(phone) { ok, body ->
            if (ok && body.isNotEmpty()) {
                try {
                    val obj = JsonParser.parseString(body).asJsonObject
                    val arr = obj.getAsJsonArray("blacklistedGroupIds")
                    val ids = mutableSetOf<String>()
                    arr?.forEach { ids.add(it.asString) }
                    _blacklistedIds.value = ids
                    viewModelScope.launch { repo.saveBlacklistedGroups(ids) }
                } catch (e: Exception) {
                    Log.e("GroupsFilterVM", "Parse blacklist error: ${e.message}")
                }
            }
            result.complete(Unit)
        }
        result.await()
    }

    private suspend fun fetchGroups(phone: String) {
        val result = CompletableDeferred<Unit>()
        api.getGroups(phone) { ok, body ->
            if (ok && body.isNotEmpty()) {
                try {
                    val obj = JsonParser.parseString(body).asJsonObject
                    if (obj.has("error")) {
                        val error = obj.get("error").asString
                        val msg = if (error == "waiting_for_whatsapp_connection")
                            "ממתין לחיבור WhatsApp...\nנסה שוב בעוד רגע"
                        else error
                        _uiState.update { it.copy(isLoading = false, error = msg) }
                    } else {
                        val arr = obj.getAsJsonArray("groups")
                        val blacklisted = _blacklistedIds.value
                        val groups = mutableListOf<GroupItem>()
                        arr?.forEach { el ->
                            val g = el.asJsonObject
                            val gId = g.get("groupId")?.asString ?: return@forEach
                            groups.add(GroupItem(
                                groupId = gId,
                                name = g.get("name")?.asString ?: "",
                                memberCount = g.get("memberCount")?.asInt ?: 0,
                                isBlacklisted = blacklisted.contains(gId)
                            ))
                        }
                        groups.sortBy { it.name }
                        _uiState.update { it.copy(isLoading = false, groups = groups, error = null) }
                    }
                } catch (e: Exception) {
                    Log.e("GroupsFilterVM", "Parse groups error: ${e.message}")
                    _uiState.update { it.copy(isLoading = false, error = "שגיאה בטעינת קבוצות") }
                }
            } else {
                // Could be 503
                _uiState.update { it.copy(
                    isLoading = false,
                    error = "ממתין לחיבור WhatsApp...\nנסה שוב בעוד רגע"
                )}
            }
            result.complete(Unit)
        }
        result.await()
    }

    fun toggleBlacklist(groupId: String) {
        val current = _blacklistedIds.value
        val updated = if (current.contains(groupId)) current - groupId else current + groupId
        _blacklistedIds.value = updated

        // Update groups list in UI
        _uiState.update { state ->
            state.copy(groups = state.groups.map {
                if (it.groupId == groupId) it.copy(isBlacklisted = updated.contains(groupId))
                else it
            })
        }

        // Save to local cache immediately
        viewModelScope.launch { repo.saveBlacklistedGroups(updated) }

        // Debounced PATCH to server
        patchJob?.cancel()
        patchJob = viewModelScope.launch {
            delay(500)
            val phone = repo.driverPhone.first()
            api.updateBlacklist(phone, updated.toList()) { ok ->
                if (!ok) Log.e("GroupsFilterVM", "Failed to update blacklist on server")
            }
        }
    }

    fun setSearchQuery(q: String) {
        _uiState.update { it.copy(searchQuery = q) }
    }

    fun refresh() {
        loadGroups()
    }
}
