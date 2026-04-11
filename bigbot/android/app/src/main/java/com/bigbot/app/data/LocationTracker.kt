package com.bigbot.app.data

import android.annotation.SuppressLint
import android.content.Context
import android.location.Geocoder
import android.os.CancellationSignal
import android.os.Looper
import android.util.Log
import com.google.android.gms.location.*
import com.google.android.gms.tasks.CancellationTokenSource
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
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
                val city = reverseGeocode(loc.latitude, loc.longitude)
                if (city != null) {
                    Log.d("LocationTracker", "immediate fix: $city")
                    trySend(CityLocation(city, loc.latitude, loc.longitude))
                }
            }
        }.addOnFailureListener {
            // fallback: try last known location
            fusedClient.lastLocation.addOnSuccessListener { loc ->
                if (loc != null) {
                    val city = reverseGeocode(loc.latitude, loc.longitude)
                    if (city != null) trySend(CityLocation(city, loc.latitude, loc.longitude))
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
                val city = reverseGeocode(loc.latitude, loc.longitude) ?: return
                Log.d("LocationTracker", "periodic update: $city")
                trySend(CityLocation(city, loc.latitude, loc.longitude))
            }
        }

        fusedClient.requestLocationUpdates(request, callback, Looper.getMainLooper())

        awaitClose {
            cancellationSource.cancel()
            fusedClient.removeLocationUpdates(callback)
        }
    }

    private fun reverseGeocode(lat: Double, lng: Double): String? {
        return try {
            val geocoder = Geocoder(context, Locale("he", "IL"))
            @Suppress("DEPRECATION")
            val addresses = geocoder.getFromLocation(lat, lng, 1)
            val addr = addresses?.firstOrNull() ?: return null
            addr.locality ?: addr.subAdminArea ?: addr.adminArea
        } catch (e: Exception) {
            Log.w("LocationTracker", "reverseGeocode failed: ${e.message}")
            null
        }
    }
}
