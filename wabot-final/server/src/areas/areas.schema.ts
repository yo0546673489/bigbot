import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class SupportArea {
  @Prop({ type: String, required: true, unique: true, trim: true })
  name: string;
}
export type SupportAreaDocument = SupportArea & Document;
export const SupportAreaSchema = SchemaFactory.createForClass(SupportArea);

@Schema({ timestamps: true })
export class AreaShortcut {
  @Prop({ type: String, required: true, unique: true, trim: true })
  shortName: string;

  @Prop({ type: String, required: true, trim: true })
  fullName: string;

  // Geographic coordinates (populated by backfill_areashortcuts_coords.js via
  // Nominatim). Used by the km-range filter feature to compute real distances
  // between the ride origin and the driver's keyword city. Optional — a city
  // without coords is treated as "fail open" (passes the filter).
  @Prop({ type: Number, required: false })
  lat?: number;

  @Prop({ type: Number, required: false })
  lng?: number;
}
export type AreaShortcutDocument = AreaShortcut & Document;
export const AreaShortcutSchema = SchemaFactory.createForClass(AreaShortcut);

@Schema({ timestamps: true })
export class RelatedArea {
  @Prop({ type: String, required: true, unique: true, trim: true })
  main: string;

  @Prop({ type: [String], default: [] })
  related: string[];
}
export type RelatedAreaDocument = RelatedArea & Document;
export const RelatedAreaSchema = SchemaFactory.createForClass(RelatedArea);

@Schema({ timestamps: true })
export class NonStreetKeyword {
  @Prop({ type: String, required: true, unique: true, trim: true })
  word: string;

  @Prop({ type: String, required: false, trim: true })
  notes?: string;
}
export type NonStreetKeywordDocument = NonStreetKeyword & Document;
export const NonStreetKeywordSchema = SchemaFactory.createForClass(NonStreetKeyword);