import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateResult } from 'mongoose';
import { DriverMessagePrivate, DriverMessagePrivateDocument } from './schemas/driver-message-private.schema';

@Injectable()
export class DriverMessagePrivateService {
  constructor(
    @InjectModel(DriverMessagePrivate.name)
    private driverMessagePrivateModel: Model<DriverMessagePrivateDocument>,
  ) { }

  async create(data: Partial<DriverMessagePrivate>): Promise<DriverMessagePrivate> {
    const created = new this.driverMessagePrivateModel(data);
    return created.save();
  }

  async findAll(phone?: string): Promise<DriverMessagePrivate[]> {
    const filter = phone ? { phone } : {};
    return this.driverMessagePrivateModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(phone: string): Promise<DriverMessagePrivate | null> {
    return this.driverMessagePrivateModel.findOne({ phone }).exec();
  }

  async update(phone: string, updateData: Partial<DriverMessagePrivate>): Promise<DriverMessagePrivate | null> {
    return this.driverMessagePrivateModel.findOneAndUpdate(
      { phone, type: updateData.type },
      updateData,
      { new: true, upsert: true }
    ).exec();
  }

  async delete(phone: string, router: string): Promise<{ deleted: boolean }> {
    const result = await this.driverMessagePrivateModel.deleteOne({ phone, router }).exec();
    return { deleted: result.deletedCount === 1 };
  }

  async updateMany(phone: string, updateData: Partial<DriverMessagePrivate>): Promise<UpdateResult> {
    return this.driverMessagePrivateModel.updateMany({ phone }, updateData).exec();
  }

  async deleteMany(phone: string): Promise<{ deleted: boolean }> {
    const result = await this.driverMessagePrivateModel.deleteMany({ phone }).exec();
    return { deleted: result.deletedCount > 0 };
  }
}
