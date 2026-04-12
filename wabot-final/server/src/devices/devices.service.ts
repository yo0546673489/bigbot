import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { Device, DeviceDocument } from './device.schema';
import { AuditLog, AuditLogDocument } from './audit.schema';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    @InjectModel(Device.name) private readonly deviceModel: Model<DeviceDocument>,
    @InjectModel(AuditLog.name) private readonly auditModel: Model<AuditLogDocument>,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly jwtService: JwtService,
  ) {}

  // ── Pairing Code ──────────────────────────────────────────────────

  async createPairingCode(phone: string, issuedByDeviceId: string, ip: string): Promise<{ code: string } | { error: string }> {
    // Rate limit: max 10 codes per hour per phone
    const phoneRateKey = `pairing:rate:${phone}`;
    const phoneCount = await this.redis.incr(phoneRateKey);
    if (phoneCount === 1) await this.redis.expire(phoneRateKey, 3600);
    if (phoneCount > 10) return { error: 'rate_limit_exceeded' };

    // Check max 3 active devices
    const activeCount = await this.deviceModel.countDocuments({ phone, revokedAt: null });
    if (activeCount >= 3) return { error: 'max_devices_reached' };

    // Generate 8-digit code
    const code = String(crypto.randomInt(10000000, 99999999));
    const hash = await bcrypt.hash(code, 10);

    // Store in Redis with 60s TTL
    await this.redis.set(
      `pairing:code:${hash}`,
      JSON.stringify({ phone, issuedByDeviceId, createdAt: Date.now(), attempts: 0 }),
      'EX', 60,
    );

    // Also store a reverse lookup so we can find the hash by phone (for cleanup)
    await this.redis.set(`pairing:active:${phone}`, hash, 'EX', 60);

    await this.audit('pairing_create', phone, issuedByDeviceId, ip, 'Code created');
    this.logger.log(`Pairing code created for ${phone}`);
    // Never log the actual code
    return { code };
  }

  async verifyPairingCode(phone: string, code: string, deviceName: string, ip: string): Promise<{ status: string; requestId?: string } | { error: string }> {
    // IP rate limit: max 5 failed attempts per 15 min
    const ipRateKey = `pairing:rate:ip:${ip}`;
    const ipCount = parseInt(await this.redis.get(ipRateKey) || '0');
    if (ipCount >= 5) return { error: 'too_many_attempts' };

    // Find the active code for this phone
    const activeHash = await this.redis.get(`pairing:active:${phone}`);
    if (!activeHash) {
      await this.redis.incr(ipRateKey);
      await this.redis.expire(ipRateKey, 900);
      await this.audit('pairing_failed', phone, '', ip, 'No active code');
      return { error: 'invalid_or_expired' };
    }

    // Get the stored data
    const raw = await this.redis.get(`pairing:code:${activeHash}`);
    if (!raw) {
      await this.audit('pairing_failed', phone, '', ip, 'Code expired');
      return { error: 'invalid_or_expired' };
    }

    const data = JSON.parse(raw);

    // Check phone matches (anti-enumeration: same error)
    if (data.phone !== phone) {
      await this.redis.incr(ipRateKey);
      await this.redis.expire(ipRateKey, 900);
      return { error: 'invalid_or_expired' };
    }

    // Check attempts
    if (data.attempts >= 3) {
      await this.redis.del(`pairing:code:${activeHash}`, `pairing:active:${phone}`);
      await this.audit('pairing_failed', phone, '', ip, 'Max attempts exceeded');
      return { error: 'invalid_or_expired' };
    }

    // Verify code against hash
    const match = await bcrypt.compare(code.replace('-', ''), activeHash);
    if (!match) {
      // Check against ALL possible hashes (bcrypt compare needs the original hash)
      // Actually, we stored the hash as the key. We need to compare differently.
      // Let's hash the provided code and compare
      const isValid = await bcrypt.compare(code.replace(/[-\s]/g, ''), activeHash);
      if (!isValid) {
        data.attempts++;
        await this.redis.set(`pairing:code:${activeHash}`, JSON.stringify(data), 'KEEPTTL');
        await this.redis.incr(ipRateKey);
        await this.redis.expire(ipRateKey, 900);
        await this.audit('pairing_failed', phone, '', ip, `Wrong code, attempt ${data.attempts}`);
        return { error: 'invalid_or_expired' };
      }
    }

    // Code is valid — burn it
    await this.redis.del(`pairing:code:${activeHash}`, `pairing:active:${phone}`);

    // Create pending request (30s TTL)
    const requestId = uuidv4();
    await this.redis.set(
      `pairing:pending:${requestId}`,
      JSON.stringify({ phone, deviceName, createdAt: Date.now() }),
      'EX', 30,
    );

    await this.audit('pairing_verify', phone, '', ip, `Code verified, awaiting approval. requestId=${requestId}`);
    this.logger.log(`Pairing code verified for ${phone}, awaiting approval`);
    return { status: 'awaiting_approval', requestId };
  }

  async approveDevice(requestId: string, phone: string, ip: string): Promise<{ token: string; deviceId: string } | { error: string }> {
    const raw = await this.redis.get(`pairing:pending:${requestId}`);
    if (!raw) return { error: 'request_expired' };

    const data = JSON.parse(raw);
    if (data.phone !== phone) return { error: 'unauthorized' };

    // Delete pending request
    await this.redis.del(`pairing:pending:${requestId}`);

    // Create companion device
    const device = await this.deviceModel.create({
      phone,
      role: 'companion',
      deviceName: data.deviceName || 'מכשיר נוסף',
    });

    // Generate JWT for the new device (30 days)
    const token = this.jwtService.sign(
      { phone, deviceId: device.deviceId, role: 'companion' },
      { expiresIn: '30d' },
    );

    await this.audit('pairing_approve', phone, device.deviceId, ip, `Device "${data.deviceName}" approved`);
    this.logger.log(`Device ${device.deviceId} approved for ${phone}`);
    return { token, deviceId: device.deviceId };
  }

  async rejectDevice(requestId: string, phone: string, ip: string): Promise<{ ok: boolean }> {
    const raw = await this.redis.get(`pairing:pending:${requestId}`);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.phone === phone) {
        await this.redis.del(`pairing:pending:${requestId}`);
        await this.audit('pairing_reject', phone, '', ip, `Request ${requestId} rejected`);
      }
    }
    return { ok: true };
  }

  // ── Device Management ─────────────────────────────────────────────

  async listDevices(phone: string): Promise<Device[]> {
    return this.deviceModel.find({ phone, revokedAt: null }).sort({ createdAt: 1 }).lean();
  }

  async revokeDevice(phone: string, deviceId: string, ip: string): Promise<{ ok: boolean } | { error: string }> {
    const device = await this.deviceModel.findOne({ phone, deviceId, revokedAt: null });
    if (!device) return { error: 'device_not_found' };
    if (device.role === 'primary') return { error: 'cannot_revoke_primary' };

    device.revokedAt = new Date();
    await device.save();

    await this.audit('device_revoke', phone, deviceId, ip, `Device "${device.deviceName}" revoked`);
    this.logger.log(`Device ${deviceId} revoked for ${phone}`);
    return { ok: true };
  }

  // ── Migration ─────────────────────────────────────────────────────

  async ensurePrimaryDevices(): Promise<void> {
    try {
      const drivers = await this.deviceModel.db.collection('drivers').find(
        { isApproved: true },
        { projection: { phone: 1 } },
      ).toArray();

      let created = 0;
      for (const driver of drivers) {
        const exists = await this.deviceModel.findOne({ phone: driver.phone, role: 'primary' });
        if (!exists) {
          await this.deviceModel.create({ phone: driver.phone, role: 'primary', deviceName: 'מכשיר ראשי' });
          created++;
        }
      }
      if (created > 0) this.logger.log(`Migration: created ${created} primary device records`);
    } catch (e: any) {
      this.logger.warn(`ensurePrimaryDevices failed: ${e?.message}`);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private async audit(action: string, phone: string, deviceId: string, ip: string, details: string): Promise<void> {
    try {
      await this.auditModel.create({ action, phone, deviceId, ip, details });
    } catch (e: any) {
      this.logger.warn(`Audit log failed: ${e?.message}`);
    }
  }
}
