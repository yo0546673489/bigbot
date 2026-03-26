import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DriverSearchKeyword, DriverSearchKeywordDocument } from './schemas/driver-search-keyword.schema';

@Injectable()
export class DriverSearchKeywordService {
  constructor(
    @InjectModel(DriverSearchKeyword.name)
    private driverSearchKeywordModel: Model<DriverSearchKeywordDocument>,
  ) { }

  async trackSearch(phone: string, keyword: string): Promise<void> {
    const searchKeyword = await this.driverSearchKeywordModel.findOne({
      phone,
      keyword: keyword,
    });

    if (searchKeyword) {
      searchKeyword.searchCount += 1;
      searchKeyword.lastSearchedAt = new Date();
      await searchKeyword.save();
    } else {
      await this.driverSearchKeywordModel.create({
        phone,
        keyword: keyword,
        searchCount: 1,
        lastSearchedAt: new Date(),
      });
    }
  }

  async getDriverSearchHistory(phone: string): Promise<DriverSearchKeywordDocument[]> {
    return this.driverSearchKeywordModel
      .find({ phone })
      .sort({ lastSearchedAt: -1 })
      .exec();
  }

  /**
   * Create a blocked word for a driver
   * @param phone 
   * @param keyword Hanoi, Haiphong, Saigon, Da Nang
   * @returns 
   */
  async createBlockedWord(phone: string, words: string): Promise<void> {
    const blockedWords = words.split(',');
    const existingBlockedWords = await this.driverSearchKeywordModel
      .findOne({ phone, isBlocked: true })
      .exec();
    if (!existingBlockedWords) {
      await this.driverSearchKeywordModel.create({
        phone,
        keyword: words,
        isBlocked: true,
      });
    } else {
      for (const word of blockedWords) {
        if (!existingBlockedWords.keyword.includes(word)) {
          existingBlockedWords.keyword += `,${word}`;
        }
      }
      await existingBlockedWords.save();
    }
  }

  async getDriverBlockedWords(phone: string): Promise<DriverSearchKeywordDocument[]> {
    return this.driverSearchKeywordModel
      .find({ phone, isBlocked: true })
      .exec();
  }

  async getDriversSearchHistoryCount(keyword: string): Promise<number> {
    return this.driverSearchKeywordModel
      .countDocuments({ keyword })
      .exec();
  }

  async removeAllSearchByPhone(phone: string): Promise<void> {
    await this.driverSearchKeywordModel.deleteMany({ phone });
  }
} 