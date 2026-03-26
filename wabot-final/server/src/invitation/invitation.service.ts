import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Invitation, InvitationDocument, InvitationStatus } from './schemas/invitation.schema';
import { Driver } from 'src/drivers/schemas/driver.schema';

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(
    @InjectModel(Invitation.name) private invitationModel: Model<InvitationDocument>,
    @InjectModel(Driver.name) private driverModel: Model<Driver>,
  ) { }

  async createInvitation(phone: string): Promise<Invitation> {
    const invitation = await this.invitationModel.create({ phone, status: InvitationStatus.INVITED });
    return invitation;
  }

  async createInvitations(phones: string[]): Promise<Invitation[]> {
    const batchSize = 300;
    const invitations: Invitation[] = [];

    for (let i = 0; i < phones.length; i += batchSize) {
      const batch = phones.slice(i, i + batchSize).map(phone => ({
        phone,
        status: InvitationStatus.PENDING,
      }));

      try {
        const inserted = await this.invitationModel.insertMany(batch, { ordered: false });
        invitations.push(...inserted);
      } catch (error) {
        console.error(`❌ Error inserting batch [${i} - ${i + batchSize}]`, error);
      }
    }

    return invitations;
  }

  async updateDriverInvite(phone: string, data: { status?: InvitationStatus }): Promise<Invitation> {
    const invitation = await this.invitationModel.findOneAndUpdate({ phone }, data, { new: true });
    return invitation;
  }

  async getInvitations(params: {
    page: number;
    limit: number;
    search?: string;
    status?: InvitationStatus;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  }) {
    const { page, limit, search, status, sortBy, sortOrder } = params;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter: any = {};

    if (search) {
      filter.$or = [
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    if (status) {
      filter.status = status;
    }

    // Build sort object
    const sort: any = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      this.invitationModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.invitationModel.countDocuments(filter),
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

  async sendMessage(phone: string): Promise<InvitationDocument | null> {
    const invite = await this.invitationModel.findOne({ phone });
    if (invite.status === InvitationStatus.INVITED) {
      return null;
    }
    invite.status = InvitationStatus.INVITED;
    await invite.save();

    return invite;
  }

  async deleteInvitation(phone: string): Promise<{ success: boolean }> {
    const result = await this.invitationModel.deleteOne({ phone });
    return { success: !!result };
  }

  async findAll(): Promise<Invitation[]> {
    return this.invitationModel.find({}).sort({ createdAt: -1 }).lean().exec();
  }

  streamAll(options?: { batchSize?: number }) {
    const batchSize = options?.batchSize ?? 2000;
    return this.invitationModel
      .find({}, null, { sort: { createdAt: -1 } })
      .lean()
      .cursor({ batchSize });
  }
} 