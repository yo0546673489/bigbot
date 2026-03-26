import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Driver, DriverDocument } from './schemas/driver.schema';
import Redis from 'ioredis';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from 'src/redis';

export enum RegistrationStep {
  INITIAL = 'initial',
  NAME = 'name',
  DOB = 'dayOfBirth',
  ID_PHOTO = 'id_photo',
  VEHICLE = 'vehicle',
  CATEGORY = 'category',
  CLOTHING = 'clothing',
  COMPLETED = 'completed'
}

export interface RegistrationState {
  currentStep: RegistrationStep;
  data: {
    name?: string;
    dob?: string;
    IDPhoto?: string;
    vehicle?: string;
    clothing?: string;
    category?: string;
  };
  lastUpdated: Date;
}

@Injectable()
export class RegistrationStateService {
  private static readonly REG_STATE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

  constructor(
    @InjectModel(Driver.name) private driverModel: Model<DriverDocument>,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {}

  private getKey(phone: string) {
    return `registration:state:${phone}`;
  }

  private reviveState(raw: string | null): RegistrationState | undefined {
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.lastUpdated) {
        parsed.lastUpdated = new Date(parsed.lastUpdated);
      }
      return parsed as RegistrationState;
    } catch {
      return undefined;
    }
  }

  startRegistration(phone: string): RegistrationState {
    const state: RegistrationState = {
      currentStep: RegistrationStep.INITIAL,
      data: {},
      lastUpdated: new Date(),
    };
    const key = this.getKey(phone);
    this.redisClient.set(key, JSON.stringify(state), 'EX', RegistrationStateService.REG_STATE_TTL_SECONDS).catch(() => {});
    return state;
  }

  async getStateAsync(phone: string): Promise<RegistrationState | undefined> {
    const raw = await this.redisClient.get(this.getKey(phone));
    return this.reviveState(raw);
  }

  updateState(phone: string, step: RegistrationStep, data: Partial<Driver>): RegistrationState {
    const currentState: RegistrationState | undefined = undefined;
    if (!currentState) throw new Error('No registration in progress for this phone number');

    // Convert clothing to string if it's a String object
    const processedData = {
      ...data,
      clothing: data.clothing ? String(data.clothing) : undefined
    };

    const updatedState: RegistrationState = {
      currentStep: step,
      data: { ...(currentState?.data || {}), ...processedData },
      lastUpdated: new Date()
    };
    this.redisClient.set(this.getKey(phone), JSON.stringify(updatedState), 'EX', RegistrationStateService.REG_STATE_TTL_SECONDS).catch(() => {});
    return updatedState;
  }

  async updateStateAsync(phone: string, step: RegistrationStep, data: Partial<Driver>): Promise<RegistrationState> {
    const currentState = await this.getStateAsync(phone);
    if (!currentState) {
      throw new Error('No registration in progress for this phone number');
    }
    const processedData = {
      ...data,
      clothing: data.clothing ? String(data.clothing) : undefined
    };
    const updatedState: RegistrationState = {
      currentStep: step,
      data: { ...currentState.data, ...processedData },
      lastUpdated: new Date()
    };
    await this.redisClient.set(this.getKey(phone), JSON.stringify(updatedState), 'EX', RegistrationStateService.REG_STATE_TTL_SECONDS);
    return updatedState;
  }

  async completeRegistration(phone: string): Promise<Driver> {
    const state = await this.getStateAsync(phone);
    if (!state) {
      throw new Error('No registration in progress for this phone number');
    }

    // Create new driver document with phone number
    const driver = new this.driverModel({
      ...state.data,
      phone, // Add phone number to driver data
      isApproved: false, // Requires admin approval
      isActive: false,   // Will be activated after approval
    });

    // Save to database
    const savedDriver = await driver.save();

    // Clear registration state
    await this.redisClient.del(this.getKey(phone));

    return savedDriver;
  }

  cancelRegistration(phone: string): void {
    this.redisClient.del(this.getKey(phone)).catch(() => {});
  }

  isRegistrationInProgress(phone: string): boolean {
    // Without async change of signature, approximate by returning false if key likely absent.
    // Prefer using isRegistrationInProgressAsync for accurate result.
    return false;
  }

  async isRegistrationInProgressAsync(phone: string): Promise<boolean> {
    const exists = await this.redisClient.exists(this.getKey(phone));
    return exists === 1;
  }

  getNextStep(currentStep: RegistrationStep): RegistrationStep | null {
    const steps = Object.values(RegistrationStep);
    const currentIndex = steps.indexOf(currentStep);
    return currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;
  }

  getPreviousStep(currentStep: RegistrationStep): RegistrationStep | null {
    const steps = Object.values(RegistrationStep);
    const currentIndex = steps.indexOf(currentStep);
    return currentIndex > 0 ? steps[currentIndex - 1] : null;
  }
} 