import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  private getIp(req: Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
  }

  // ── Pairing flow ──────────────────────────────────────────────────

  /** Primary device creates a pairing code. JWT required. */
  @Post('pairing/create')
  @UseGuards(JwtAuthGuard)
  async createCode(@Req() req: Request, @Body() body: { phone: string; deviceId?: string }) {
    const phone = body.phone;
    if (!phone) return { error: 'phone_required' };
    return this.devicesService.createPairingCode(phone, body.deviceId || '', this.getIp(req));
  }

  /** New device verifies the pairing code. Public (no JWT). */
  @Post('pairing/verify')
  async verifyCode(@Req() req: Request, @Body() body: { phone: string; code: string; deviceName?: string }) {
    if (!body.phone || !body.code) return { error: 'phone_and_code_required' };
    return this.devicesService.verifyPairingCode(
      body.phone,
      body.code.replace(/[-\s]/g, ''),
      body.deviceName || '',
      this.getIp(req),
    );
  }

  /** Primary device approves the pairing request. JWT required. */
  @Post('pairing/approve')
  @UseGuards(JwtAuthGuard)
  async approve(@Req() req: Request, @Body() body: { requestId: string; phone: string }) {
    if (!body.requestId || !body.phone) return { error: 'requestId_and_phone_required' };
    return this.devicesService.approveDevice(body.requestId, body.phone, this.getIp(req));
  }

  /** Primary device rejects the pairing request. JWT required. */
  @Post('pairing/reject')
  @UseGuards(JwtAuthGuard)
  async reject(@Req() req: Request, @Body() body: { requestId: string; phone: string }) {
    if (!body.requestId || !body.phone) return { error: 'requestId_and_phone_required' };
    return this.devicesService.rejectDevice(body.requestId, body.phone, this.getIp(req));
  }

  // ── Device management ─────────────────────────────────────────────

  /** List all active devices for a phone. JWT required. */
  @Get('list/:phone')
  @UseGuards(JwtAuthGuard)
  async list(@Param('phone') phone: string) {
    return this.devicesService.listDevices(phone);
  }

  /** Revoke (disconnect) a companion device. JWT required. */
  @Delete(':deviceId')
  @UseGuards(JwtAuthGuard)
  async revoke(@Req() req: Request, @Param('deviceId') deviceId: string, @Body() body: { phone: string }) {
    if (!body.phone) return { error: 'phone_required' };
    return this.devicesService.revokeDevice(body.phone, deviceId, this.getIp(req));
  }
}
