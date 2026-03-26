import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// type for regular or premium bot
export enum PaymentPackage {
  REGULAR = 'regular',
  PREMIUM = 'premium'
}

export type DriverDocument = Driver & Document;

@Schema({ timestamps: true })
export class Driver {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  phone: string;

  @Prop()
  id: string;

  @Prop()
  dob: string;

  @Prop()
  category: string;

  @Prop()
  vehicle: string;

  @Prop({ 
    type: String
  })
  clothing: string;

  @Prop({ default: false })
  isApproved: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: true })
  isBusy: boolean;

  @Prop({ default: 'en' })
  language: string;

  @Prop({})
  paymentMethod: string;

  @Prop({})
  categoryFilters: {
    key: string;
    value: string;
  }[];

  @Prop({})
  filterGroups: string[];

  @Prop({})
  billingEndAt: number;

  @Prop({ default: 'monthly' })
  billingCycle: string;

  @Prop({ default: false })
  ignorePayment: boolean;

  @Prop({ default: PaymentPackage.REGULAR })
  paymentPackage: PaymentPackage;

  @Prop({})
  createdAt: Date;
}

export const DriverSchema = SchemaFactory.createForClass(Driver); 

