import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Payment, PaymentDocument, PaymentStatus } from './schemas/payment.schema';
import * as moment from 'moment';
import { Driver } from 'src/drivers/schemas/driver.schema';
import { getTimezone } from 'src/common/utils';
import { REDIS_CLIENT } from 'src/redis/redis.provider';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Driver.name) private driverModel: Model<Driver>,
    @Inject(REDIS_CLIENT) private readonly redisClient: any,
  ) { }

  async create(paymentData: Partial<Payment>): Promise<{ payment: Payment, driver: Driver }> {
    const now = new Date();
    const startDate = now;
    const endDate = moment(now).add(1, 'month').toDate();
    const isRecurring = true;
    const nextPaymentDate = moment(now).add(1, 'month').toDate();

    this.logger.log(`Creating payment for ${paymentData.clientPhone} with data: ${JSON.stringify(paymentData, null, 2)}`);
    const phone = +paymentData.clientPhone; // remove lead zero
    const driver = await this.driverModel.findOne({
      phone: { $regex: `${phone}$`, $options: '' }
    }).exec();
    const status = driver?.phone?.endsWith(phone.toString()) ? PaymentStatus.PAID : PaymentStatus.PENDING;
    const payment = new this.paymentModel({
      ...paymentData,
      startDate,
      endDate,
      isRecurring,
      nextPaymentDate,
      status,
    });

    if (driver) {
      const timezone = getTimezone(driver.language);
      driver.billingEndAt = moment.tz(timezone).add(1, 'month').valueOf();
      const savedDriver = await driver.save();
      // Update Redis cache for driver
      if (savedDriver) {
        await this.redisClient.set(`driver:${driver.phone}`, JSON.stringify(savedDriver));
      }
    }

    return { payment: await payment.save(), driver };
  }

  async getActiveSubscription(ownerId: string, phone: string): Promise<PaymentDocument | null> {
    const now = new Date();
    return this.paymentModel.findOne({
      ownerId,
      clientPhone: phone,
      endDate: { $gt: now },
    }).sort({ endDate: -1 });
  }

  async getPaymentHistory(ownerId: string, phone: string): Promise<PaymentDocument[]> {
    return this.paymentModel.find({
      ownerId,
      clientPhone: phone,
    }).sort({ createdAt: -1 });
  }

  async cancelRecurringPayment(ownerId: string, phone: string): Promise<PaymentDocument | null> {
    const activePayment = await this.getActiveSubscription(ownerId, phone);
    if (activePayment) {
      return this.paymentModel.findByIdAndUpdate(
        activePayment._id,
        {
          isRecurring: false,
          nextPaymentDate: undefined,
        },
        { new: true },
      );
    }
    return null;
  }

  async getPayments(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    method?: string;
    isRecurring?: string;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  }) {
    const { page, limit, search, status, method, isRecurring, sortBy, sortOrder } = params;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter: any = {};

    if (search) {
      filter.$or = [
        { clientName: { $regex: search, $options: 'i' } },
        { clientPhone: { $regex: search, $options: 'i' } },
        { clientEmail: { $regex: search, $options: 'i' } },
        { productName: { $regex: search, $options: 'i' } },
      ];
    }

    if (status) {
      filter.status = status;
    }

    if (method) {
      filter.method = method;
    }

    if (isRecurring !== undefined) {
      filter.isRecurring = isRecurring === 'true';
    }

    // Build sort object
    const sort: any = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      this.paymentModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.paymentModel.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPreviousPage,
    };
  }

  async getPaymentById(id: string): Promise<PaymentDocument | null> {
    return this.paymentModel.findById(id);
  }

  async updatePayment(id: string, updateData: any): Promise<{ payment: PaymentDocument, driver: Driver } | null> {
    const payment = await this.paymentModel.findById(id);
    const phone = +payment.clientPhone; // remove lead zero
    const driver = await this.driverModel.findOne({
      phone: { $regex: `${phone}$`, $options: '' }
    }).exec();
    
    if (!driver) {
      this.logger.error(`Driver not found for phone: ${payment.clientPhone}`);
    }
    const timezone = getTimezone(driver.language);
    driver.billingEndAt = moment.tz(timezone).add(1, 'month').valueOf();
    const savedDriver = await driver.save();
    if (savedDriver) {
      await this.redisClient.set(`driver:${driver.phone}`, JSON.stringify(savedDriver));
    }
    return { payment: await this.paymentModel.findByIdAndUpdate(id, updateData, { new: true }), driver };
  }

  async deletePayment(id: string): Promise<{ success: boolean }> {
    const result = await this.paymentModel.findByIdAndDelete(id);
    return { success: !!result };
  }
} 