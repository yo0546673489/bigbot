import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DriverSearchKeywordDocument = DriverSearchKeyword & Document;

@Schema({ timestamps: true })
export class DriverSearchKeyword {
  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  keyword: string;

  @Prop({ default: 1 })
  searchCount: number;

  @Prop({ default: Date.now })
  lastSearchedAt: Date;

  @Prop({ default: false })
  isBlocked: boolean;
}

export const DriverSearchKeywordSchema = SchemaFactory.createForClass(DriverSearchKeyword); 