import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ required: true })
  action: string; // 'pairing_create' | 'pairing_verify' | 'pairing_approve' | 'pairing_reject' | 'device_revoke' | 'pairing_failed'

  @Prop({ required: true })
  phone: string;

  @Prop({ default: '' })
  deviceId: string;

  @Prop({ default: '' })
  ip: string;

  @Prop({ default: '' })
  details: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
