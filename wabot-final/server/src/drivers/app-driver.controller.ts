import { Body, Controller, Logger, Post } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Redis from 'ioredis';
import { Inject } from '@nestjs/common';
import { Driver } from './schemas/driver.schema';
import { APP_VEHICLE_FILTER_LABELS } from '../common/utils';
import { EtaService } from './eta.service';

/**
 * Endpoints called by the BigBot Android app to mutate driver state.
 * Intentionally NOT guarded by JwtAuthGuard — the app authenticates the user
 * implicitly by their connected WhatsApp phone, not by a JWT.
 */
@Controller('driver')
export class AppDriverController {
  private readonly logger = new Logger('AppDriverController');

  constructor(
    @InjectModel(Driver.name) private readonly driverModel: Model<Driver>,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
    private readonly etaService: EtaService,
  ) {}

  /**
   * Calculate the real driving ETA from the user's current GPS location to a
   * pickup street address. Uses OSRM/Nominatim public services with Redis
   * caching. Returns duration in minutes and the geocoded destination.
   *
   * Body: { fromLat, fromLng, address }
   *      OR
   *      { fromLat, fromLng, toLat, toLng } if the destination is already
   *      a known coordinate.
   */
  @Post('eta')
  async eta(@Body() body: {
    fromLat?: number;
    fromLng?: number;
    address?: string;
    toLat?: number;
    toLng?: number;
  }) {
    if (typeof body?.fromLat !== 'number' || typeof body?.fromLng !== 'number') {
      return { ok: false, error: 'fromLat/fromLng required' };
    }
    if (typeof body?.toLat === 'number' && typeof body?.toLng === 'number') {
      return this.etaService.etaToCoords(body.fromLat, body.fromLng, body.toLat, body.toLng);
    }
    if (typeof body?.address === 'string' && body.address.trim()) {
      return this.etaService.etaToAddress(body.fromLat, body.fromLng, body.address);
    }
    return { ok: false, error: 'address or (toLat,toLng) required' };
  }

  /**
   * Self-register a new driver from the BigBot Android app.
   * Called once during onboarding (name + dob + vehicle + phone). Creates
   * the driver doc + Redis cache so the user can immediately link their
   * WhatsApp and start receiving rides without any manual server setup.
   *
   * Body: { phone, name, dob, vehicle }
   */
  @Post('register')
  async register(@Body() body: { phone?: string; name?: string; dob?: string; vehicle?: string }) {
    const phone = (body?.phone || '').trim().replace(/\D/g, '');
    const name = (body?.name || '').trim();
    const dob = (body?.dob || '').trim();
    const vehicle = (body?.vehicle || '').trim();
    if (!phone) return { success: false, message: 'phone required' };
    if (!name) return { success: false, message: 'name required' };

    try {
      // Upsert: if the driver already exists (re-onboarding) update their
      // profile fields. Otherwise create a fresh doc with sensible defaults
      // (approved + active so the user can immediately receive rides).
      const update = {
        $set: {
          name,
          dob,
          vehicle,
          isApproved: true,
          isBusy: false,
          isInTrial: true,
          ignorePayment: true,
          language: 'he',
          vehicleType: 'כולם',
        },
        $setOnInsert: {
          phone,
          filterGroups: [],
          createdAt: new Date(),
        },
      };
      await this.driverModel.updateOne({ phone }, update, { upsert: true }).exec();

      // Refresh redis cache so the next message lookup sees the new driver
      const saved = await this.driverModel.findOne({ phone }).lean();
      if (saved) {
        await this.redisClient.set(`driver:${phone}`, JSON.stringify(saved));
      }

      this.logger.log(`Registered driver ${phone} name="${name}" vehicle="${vehicle}"`);
      return { success: true, driver: { phone, name, dob, vehicle } };
    } catch (e: any) {
      this.logger.error(`register failed for ${phone}: ${e?.message}`);
      return { success: false, message: e?.message || 'error' };
    }
  }

  /**
   * Save miscellaneous driver settings from the Android app.
   * Body: { phone, acceptDeliveries? }
   * Designed to be extendable without breaking existing endpoints.
   */
  @Post('settings')
  async saveSettings(@Body() body: { phone?: string; acceptDeliveries?: boolean }) {
    const phone = (body?.phone || '').trim();
    if (!phone) return { success: false, message: 'phone required' };

    const update: Record<string, any> = {};
    if (typeof body?.acceptDeliveries === 'boolean') {
      update.acceptDeliveries = body.acceptDeliveries;
    }

    if (Object.keys(update).length === 0) {
      return { success: false, message: 'no settings provided' };
    }

    try {
      await this.driverModel.updateOne({ phone }, { $set: update }, { upsert: false }).exec();
      const updated = await this.driverModel.findOne({ phone }).lean();
      if (updated) await this.redisClient.set(`driver:${phone}`, JSON.stringify(updated));
      this.logger.log(`Saved settings for ${phone}: ${JSON.stringify(update)}`);
      return { success: true };
    } catch (e: any) {
      this.logger.error(`saveSettings failed for ${phone}: ${e?.message}`);
      return { success: false, message: e?.message || 'error' };
    }
  }

  /**
   * Save the user's selected vehicle type filters (multi-select).
   * Body: { phone: string, categoryFilters: { key: string }[] }
   * Each `key` should be one of APP_VEHICLE_FILTER_LABELS.
   */
  @Post('filters')
  async saveFilters(@Body() body: { phone?: string; categoryFilters?: { key: string }[] }) {
    const phone = (body?.phone || '').trim();
    if (!phone) return { success: false, message: 'phone required' };

    const incoming = Array.isArray(body?.categoryFilters) ? body.categoryFilters : [];
    // Sanitize: keep only known labels, dedupe
    const allowed = new Set<string>(APP_VEHICLE_FILTER_LABELS as readonly string[]);
    const cleaned = Array.from(new Set(
      incoming
        .map(f => (f?.key || '').toString().trim())
        .filter(k => allowed.has(k))
    )).map(k => ({ key: k, value: k }));

    try {
      await this.driverModel.updateOne(
        { phone },
        { $set: { categoryFilters: cleaned } },
        { upsert: false },
      ).exec();

      // Refresh redis cache so the next message lookup sees the new filters
      const updated = await this.driverModel.findOne({ phone }).lean();
      if (updated) {
        await this.redisClient.set(`driver:${phone}`, JSON.stringify(updated));
      }

      this.logger.log(`Saved vehicle filters for ${phone}: [${cleaned.map(c => c.key).join(', ')}]`);
      return { success: true, categoryFilters: cleaned };
    } catch (e: any) {
      this.logger.error(`saveFilters failed for ${phone}: ${e?.message}`);
      return { success: false, message: e?.message || 'error' };
    }
  }
}
