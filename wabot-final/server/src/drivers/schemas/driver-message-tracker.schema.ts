import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as crypto from 'crypto';

export type DriverMessageTrackerDocument = DriverMessageTracker & Document;

@Schema({ timestamps: true })
export class DriverMessageTracker {
  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  senderPhone: string;

  @Prop({ required: true })
  messageHash: string;

  @Prop({ default: Date.now, expires: 300 }) // 5 minutes in seconds
  createdAt: Date;

  static hashMessage(message: string): string {
    return crypto.createHash('sha256').update(message).digest('hex');
  }
}

export const DriverMessageTrackerSchema = SchemaFactory.createForClass(DriverMessageTracker);

// Create compound index for phone + messageHash to ensure uniqueness
DriverMessageTrackerSchema.index({ phone: 1, senderPhone: 1, messageHash: 1 }, { unique: true }); 