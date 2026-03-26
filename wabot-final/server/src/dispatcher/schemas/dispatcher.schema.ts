import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { DispatcherRegistrationStep } from '../dispatcher-registration-state.service';
import { StationDocument } from 'src/stations/schemas/station.schema';

export type DispatcherDocument = Dispatcher & Document;

@Schema({ timestamps: true })
export class Dispatcher {
  @Prop({ required: true, unique: true })
  phone: string;

  @Prop({})
  name: string;

  @Prop({
    required: true,
    enum: DispatcherRegistrationStep,
    type: String
  })
  currentStep: DispatcherRegistrationStep;

  @Prop({})
  stationCode: string;

  @Prop({ type: Object })
  stationInfo: StationDocument;

  @Prop({ required: true })
  lastUpdated: Date;
}

export const DispatcherSchema = SchemaFactory.createForClass(Dispatcher);
