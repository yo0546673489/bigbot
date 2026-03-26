import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum RideStatus {
  PENDING = 'pending',
  READY = 'ready',
  TAKEN = 'taken',
  COMPLETED = 'completed',
}

export type RideDocument = Ride & Document;

@Schema({ timestamps: true })
export class Ride {
  @Prop({ required: true })
  phone: string; // dispatcher phone

  @Prop({ required: true, unique: true })
  code: string;

  @Prop({})
  message: string;

  @Prop({ required: true, default: RideStatus.PENDING })
  status: RideStatus;

  @Prop({})
  driverPhone: string;
}

export const RideSchema = SchemaFactory.createForClass(Ride);
