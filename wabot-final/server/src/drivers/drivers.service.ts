import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.provider';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Driver } from './schemas/driver.schema';
import { GetDriversDto } from './dto/get-drivers.dto';
import { PaginatedDriversResponse } from './dto/get-drivers-response.dto';
import { DriverSortField, SortOrder } from './dto/get-drivers.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { LocalizationService } from 'src/common/localization/localization.service';
import { WhatsAppMessagingService } from 'src/services/whatsapp-messaging.service';
import { ElasticsearchService } from 'src/shared/elasticsearch/elasticsearch.service';

@Injectable()
export class DriversService {
  constructor(
    @InjectModel(Driver.name) private driverModel: Model<Driver>,
    private localizationService: LocalizationService,
    private whatsAppMessagingService: WhatsAppMessagingService,
    @Inject(REDIS_CLIENT) private readonly redisClient: any,
    private elasticsearchService: ElasticsearchService,
  ) { }

  async findByPhone(phone: string): Promise<Driver | null> {
    return this.driverModel.findOne({ phone }).exec();
  }

  async create(driverData: Partial<Driver>): Promise<Driver> {
    const createdDriver = new this.driverModel(driverData);
    return createdDriver.save();
  }

  async update(phone: string, driverData: Partial<Driver>): Promise<Driver | null> {
    const updatedDriver = await this.driverModel.findOneAndUpdate(
      { phone },
      { $set: driverData },
      { new: true }
    ).exec();
    if (updatedDriver) {
      await this.redisClient.set(`driver:${phone}`, JSON.stringify(updatedDriver));
    }
    return updatedDriver;
  }

  async findAll(query: GetDriversDto): Promise<PaginatedDriversResponse> {
    const {
      search,
      vehicle,
      clothing,
      isApproved,
      isActive,
      sortBy = DriverSortField.CREATED_AT,
      sortOrder = SortOrder.DESC,
      page = 1,
      limit = 10,
    } = query;

    // Build filter
    const filter: any = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { vehicleNumber: { $regex: search, $options: 'i' } },
      ];
    }
    if (vehicle) filter.vehicle = vehicle;
    if (clothing) filter.clothing = clothing;
    if (typeof isApproved === 'boolean') filter.isApproved = isApproved;
    if (typeof isActive === 'boolean') filter.isActive = isActive;

    // Calculate pagination
    const skip = (page - 1) * limit;
    const total = await this.driverModel.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    // Build sort
    const sort: any = {};
    sort[sortBy] = sortOrder === SortOrder.ASC ? 1 : -1;

    // Get drivers
    const drivers = await this.driverModel
      .find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .exec();

    return {
      data: drivers,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  async updateDriver(phone: string, updateDriverDto: UpdateDriverDto): Promise<Driver> {
    const driver = await this.driverModel.findOne({ phone });
    if (!driver) {
      throw new NotFoundException(`Driver with phone ${phone} not found`);
    }

    // Only update the fields that are provided
    if (updateDriverDto.isApproved !== undefined) {
      driver.isApproved = updateDriverDto.isApproved;
    }
    if (updateDriverDto.isActive !== undefined) {
      driver.isActive = updateDriverDto.isActive;
    }
    if (updateDriverDto.ignorePayment !== undefined) {
      driver.ignorePayment = updateDriverDto.ignorePayment;
    }

    const savedDriver = await driver.save();
    await this.redisClient.set(`driver:${phone}`, JSON.stringify(savedDriver));
    return savedDriver;
  }

  async sendApprovalMessage(phone: string): Promise<Driver> {
    try {
      const driver = await this.driverModel.findOne({ phone });
      if (!driver) {
        throw new NotFoundException(`Driver with phone ${phone} not found`);
      }
      driver.isApproved = !driver.isApproved;
      driver.isActive = driver.isApproved;
      driver.isBusy = true;
      if (driver.isApproved) {
        const msg = `${this.localizationService.getMessage('driverApprovedMessage', driver.language)}

${this.localizationService.getMessage('keyWordSignAppName', driver.language)}

${this.localizationService.getMessage('driverApprovedMessageAskMethod', driver.language)}`
        await this.whatsAppMessagingService.sendInteractiveMessage({
          phone: driver.phone,
          language: driver.language,
          message: msg,
          buttons: [{
            id: 'driverContinueRegistrationButtonRegular',
            title: this.localizationService.getMessage('driverContinueRegistrationButtonRegular', driver.language)
          }, {
            id: 'driverContinueRegistrationButtonPremium',
            title: this.localizationService.getMessage('driverContinueRegistrationButtonPremium', driver.language)
          }]
        });
        this.elasticsearchService.logMessage(phone, msg, DriversService.name);
      }
      const savedDriver = await driver.save();
      await this.redisClient.set(`driver:${phone}`, JSON.stringify(savedDriver.toObject()));
      return savedDriver.toObject();
    } catch (error) {
      console.error('Error sending approval message:', error);
      throw error;
    }
  }

  async sendMessage(phone: string, message: string): Promise<{ success: boolean }> {
    if (phone === 'all') {
      const drivers = await this.driverModel.find({});
      for (const driver of drivers) {
        await this.whatsAppMessagingService.sendTextMessage({
          phone: driver.phone,
          text: message
        });
      }
      this.elasticsearchService.logMessage(phone, message, DriversService.name);
      return { success: true };
    }
    
    const driver = await this.driverModel.findOne({ phone });
    if (!driver) {
      throw new NotFoundException(`Driver with phone ${phone} not found`);
    }
    await this.whatsAppMessagingService.sendTextMessage({
      phone: driver.phone,
      text: message
    });

    return { success: true };
  }

  async deleteDriver(phone: string): Promise<{ success: boolean }> {
    const driver = await this.driverModel.findOne({ phone });
    if (!driver) {
      throw new NotFoundException(`Driver with phone ${phone} not found`);
    }
    await driver.deleteOne();
    return { success: true };
  }
} 