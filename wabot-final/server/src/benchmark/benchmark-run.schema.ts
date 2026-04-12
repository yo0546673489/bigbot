import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BenchmarkRunDocument = BenchmarkRun & Document;

@Schema({ collection: 'benchmark_runs', timestamps: true })
export class BenchmarkRun {
  @Prop({ required: true, unique: true })
  runId: string;

  @Prop({ required: true })
  driverPhone: string;

  @Prop({ required: true })
  drybotPhone: string;

  @Prop({ type: [String], default: [] })
  keywords: string[];

  @Prop({ required: true })
  startedAt: Date;

  @Prop({ required: true })
  endsAt: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export const BenchmarkRunSchema = SchemaFactory.createForClass(BenchmarkRun);

// Auto-delete after 7 days
BenchmarkRunSchema.index({ startedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
