import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Device, DeviceSchema } from './device.schema';
import { AuditLog, AuditLogSchema } from './audit.schema';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Device.name, schema: DeviceSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule implements OnModuleInit {
  constructor(private readonly devicesService: DevicesService) {}

  async onModuleInit() {
    // Migration: ensure every approved driver has a primary device record
    await this.devicesService.ensurePrimaryDevices();
  }
}
