import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WhatsAppGroup, WhatsAppGroupDocument } from './whatsapp-group.schema';
import { CreateWhatsAppGroupDto, UpdateWhatsAppGroupDto } from './whatsapp-groups.dto';

@Injectable()
export class WhatsAppGroupsService {
  constructor(
    @InjectModel(WhatsAppGroup.name) private groupModel: Model<WhatsAppGroupDocument>,
  ) { }

  async create(createDto: CreateWhatsAppGroupDto): Promise<WhatsAppGroup> {
    return this.groupModel.create(createDto);
  }

  async getGroups(params: {
    page: number;
    limit: number;
    search?: string;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  }) {
    const { page, limit, search, sortBy, sortOrder } = params;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter: any = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Build sort object
    const sort: any = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      this.groupModel.aggregate([
        { $match: filter },
        { $sort: sort },
        { $skip: skip },
        { $limit: limit },
        {
          $addFields: {
            participantsCount: { $size: { $ifNull: ["$participants", []] } }
          }
        },
        { $project: { participants: 0 } } // optional: hide full array
      ]).allowDiskUse(true).exec(),
      this.groupModel.countDocuments(filter),
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

  async findOne(groupId: string): Promise<WhatsAppGroup> {
    const group = await this.groupModel.findOne({ groupId }).exec();
    if (!group) throw new NotFoundException('findOne group not found');
    return group;
  }

  async update(groupId: string, updateDto: UpdateWhatsAppGroupDto): Promise<WhatsAppGroup> {
    const group = await this.groupModel.findOneAndUpdate({ groupId }, updateDto, { new: true, upsert: true }).exec();
    if (!group) throw new NotFoundException('update group not found');
    return group;
  }

  async createOrUpdate(group: CreateWhatsAppGroupDto): Promise<WhatsAppGroup> {
    try {
      return await this.groupModel.findOneAndUpdate({ groupId: group.groupId }, group, { new: true, upsert: true }).exec();
    } catch (error) {
      console.error('Error during upsert:', error);
      throw error;
    }
  }

  async createOrUpdateMany(groups: CreateWhatsAppGroupDto[]): Promise<void> {
    try {
      const bulkOps = groups.map(group => ({
        updateOne: {
          filter: { groupId: group.groupId },
          update: { $set: group },
          upsert: true
        }
      }));
      await this.groupModel.bulkWrite(bulkOps, { ordered: false });
    } catch (error) {
      console.error('Error during bulk upsert:', error);
      throw error;
    }
  }

  async remove(groupId: string): Promise<void> {
    const res = await this.groupModel.deleteOne({ groupId }).exec();
    if (res.deletedCount === 0) throw new NotFoundException('Group not found');
  }

  /**
   * Find all groups with their participants using a cursor for memory efficiency
   * @param batchSize Number of documents to return per batch (default: 100)
   */
  async *findAllWithParticipants(batchSize = 100): AsyncGenerator<WhatsAppGroup[]> {
    let processed = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await this.groupModel
        .find({})
        .skip(processed)
        .limit(batchSize)
        .lean()
        .exec();

      if (batch.length === 0) {
        hasMore = false;
      } else {
        processed += batch.length;
        yield batch;
      }
    }
  }

  /**
   * Count total number of groups
   */
  async countAllGroups(): Promise<number> {
    return this.groupModel.countDocuments({}).exec();
  }

  async removeGroupsByPhone(phone: string, connectedPhones: string[]): Promise<void> {
    const phoneWithSuffix = `${phone}@s.whatsapp.net`;
    const connectedWithSuffix = connectedPhones.map(p => `${p}@s.whatsapp.net`);

    await this.groupModel.deleteMany({
      participants: {
        $elemMatch: { phoneNumber: phoneWithSuffix }
      },
      "participants.phoneNumber": {
        $nin: connectedWithSuffix
      }
    }).exec();
  }
}
