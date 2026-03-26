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