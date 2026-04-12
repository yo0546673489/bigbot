import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BenchmarkEventDocument = BenchmarkEvent & Document;

@Schema({ collection: 'benchmark_events', timestamps: false })
export class BenchmarkEvent {
  @Prop({ required: true, index: true })
  runId: string;

  @Prop({ required: true })
  timestamp: Date;

  @Prop({ required: true, enum: ['bigbot_group', 'drybot_private'] })
  source: string;

  @Prop()
  groupName?: string;

  @Prop()
  groupId?: string;

  @Prop({ required: true })
  rawMessage: string;

  @Prop({ required: true, index: true })
  messageHash: string;

  @Prop()
  parsedOrigin?: string;

  @Prop()
  parsedDestination?: string;

  @Prop()
  parsedPrice?: string;

  @Prop()
  bigbotRecognized?: boolean;

  @Prop()
  bigbotSkipReason?: string;

  @Prop()
  processingLatencyMs?: number;
}

export const BenchmarkEventSchema = SchemaFactory.createForClass(BenchmarkEvent);

// Auto-delete after 7 days
BenchmarkEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
