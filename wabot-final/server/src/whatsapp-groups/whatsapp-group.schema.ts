import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WhatsAppGroupDocument = WhatsAppGroup & Document;

export class WhatsAppGroupMember {
  @Prop({ required: true })
  id?: string;

  @Prop()
  jid: string;

  @Prop()
  lid: string;

  @Prop()
  admin?: string;

  @Prop()
  phoneNumber?: string;

  @Prop()
  isAdmin?: boolean;

  @Prop()
  isSuperAdmin?: boolean;
}

const WhatsAppGroupMemberSchema = SchemaFactory.createForClass(WhatsAppGroupMember);

@Schema({ timestamps: true })
export class WhatsAppGroup {
  @Prop({ unique: true, required: true })
  groupId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ type: [WhatsAppGroupMemberSchema], default: [] })
  participants: WhatsAppGroupMember[];
}

export const WhatsAppGroupSchema = SchemaFactory.createForClass(WhatsAppGroup);

// Add compound indexes for better query performance
WhatsAppGroupSchema.index({ groupId: 1 });
WhatsAppGroupSchema.index({ name: 1 });
WhatsAppGroupSchema.index({ createdAt: -1 });
WhatsAppGroupSchema.index({ updatedAt: -1 });

// Compound indexes for common filter + sort combinations
WhatsAppGroupSchema.index({ name: 1, createdAt: -1 });
WhatsAppGroupSchema.index({ groupId: 1, createdAt: -1 });
WhatsAppGroupSchema.index({ name: 1, updatedAt: -1 });

// Text index for name search if you're doing text searches
WhatsAppGroupSchema.index({ name: 'text' });

// Index for participants array lookups if you filter by participant data
WhatsAppGroupSchema.index({ 'participants.jid': 1 });
WhatsAppGroupSchema.index({ 'participants.phoneNumber': 1 });
