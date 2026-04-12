import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export type DeviceDocument = Device & Document;

@Schema({ timestamps: true })
export class Device {
  @Prop({ type: String, default: () => uuidv4(), unique: true, index: true })
  deviceId: string;

  @Prop({ required: true, index: true })
  phone: string;

  @Prop({ required: true, enum: ['primary', 'companion'], default: 'companion' })
  role: 'primary' | 'companion';

  @Prop({ default: '' })
  deviceName: string;

  @Prop({ default: '' })
  fcmToken: string;

  @Prop({ type: Date, default: Date.now })
  lastSeen: Date;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;
}

export const DeviceSchema = SchemaFactory.createForClass(Device);
