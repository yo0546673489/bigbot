import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum StageSteps {
  STAGE1 = 'stage1',
  STAGE2 = 'stage2',
  STAGE3 = 'stage3'
}

export type Group = {
  delay?: number;
  elements?: {
    id: string;
    name: string;
    description: string;
  }[]
}

export type Groups = {
  isDraft: boolean;
  data: {
    [stage in StageSteps]?: Group;
  }
}

export enum StagesType {
  NORMAL = 'normal',
  FAST = 'fast'
}

export type Stages = {
  [type in StagesType]: Groups
}

export type StationDocument = Station & Document;

@Schema({ timestamps: true })
export class Station extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  billingPhone: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true, unique: true })
  stationCode: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Object, default: {} })
  stages: Stages;

  @Prop({ type: [String], default: [] })
  arms: string[];
}

export const StationSchema = SchemaFactory.createForClass(Station); 