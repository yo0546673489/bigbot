import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type InvitationDocument = Invitation & Document;

export enum InvitationStatus {
  PENDING = 'pending',
  INVITED = 'invited',
}

@Schema({ timestamps: true })
export class Invitation {
  @Prop({ unique: true })
  phone: string;

  @Prop({ default: InvitationStatus.PENDING })
  status: InvitationStatus;
}

export const InvitationSchema = SchemaFactory.createForClass(Invitation);
InvitationSchema.index({ status: 1 });
InvitationSchema.index({ createdAt: -1 });
InvitationSchema.index({ updatedAt: -1 }); 