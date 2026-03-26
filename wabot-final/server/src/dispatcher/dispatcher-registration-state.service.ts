import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Dispatcher } from './schemas/dispatcher.schema';

export enum DispatcherRegistrationStep {
  INITIAL = 'INITIAL',
  FULL_NAME = 'FULL_NAME',
  STATION_CODE = 'STATION_CODE',
  CONFIRM_STATION = 'CONFIRM_STATION',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED'
}

@Injectable()
export class DispatcherRegistrationStateService {
  constructor(
    @InjectModel(Dispatcher.name) private stateModel: Model<Dispatcher>
  ) {}

  async startRegistration(phone: string): Promise<Dispatcher> {
    const state = {
      phone,
      currentStep: DispatcherRegistrationStep.FULL_NAME,
      data: {},
      lastUpdated: new Date()
    };
    
    const createdState = await new this.stateModel(state).save();
    return createdState.toObject();
  }

  async getState(phone: string): Promise<Dispatcher | null> {
    const state = await this.stateModel.findOne({ phone }).exec();
    return state?.toObject() || null;
  }

  async updateState(
    phone: string,
    step: DispatcherRegistrationStep,
    data?: Partial<Dispatcher>
  ): Promise<Dispatcher | null> {
    if (!data) {
      return await this.stateModel.findOneAndUpdate(
        { phone },
        { 
          currentStep: step,
          lastUpdated: new Date() 
        },
        { new: true }
      ).exec();
    }
    return await this.stateModel.findOneAndUpdate(
      { phone },
      { 
        currentStep: step,
        $set: { ...data },
        lastUpdated: new Date() 
      },
      { new: true }
    ).exec();
  }

  async clearState(phone: string): Promise<void> {
    await this.stateModel.deleteOne({ phone }).exec();
  }

  async isRegistrationInProgress(phone: string): Promise<boolean> {
    const state = await this.getState(phone);
    return !!state;
  }
}
