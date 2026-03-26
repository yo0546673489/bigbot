import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DriverMessageTracker, DriverMessageTrackerDocument } from './schemas/driver-message-tracker.schema';

@Injectable()
export class DriverMessageTrackerService {
  constructor(
    @InjectModel(DriverMessageTracker.name)
    private driverMessageTrackerModel: Model<DriverMessageTrackerDocument>,
  ) {}

  /**
   * Track a message from a sender
   * @param phone Driver's phone number
   * @param senderPhone Sender's phone number
   * @param messageBody Message content
   */
  async trackMessage(phone: string, senderPhone: string, messageBody: string): Promise<void> {
    try {
      const messageHash = DriverMessageTracker.hashMessage(messageBody);
      await this.driverMessageTrackerModel.findOneAndUpdate(
        { phone, senderPhone, messageHash },
        { 
          phone,
          senderPhone,
          messageHash,
          createdAt: new Date()
        },
        { upsert: true }
      );
    } catch (error) {
      // If there's a duplicate key error, we can ignore it as it means the message is already tracked
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  /**
   * Get all tracked messages for a driver
   * @param phone Driver's phone number
   */
  async getTrackedMessages(phone: string): Promise<DriverMessageTrackerDocument[]> {
    return this.driverMessageTrackerModel
      .find({ phone })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Get tracked message details
   * @param phone Driver's phone number
   * @param messageBody Message content
   */
  async getTrackedMessage(phone: string, senderPhone: string, messageBody: string): Promise<DriverMessageTrackerDocument | null> {
    const messageHash = DriverMessageTracker.hashMessage(messageBody);
    return this.driverMessageTrackerModel
      .findOne({ phone, senderPhone, messageHash })
      .exec();
  }

  /**
   * Remove tracked message
   * @param phone Driver's phone number
   * @param messageBody Message content
   */
  async removeTrackedMessage(phone: string, messageBody: string): Promise<void> {
    const messageHash = DriverMessageTracker.hashMessage(messageBody);
    await this.driverMessageTrackerModel
      .deleteOne({ phone, messageHash })
      .exec();
  }

  /**
   * Remove all tracked messages for a driver
   * @param phone Driver's phone number
   */
  async removeAllTrackedMessages(phone: string): Promise<void> {
    await this.driverMessageTrackerModel
      .deleteMany({ phone })
      .exec();
  }
} 