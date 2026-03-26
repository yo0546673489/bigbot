import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ride, RideDocument } from './rides.schema';

@Injectable()
export class RidesService {
  constructor(
    @InjectModel(Ride.name) private rideModel: Model<RideDocument>,
  ) {}

  async create(createRideDto: { code: string; message: string; status?: string }) {
    const createdRide = new this.rideModel(createRideDto);
    return createdRide.save();
  }

  async findAll() {
    return this.rideModel.find().exec();
  }

  async findOne(code: string) {
    return this.rideModel.findOne({ code }).exec();
  }

  async update(code: string, updateRideDto: Partial<Ride>) {
    return this.rideModel
      .findOneAndUpdate({ code }, updateRideDto, { new: true })
      .exec();
  }

  async remove(code: string) {
    return this.rideModel.findOneAndDelete({ code }).exec();
  }
}
