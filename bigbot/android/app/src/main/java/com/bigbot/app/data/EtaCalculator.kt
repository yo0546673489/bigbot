package com.bigbot.app.data

import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

@Singleton
class EtaCalculator @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val tag = "EtaCalculator"
    private val geocodeCache = ConcurrentHashMap<String, Pair<Double, Double>>()
    private val client = OkHttpClient()
    private val fusedClient = LocationServices.getFusedLocationProviderClient(context)

    /** Get current device location (last known or fresh fix). Returns null if no permission. */
    @SuppressLint("MissingPermission")
    suspend fun getDeviceLocation(): Pair<Double, Double>? = withContext(Dispatchers.IO) {
        val hasPerm = ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!hasPerm) { Log.w(tag, "No location permission"); return@withContext null }

        try {
            suspendCancellableCoroutine { cont ->
                fusedClient.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, CancellationTokenSource().token)
                    .addOnSuccessListener { loc ->
                        if (loc != null) {
                            Log.d(tag, "Device location: ${loc.latitude},${loc.longitude}")
                            cont.resume(Pair(loc.latitude, loc.longitude))
                        } else {
                            // fallback to last known
                            fusedClient.lastLocation.addOnSuccessListener { last ->
                                if (last != null) cont.resume(Pair(last.latitude, last.longitude))
                                else cont.resume(null)
                            }.addOnFailureListener { cont.resume(null) }
                        }
                    }
                    .addOnFailureListener { cont.resume(null) }
            }
        } catch (e: Exception) {
            Log.e(tag, "getDeviceLocation failed: ${e.message}")
            null
        }
    }

    /**
     * Calculate driving ETA in minutes from driver location to the given address.
     * Returns null if calculation fails.
     */
    suspend fun calculateEta(
        driverLat: Double,
        driverLng: Double,
        address: String
    ): Int? = withContext(Dispatchers.IO) {
        if (driverLat == 0.0 && driverLng == 0.0) return@withContext null
        if (address.isBlank()) return@withContext null

        try {
            // Step 1: Geocode destination address
            val (destLat, destLng) = geocode(address) ?: return@withContext null

            // Step 2: OSRM routing API (free)
            val url = "https://router.project-osrm.org/route/v1/driving/" +
                    "$driverLng,$driverLat;$destLng,$destLat?overview=false"

            val request = Request.Builder().url(url).build()
            val response = client.newCall(request).execute()
            val body = response.body?.string() ?: return@withContext null
            val json = JSONObject(body)

            if (json.optString("code") != "Ok") return@withContext null

            val routes = json.optJSONArray("routes")
            if (routes == null || routes.length() == 0) return@withContext null

            val durationSec = routes.getJSONObject(0).optDouble("duration", -1.0)
            if (durationSec < 0) return@withContext null

            val minutes = kotlin.math.ceil(durationSec / 60.0).toInt()
            Log.d(tag, "ETA: $address → $minutes min (${durationSec}s)")
            minutes
        } catch (e: Exception) {
            Log.e(tag, "ETA calc failed: ${e.message}")
            null
        }
    }

    @Suppress("DEPRECATION")
    private fun geocode(address: String): Pair<Double, Double>? {
        geocodeCache[address]?.let { return it }

        val searchAddress = if ("ישראל" in address) address else "$address, ישראל"

        // Try Android Geocoder first
        try {
            val geocoder = Geocoder(context, Locale("he", "IL"))
            val results = geocoder.getFromLocationName(searchAddress, 1)
            if (!results.isNullOrEmpty()) {
                val loc = results[0]
                val pair = Pair(loc.latitude, loc.longitude)
                geocodeCache[address] = pair
                Log.d(tag, "Geocoded '$address' → ${loc.latitude},${loc.longitude}")
                return pair
            }
        } catch (e: Exception) {
            Log.w(tag, "Android Geocoder failed: ${e.message}")
        }

        // Fallback: Nominatim (OpenStreetMap) — free
        return try {
            val encoded = java.net.URLEncoder.encode(searchAddress, "UTF-8")
            val url = "https://nominatim.openstreetmap.org/search?format=json&q=$encoded&limit=1&accept-language=he"
            val request = Request.Builder().url(url)
                .header("User-Agent", "BigBot-Android/1.0")
                .build()
            val response = client.newCall(request).execute()
            val body = response.body?.string() ?: return null
            val arr = org.json.JSONArray(body)
            if (arr.length() == 0) {
                Log.w(tag, "Nominatim: no results for '$address'")
                return null
            }
            val obj = arr.getJSONObject(0)
            val lat = obj.getDouble("lat")
            val lng = obj.getDouble("lon")
            val pair = Pair(lat, lng)
            geocodeCache[address] = pair
            Log.d(tag, "Nominatim geocoded '$address' → $lat,$lng")
            pair
        } catch (e: Exception) {
            Log.e(tag, "Nominatim geocode failed: ${e.message}")
            null
        }
    }
}
