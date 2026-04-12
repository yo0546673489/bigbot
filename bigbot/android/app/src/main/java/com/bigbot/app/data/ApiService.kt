package com.bigbot.app.data

import android.util.Log
import com.google.gson.Gson
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ApiService @Inject constructor(private val gson: Gson) {

    private val client = OkHttpClient()
    private val json = "application/json; charset=utf-8".toMediaType()
    // Production: HTTPS via Hostinger DNS + Let's Encrypt SSL.
    var baseUrl = "https://api.bigbotdrivers.com"

    private fun post(path: String, body: Map<String, Any>, onResult: (Boolean, String) -> Unit) {
        val reqBody = gson.toJson(body).toRequestBody(json)
        val req = Request.Builder().url("$baseUrl$path").post(reqBody).build()
        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("API", "POST $path failed: ${e.message}")
                onResult(false, e.message ?: "error")
            }
            override fun onResponse(call: Call, response: Response) {
                onResult(response.isSuccessful, response.body?.string() ?: "")
            }
        })
    }

    private fun patch(path: String, body: Map<String, Any>, onResult: (Boolean, String) -> Unit) {
        val reqBody = gson.toJson(body).toRequestBody(json)
        val req = Request.Builder().url("$baseUrl$path").patch(reqBody).build()
        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("API", "PATCH $path failed: ${e.message}")
                onResult(false, e.message ?: "error")
            }
            override fun onResponse(call: Call, response: Response) {
                onResult(response.isSuccessful, response.body?.string() ?: "")
            }
        })
    }

    private fun delete(path: String, body: Map<String, Any>, onResult: (Boolean) -> Unit) {
        val reqBody = gson.toJson(body).toRequestBody(json)
        val req = Request.Builder().url("$baseUrl$path").delete(reqBody).build()
        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) { onResult(false) }
            override fun onResponse(call: Call, response: Response) { onResult(response.isSuccessful) }
        })
    }

    fun pairPhone(phone: String, onResult: (Boolean, String) -> Unit) {
        post("/api/waweb/pairing-code", mapOf("phone" to phone), onResult)
    }

    /** One-shot driver registration during onboarding (name + dob + vehicle + phone). */
    fun registerDriver(
        phone: String,
        name: String,
        dob: String,
        vehicle: String,
        onResult: (Boolean, String) -> Unit
    ) {
        post(
            "/api/driver/register",
            mapOf("phone" to phone, "name" to name, "dob" to dob, "vehicle" to vehicle),
            onResult
        )
    }

    fun reconnect(phone: String, onResult: (Boolean) -> Unit) {
        post("/api/waweb/reconnect", mapOf("phone" to phone)) { ok, _ -> onResult(ok) }
    }

    fun disconnect(phone: String, onResult: (Boolean) -> Unit) {
        post("/api/waweb/disconnect", mapOf("phone" to phone)) { ok, _ -> onResult(ok) }
    }

    fun saveCustomMessage(phone: String, message: String, onResult: (Boolean) -> Unit) {
        post("/api/driver/custom-message", mapOf("phone" to phone, "message" to message, "type" to "CUSTOM")) { ok, _ -> onResult(ok) }
    }

    fun saveVehicleType(phone: String, type: String, onResult: (Boolean) -> Unit) {
        saveVehicleTypes(phone, listOf(type), onResult)
    }

    fun saveVehicleTypes(phone: String, types: List<String>, onResult: (Boolean) -> Unit) {
        val filters = types.map { mapOf("key" to it) }
        post("/api/driver/filters", mapOf("phone" to phone, "categoryFilters" to filters)) { ok, _ -> onResult(ok) }
    }

    suspend fun getProfilePictureUrl(phone: String): String {
        return try {
            val req = Request.Builder().url("$baseUrl/api/waweb/profile-picture?phone=$phone").get().build()
            val response = client.newCall(req).execute()
            val body = response.body?.string() ?: return ""
            val obj = com.google.gson.JsonParser.parseString(body).asJsonObject
            obj.get("url")?.asString ?: ""
        } catch (_: Exception) { "" }
    }

    fun saveSettings(phone: String, acceptDeliveries: Boolean, onResult: (Boolean) -> Unit) {
        post("/api/driver/settings", mapOf("phone" to phone, "acceptDeliveries" to acceptDeliveries)) { ok, _ -> onResult(ok) }
    }

    fun addKeyword(phone: String, keyword: String, onResult: (Boolean) -> Unit) {
        post("/api/driver/keyword", mapOf("phone" to phone, "keyword" to keyword)) { ok, _ -> onResult(ok) }
    }

    fun removeKeyword(phone: String, keyword: String, onResult: (Boolean) -> Unit) {
        delete("/api/driver/keyword", mapOf("phone" to phone, "keyword" to keyword), onResult)
    }

    /** Create a pairing code for multi-device. Returns (success, code). */
    fun createPairingCode(phone: String, onResult: (Boolean, String) -> Unit) {
        post("/api/devices/pairing/create", mapOf("phone" to phone)) { ok, body ->
            if (ok && body.isNotEmpty()) {
                try {
                    val obj = com.google.gson.JsonParser.parseString(body).asJsonObject
                    val code = obj.get("code")?.asString ?: ""
                    onResult(code.isNotEmpty(), code)
                } catch (_: Exception) { onResult(false, "") }
            } else onResult(false, "")
        }
    }

    // ── Groups Blacklist ──────────────────────────────────────────────

    /** Fetch all WhatsApp groups the driver is a member of (live from whatsmeow). */
    fun getGroups(phone: String, onResult: (Boolean, String) -> Unit) {
        val req = Request.Builder().url("$baseUrl/api/driver/groups?phone=$phone").get().build()
        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("API", "getGroups failed: ${e.message}")
                onResult(false, e.message ?: "error")
            }
            override fun onResponse(call: Call, response: Response) {
                val body = response.body?.string() ?: ""
                onResult(response.isSuccessful, body)
            }
        })
    }

    /** Fetch the driver's blacklisted group IDs. */
    fun getBlacklist(phone: String, onResult: (Boolean, String) -> Unit) {
        val req = Request.Builder().url("$baseUrl/api/driver/groups/blacklist?phone=$phone").get().build()
        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("API", "getBlacklist failed: ${e.message}")
                onResult(false, e.message ?: "error")
            }
            override fun onResponse(call: Call, response: Response) {
                val body = response.body?.string() ?: ""
                onResult(response.isSuccessful, body)
            }
        })
    }

    /** Replace the driver's blacklisted group list (full replace). */
    fun updateBlacklist(phone: String, blacklistedIds: List<String>, onResult: (Boolean) -> Unit) {
        patch("/api/driver/groups/blacklist", mapOf("phone" to phone, "blacklistedGroupIds" to blacklistedIds)) { ok, _ -> onResult(ok) }
    }

    /** Fetch all areas data (shortcuts, support areas, neighborhoods) from the public endpoint. */
    fun fetchAreas(onResult: (Boolean, String) -> Unit) {
        val req = Request.Builder().url("$baseUrl/api/areas/all").get().build()
        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("API", "fetchAreas failed: ${e.message}")
                onResult(false, "")
            }
            override fun onResponse(call: Call, response: Response) {
                val body = response.body?.string() ?: ""
                onResult(response.isSuccessful, body)
            }
        })
    }
}
