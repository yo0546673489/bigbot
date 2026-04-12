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

  @Prop({ type: [String], default: [] })
  blacklistedGroups: string[];

  @Prop({})
  billingEndAt: number;

  @Prop({ default: 'monthly' })
  billingCycle: string;

  @Prop({ default: true })
  acceptDeliveries: boolean;

  @Prop({ default: false })
  acceptInternalRides: boolean;

  @Prop({ default: true })
  acceptRoundTrip: boolean;

  @Prop({ default: false })
  ignorePayment: boolean;

  @Prop({ default: PaymentPackage.REGULAR })
  paymentPackage: PaymentPackage;

  // Optional km-range filter set from the BigBot Android app. When present,
  // the ride dispatcher only forwards rides whose origin city is within
  // [kmFilter] kilometers of any of the driver's keyword cities. null/missing
  // means "no range limit" (legacy keyword-only matching).
  @Prop({ required: false, default: null })
  kmFilter?: number;

  // Optional minimum ride price (₪) set from the BigBot Android app. Rides
  // whose parsed price is below this threshold are filtered out. Rides with
  // no detectable price pass through (fail-open).
  @Prop({ required: false, default: null })
  minPrice?: number;

  @Prop({})
  createdAt: Date;
}

export const DriverSchema = SchemaFactory.createForClass(Driver); 

