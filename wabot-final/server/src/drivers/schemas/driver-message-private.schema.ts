import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DriverMessagePrivateDocument = DriverMessagePrivate & Document;

export enum MessageType {
  ROUTER = 'router',
  CUSTOM = 'custom'
}

@Schema({ timestamps: true })
export class DriverMessagePrivate {
  @Prop({ required: true })
  phone: string;

  @Prop({})
  message: string;

  @Prop({})
  createdAt: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: MessageType.ROUTER })
  type: MessageType;
}

export const DriverMessagePrivateSchema = SchemaFactory.createForClass(DriverMessagePrivate);