import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Real-driving ETA + distance calculator. Uses free public services so it
 * works out of the box without API keys:
 *   1. Nominatim (OpenStreetMap) — geocodes a street address to lat/lng
 *   2. OSRM public demo server — routes from origin to destination via roads
 *
 * Caches geocoding (24h) and route results (60s) in Redis to keep load
 * low and stay well below the public services' rate limits.
 *
 * To upgrade to real-time traffic later, swap the routing call to
 * Google Distance Matrix / HERE / Mapbox — only the `routeDriving` method
 * has to change. The cache + interface stay the same.
 */
@Injectable()
export class EtaService {
  private readonly logger = new Logger('EtaService');

  // Public service hosts. Both are free and require no API key, but they
  // do enforce a fair-use policy — that's why everything is cached.
  private readonly NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  private readonly OSRM = 'https://router.project-osrm.org/route/v1/driving';

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  /** Calculate driving ETA + distance from (lat,lng) to a street address. */
  async etaToAddress(
    fromLat: number, fromLng: number, toAddress: string,
  ): Promise<{ ok: boolean; durationMin?: number; distanceKm?: number; toLat?: number; toLng?: number; error?: string }> {
    if (!toAddress?.trim()) return { ok: false, error: 'address empty' };
    const dest = await this.geocode(toAddress.trim());
    if (!dest) return { ok: false, error: 'geocode failed' };
    return this.etaToCoords(fromLat, fromLng, dest.lat, dest.lng);
  }

  /** Calculate driving ETA + distance between two lat/lng points. */
  async etaToCoords(
    fromLat: number, fromLng: number, toLat: number, toLng: number,
  ): Promise<{ ok: boolean; durationMin?: number; distanceKm?: number; toLat?: number; toLng?: number; error?: string }> {
    // Round to 4 decimal places (~11m) so the cache hit rate is reasonable
    const r = (n: number) => Math.round(n * 10000) / 10000;
    const cacheKey = `eta:${r(fromLat)},${r(fromLng)}=>${r(toLat)},${r(toLng)}`;
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      try { return { ok: true, ...JSON.parse(cached) }; } catch {}
    }

    const result = await this.routeDriving(fromLat, fromLng, toLat, toLng);
    if (!result.ok) return result;

    // Apply a rough peak-hour multiplier so the OSRM number (no traffic)
    // is closer to reality. Replace this with a real-traffic API later.
    const adjusted = this.applyPeakHourFactor(result.durationMin!);
    const out = { durationMin: adjusted, distanceKm: result.distanceKm, toLat, toLng };
    await this.redis.set(cacheKey, JSON.stringify(out), 'EX', 60).catch(() => {});
    return { ok: true, ...out };
  }

  // -- internals -----------------------------------------------------------

  private async geocode(address: string): Promise<{ lat: number; lng: number } | null> {
    // Add Israel hint to improve accuracy
    const query = address.includes('ישראל') ? address : `${address}, ישראל`;
    const cacheKey = `geocode:${query}`;
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      try { return JSON.parse(cached); } catch {}
    }
    try {
      const url = `${this.NOMINATIM}?format=json&limit=1&accept-language=he&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'BigBot/1.0 (admin@bigbotdrivers.com)' } });
      if (!res.ok) {
        this.logger.warn(`Nominatim ${res.status} for "${query}"`);
        return null;
      }
      const arr: any[] = await res.json();
      if (!arr.length) return null;
      const { lat, lon } = arr[0];
      const coords = { lat: parseFloat(lat), lng: parseFloat(lon) };
      // Cache geocoding for 24h — addresses don't move
      await this.redis.set(cacheKey, JSON.stringify(coords), 'EX', 24 * 60 * 60).catch(() => {});
      return coords;
    } catch (e: any) {
      this.logger.warn(`geocode failed for "${query}": ${e?.message}`);
      return null;
    }
  }

  private async routeDriving(
    fromLat: number, fromLng: number, toLat: number, toLng: number,
  ): Promise<{ ok: boolean; durationMin?: number; distanceKm?: number; error?: string }> {
    try {
      const url = `${this.OSRM}/${fromLng},${fromLat};${toLng},${toLat}?overview=false&alternatives=false&steps=false`;
      const res = await fetch(url);
      if (!res.ok) return { ok: false, error: `OSRM ${res.status}` };
      const data: any = await res.json();
      const route = data?.routes?.[0];
      if (!route) return { ok: false, error: 'no route' };
      return {
        ok: true,
        durationMin: Math.round(route.duration / 60), // seconds → minutes
        distanceKm: Math.round((route.distance / 1000) * 10) / 10, // meters → km, 1 decimal
      };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'route error' };
    }
  }

  private applyPeakHourFactor(durationMin: number): number {
    // Israel peak hours (rough): 7-9 AM and 4-7 PM. Add ~30% during peak.
    const now = new Date();
    const israelHours = (now.getUTCHours() + 3) % 24;
    const isPeak =
      (israelHours >= 7 && israelHours < 9) ||
      (israelHours >= 16 && israelHours < 19);
    return Math.round(durationMin * (isPeak ? 1.3 : 1.0));
  }
}
