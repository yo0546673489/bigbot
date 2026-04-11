package com.bigbot.app.data

import android.annotation.SuppressLint
import android.content.Context
import android.location.Geocoder
import android.os.Looper
import android.util.Log
import com.google.android.gms.location.*
import com.google.android.gms.tasks.CancellationTokenSource
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

data class CityLocation(val city: String, val lat: Double, val lng: Double)

@Singleton
class LocationTracker @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val fusedClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    /**
     * Emits city immediately on start, then every 10 minutes or 500m moved.
     */
    @SuppressLint("MissingPermission")
    fun cityUpdates(): Flow<CityLocation> = callbackFlow {
        val cancellationSource = CancellationTokenSource()

        // 1. Get current location immediately (high accuracy, one-shot)
        fusedClient.getCurrentLocation(
            Priority.PRIORITY_HIGH_ACCURACY,
            cancellationSource.token
        ).addOnSuccessListener { loc ->
            if (loc != null) {
                launch(Dispatchers.IO) {
                    val city = reverseGeocode(loc.latitude, loc.longitude) ?: "מיקום לא ידוע"
                    Log.d("LocationTracker", "immediate fix: $city")
                    trySend(CityLocation(city, loc.latitude, loc.longitude))
                }
            }
        }.addOnFailureListener {
            fusedClient.lastLocation.addOnSuccessListener { loc ->
                if (loc != null) {
                    launch(Dispatchers.IO) {
                        val city = reverseGeocode(loc.latitude, loc.longitude) ?: "מיקום לא ידוע"
                        trySend(CityLocation(city, loc.latitude, loc.longitude))
                    }
                }
            }
        }

        // 2. Ongoing updates every 10 min / 500m
        val request = LocationRequest.Builder(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY,
            10 * 60_000L
        )
            .setMinUpdateDistanceMeters(500f)
            .setMinUpdateIntervalMillis(5 * 60_000L)
            .build()

        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val loc = result.lastLocation ?: return
                launch(Dispatchers.IO) {
                    val city = reverseGeocode(loc.latitude, loc.longitude) ?: "מיקום לא ידוע"
                    Log.d("LocationTracker", "periodic update: $city")
                    trySend(CityLocation(city, loc.latitude, loc.longitude))
                }
            }
        }

        fusedClient.requestLocationUpdates(request, callback, Looper.getMainLooper())

        awaitClose {
            cancellationSource.cancel()
            fusedClient.removeLocationUpdates(callback)
        }
    }

    private val httpClient = OkHttpClient()

    private fun reverseGeocode(lat: Double, lng: Double): String? {
        // Try Android Geocoder first
        try {
            val geocoder = Geocoder(context, Locale("he", "IL"))
            @Suppress("DEPRECATION")
            val addresses = geocoder.getFromLocation(lat, lng, 1)
            val addr = addresses?.firstOrNull()
            val city = addr?.locality ?: addr?.subAdminArea ?: addr?.adminArea
            if (city != null) return city
        } catch (e: Exception) {
            Log.w("LocationTracker", "Android Geocoder failed: ${e.message}")
        }

        // Fallback: Nominatim (OpenStreetMap) — free, no API key
        return try {
            val url = "https://nominatim.openstreetmap.org/reverse?format=json&lat=$lat&lon=$lng&accept-language=he&zoom=10"
            val request = Request.Builder().url(url)
                .header("User-Agent", "BigBot-Android/1.0")
                .build()
            val response = httpClient.newCall(request).execute()
            val body = response.body?.string() ?: return null
            val json = JSONObject(body)
            val address = json.optJSONObject("address")
            val city = address?.optString("city", "")?.takeIf { it.isNotBlank() }
                ?: address?.optString("town", "")?.takeIf { it.isNotBlank() }
                ?: address?.optString("village", "")?.takeIf { it.isNotBlank() }
            Log.d("LocationTracker", "Nominatim fallback: $city")
            city
        } catch (e: Exception) {
            Log.w("LocationTracker", "Nominatim fallback failed: ${e.message}")
            null
        }
    }
}
