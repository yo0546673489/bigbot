import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Station } from './schemas/station.schema';

@Injectable()
export class StationService {
  private readonly logger = new Logger(StationService.name);

  constructor(
    @InjectModel(Station.name) private stationModel: Model<Station>,
  ) {}

  async generateStationCode(): Promise<string> {
    let code: string;
    let isUnique = false;

    while (!isUnique) {
      // Generate a 6-digit code
      code = Math.floor(100000 + Math.random() * 900000).toString();
      const existingStation = await this.stationModel.findOne({ stationCode: code });
      if (!existingStation) {
        isUnique = true;
      }
    }

    return code;
  }

  async createStation(name: string, phone: string, billingPhone: string, email: string, stationCode: string): Promise<Station> {
    const station = new this.stationModel({
      name,
      billingPhone,
      email,
      stationCode,
      phone,
    });
    return station.save();
  }

  async findByStationCode(stationCode: string): Promise<Station | null> {
    return this.stationModel.findOne({ stationCode }).exec();
  }

  async getStationByPhone(phone: string): Promise<Station | null> {
    return this.stationModel.findOne({ phone }).exec();
  }

  async getStationByArmPhone(phone: string): Promise<Station | null> {
    return this.stationModel.findOne({ arms: { $in: [phone] } }).exec();
  }
} 