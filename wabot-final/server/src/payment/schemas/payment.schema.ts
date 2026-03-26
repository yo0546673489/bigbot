import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PaymentDocument = Payment & Document;

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed'
}

export enum PaymentMethod {
  CREDIT_CARD = 'creditCard',
  BIT = 'bit',
  PAY_BOX = 'payBox',
  BANK_TRANSFER = 'bankTransfer'
}

@Schema({ timestamps: true })
export class Payment {
  @Prop()
  clientPhone: string;

  @Prop()
  paymentsNum: string;

  @Prop()
  ownerId: string;

  @Prop()
  cardSuffix: string;

  @Prop()
  cardExpDate: string;

  @Prop()
  clientName: string;

  @Prop()
  clientEmail: string;

  @Prop()
  productName: string;

  @Prop()
  sum: string;

  @Prop({ default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Prop({ default: PaymentMethod.CREDIT_CARD })
  method: PaymentMethod;

  @Prop()
  startDate: Date;

  @Prop()
  endDate: Date;

  @Prop({ default: false })
  isRecurring: boolean;

  @Prop()
  nextPaymentDate: number;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment); 