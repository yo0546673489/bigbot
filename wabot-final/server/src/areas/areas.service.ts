import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AreaShortcut, AreaShortcutDocument, RelatedArea, RelatedAreaDocument, SupportArea, SupportAreaDocument } from './areas.schema';
import { CreateAreaShortcutDto, CreateRelatedAreaDto, CreateSupportAreaDto, UpdateAreaShortcutDto, UpdateRelatedAreaDto, UpdateSupportAreaDto } from './areas.dto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { DriverWsServer } from '../drivers/driver-ws.server';

@Injectable()
export class AreasService {
  private readonly logger = new Logger(AreasService.name);

  constructor(
    @InjectModel(SupportArea.name) private readonly supportAreaModel: Model<SupportAreaDocument>,
    @InjectModel(AreaShortcut.name) private readonly areaShortcutModel: Model<AreaShortcutDocument>,
    @InjectModel(RelatedArea.name) private readonly relatedAreaModel: Model<RelatedAreaDocument>,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
  ) {}

  // Support Areas CRUD
  async listSupportAreas(query: { page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; }) {
    const { page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const filter: any = {};
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }
    const skip = (page - 1) * limit;
    const sort: any = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [data, total] = await Promise.all([
      this.supportAreaModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      this.supportAreaModel.countDocuments(filter)
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: skip + data.length < total,
      hasPreviousPage: page > 1,
    };
  }

  async createSupportArea(dto: CreateSupportAreaDto) {
    const doc = await this.supportAreaModel.create({ name: dto.name.trim() });
    try { await this.redisClient.sadd('wa:areas:support', doc.name.toLowerCase()); } catch {}
    this.bumpCacheVersion().catch(() => {}); this.broadcastAreasToApps().catch(() => {});
    return doc;
  }

  async updateSupportArea(id: string, dto: UpdateSupportAreaDto) {
    const existing = await this.supportAreaModel.findById(id);
    const updated = await this.supportAreaModel.findByIdAndUpdate(id, dto, { new: true });
    if (updated) {
      try {
        if (existing && dto.name && existing.name.toLowerCase() !== dto.name.toLowerCase()) {
          await this.redisClient.srem('wa:areas:support', existing.name.toLowerCase());
        }
        await this.redisClient.sadd('wa:areas:support', updated.name.toLowerCase());
      } catch {}
    }
    this.bumpCacheVersion().catch(() => {}); this.broadcastAreasToApps().catch(() => {});
    return updated;
  }

  async deleteSupportArea(id: string) {
    const existing = await this.supportAreaModel.findById(id);
    await this.supportAreaModel.findByIdAndDelete(id);
    try { if (existing) await this.redisClient.srem('wa:areas:support', existing.name.toLowerCase()); } catch {}
    this.bumpCacheVersion().catch(() => {}); this.broadcastAreasToApps().catch(() => {});
    return { deleted: true };
  }

  // Shortcuts CRUD
  async listShortcuts(query: { page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; }) {
    const { page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const filter: any = {};
    if (search) {
      filter.$or = [
        { shortName: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (page - 1) * limit;
    const sort: any = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [data, total] = await Promise.all([
      this.areaShortcutModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      this.areaShortcutModel.countDocuments(filter)
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: skip + data.length < total,
      hasPreviousPage: page > 1,
    };
  }

  async createShortcut(dto: CreateAreaShortcutDto) {
    const payload = { shortName: dto.shortName.trim(), fullName: dto.fullName.trim() };
    const doc = await this.areaShortcutModel.create(payload);
    try { await this.redisClient.hset('wa:areas:shortcuts', payload.shortName.toLowerCase(), payload.fullName.toLowerCase()); } catch {}
    this.bumpCacheVersion().catch(() => {}); this.broadcastAreasToApps().catch(() => {});
    return doc;
  }

  async updateShortcut(id: string, dto: UpdateAreaShortcutDto) {
    const existing = await this.areaShortcutModel.findById(id);
    const updated = await this.areaShortcutModel.findByIdAndUpdate(id, dto, { new: true });
    if (updated) {
      try {
        if (existing && dto.shortName && existing.shortName.toLowerCase() !== dto.shortName.toLowerCase()) {
          await this.redisClient.hdel('wa:areas:shortcuts', existing.shortName.toLowerCase());
        }
        const shortKey = (updated.shortName || existing?.shortName || '').toLowerCase();
        const fullVal = (updated.fullName || existing?.fullName || '').toLowerCase();
        if (shortKey) await this.redisClient.hset('wa:areas:shortcuts', shortKey, fullVal);
      } catch {}
    }
    this.bumpCacheVersion().catch(() => {}); this.broadcastAreasToApps().catch(() => {});
    return updated;
  }

  async deleteShortcut(id: string) {
    const existing = await this.areaShortcutModel.findById(id);
    await this.areaShortcutModel.findByIdAndDelete(id);
    try { if (existing) await this.redisClient.hdel('wa:areas:shortcuts', existing.shortName.toLowerCase()); } catch {}
    this.bumpCacheVersion().catch(() => {}); this.broadcastAreasToApps().catch(() => {});
    return { deleted: true };
  }

  // Related Areas CRUD
  async listRelatedAreas(query: { page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; }) {
    const { page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const filter: any = {};
    if (search) {
      filter.$or = [
        { main: { $regex: search, $options: 'i' } },
        { related: { $elemMatch: { $regex: search, $options: 'i' } } },
      ];
    }
    const skip = (page - 1) * limit;
    const sort: any = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [data, total] = await Promise.all([
      this.relatedAreaModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      this.relatedAreaModel.countDocuments(filter)
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: skip + data.length < total,
      hasPreviousPage: page > 1,
    };
  }

  async upsertRelatedArea(dto: CreateRelatedAreaDto) {
    const doc = await this.relatedAreaModel.findOneAndUpdate(
      { main: dto.main.trim() },
      { $set: { main: dto.main.trim(), related: dto.related.map(s => s.trim()) } },
      { new: true, upsert: true }
    );
    await this.rebuildRelatedRedis();
    this.bumpCacheVersion().catch(() => {}); this.broadcastAreasToApps().catch(() => {});
    return doc;
  }

  async updateRelatedArea(id: string, dto: UpdateRelatedAreaDto) {
    const updated = await this.relatedAreaModel.findByIdAndUpdate(id, dto, { new: true });
    await this.rebuildRelatedRedis();
    this.bumpCacheVersion().catch(() => {}); this.broadcastAreasToApps().catch(() => {});
    return updated;
  }

  async deleteRelatedArea(id: string) {
    await this.relatedAreaModel.findByIdAndDelete(id);
    await this.rebuildRelatedRedis();
    this.bumpCacheVersion().catch(() => {}); this.broadcastAreasToApps().catch(() => {});
    return { deleted: true };
  }

  // Loaders for WhatsAppService (DB side, still useful elsewhere)
  async getSupportAreasMap(): Promise<Map<string, string>> {
    const all = await this.supportAreaModel.find().lean();
    const map = new Map<string, string>();
    for (const a of all) {
      map.set(a.name.toLowerCase(), a.name.toLowerCase());
    }
    return map;
  }

  async getShortcutsMap(): Promise<Map<string, string>> {
    const all = await this.areaShortcutModel.find().lean();
    const map = new Map<string, string>();
    for (const s of all) {
      map.set(s.shortName.toLowerCase(), s.fullName.toLowerCase());
    }
    return map;
  }

  async getRelatedAreasMap(): Promise<Map<string, string[]>> {
    const all = await this.relatedAreaModel.find().lean();
    const map = new Map<string, string[]>();
    for (const r of all) {
      map.set(r.main.toLowerCase(), (r.related || []).map(x => x.toLowerCase()));
    }
    return map;
  }

  /** Bump the Redis cache version so whatsappMgn.service.ts reloads its in-memory areas cache. */
  private async bumpCacheVersion(): Promise<void> {
    try { await this.redisClient.set('wa:areas:cache_v', Date.now().toString()); } catch {}
  }

  /** Broadcast updated areas to all connected Android apps via WebSocket. */
  async broadcastAreasToApps(): Promise<void> {
    try {
      const [shortcuts, supportAreas] = await Promise.all([
        this.areaShortcutModel.find({}, { shortName: 1, fullName: 1, lat: 1, lng: 1, _id: 0 }).lean(),
        this.supportAreaModel.find({}, { name: 1, _id: 0 }).lean(),
      ]);
      const payload = {
        shortcuts: shortcuts.map((s: any) => ({ shortName: s.shortName || '', fullName: s.fullName || '', lat: s.lat ?? null, lng: s.lng ?? null })),
        supportAreas: supportAreas.map((a: any) => a.name || ''),
        neighborhoods: [],
      };
      DriverWsServer.getInstance().broadcast('areas_updated', payload);
      this.logger.log(`Broadcast areas_updated to ${DriverWsServer.getInstance().connectedPhones.length} apps`);
    } catch (e: any) {
      this.logger.warn(`broadcastAreasToApps failed: ${e?.message}`);
    }
  }

  // Redis builders
  async rebuildRedisFromDb() {
    // Clear keys
    try {
      await this.redisClient.del('wa:areas:support', 'wa:areas:shortcuts', 'wa:areas:related', 'wa:areas:related_main_to_list');
    } catch {}

    // Support areas
    try {
      const areas = await this.supportAreaModel.find().lean();
      if (areas.length) {
        await this.redisClient.sadd('wa:areas:support', ...areas.map(a => a.name.toLowerCase()));
      }
    } catch (e) { this.logger.warn(`Failed to rebuild support areas in Redis: ${e?.message || e}`); }

    // Shortcuts
    try {
      const shortcuts = await this.areaShortcutModel.find().lean();
      if (shortcuts.length) {
        const flat: string[] = [];
        for (const s of shortcuts) {
          flat.push(s.shortName.toLowerCase(), s.fullName.toLowerCase());
        }
        if (flat.length) await this.redisClient.hset('wa:areas:shortcuts', ...flat);
      }
    } catch (e) { this.logger.warn(`Failed to rebuild shortcuts in Redis: ${e?.message || e}`); }

    // Related
    await this.rebuildRelatedRedis();
  }

  private async rebuildRelatedRedis() {
    try {
      await this.redisClient.del('wa:areas:related', 'wa:areas:related_main_to_list');
      const relatedAll = await this.relatedAreaModel.find().lean();
      const relatedFlat: string[] = [];
      for (const r of relatedAll) {
        const mainLc = r.main.toLowerCase();
        const rels = (r.related || []).map(x => x.toLowerCase());
        // main -> list
        await this.redisClient.hset('wa:areas:related_main_to_list', mainLc, JSON.stringify(rels));
        // related -> main
        for (const rel of rels) {
          relatedFlat.push(rel, mainLc);
        }
      }
      if (relatedFlat.length) await this.redisClient.hset('wa:areas:related', ...relatedFlat);
    } catch (e) { this.logger.warn(`Failed to rebuild related areas in Redis: ${e?.message || e}`); }
  }

  // Seeders from files
  async seedFromFilesIfEmpty() {
    const [areasCount, shortcutsCount, relatedCount] = await Promise.all([
      this.supportAreaModel.estimatedDocumentCount(),
      this.areaShortcutModel.estimatedDocumentCount(),
      this.relatedAreaModel.estimatedDocumentCount(),
    ]);

    if (areasCount === 0) {
      await this.seedSupportAreasFromFile();
    }
    if (shortcutsCount === 0) {
      await this.seedShortcutsFromFile();
    }
    if (relatedCount === 0) {
      await this.seedRelatedAreasFromFile();
    }

    await this.rebuildRedisFromDb();
  }

  private async seedSupportAreasFromFile() {
    try {
      const filePath = path.join(process.cwd(), 'support-areas.txt');
      const data = await fs.readFile(filePath, 'utf8');
      const items = data.split('\n').map(l => l.trim()).filter(Boolean);
      if (items.length) {
        await this.supportAreaModel.bulkWrite(items.map(name => ({
          updateOne: {
            filter: { name },
            update: { $set: { name } },
            upsert: true,
          }
        })));
      }
      this.logger.log(`Seeded ${items.length} support areas`);
    } catch (err) {
      this.logger.error('Failed to seed support areas from file', err as any);
    }
  }

  private async seedShortcutsFromFile() {
    try {
      const filePath = path.join(process.cwd(), 'support-areas-shortcut.txt');
      const data = await fs.readFile(filePath, 'utf8');
      const items = data.split('\n').map(l => l.trim()).filter(Boolean);
      const pairs: { shortName: string; fullName: string }[] = [];
      for (const line of items) {
        const parts = line.split(' - ');
        if (parts.length >= 2) {
          const shortName = parts[0].trim();
          const fullName = parts.slice(1).join(' - ').trim();
          pairs.push({ shortName, fullName });
        }
      }
      if (pairs.length) {
        await this.areaShortcutModel.bulkWrite(pairs.map(p => ({
          updateOne: {
            filter: { shortName: p.shortName },
            update: { $set: p },
            upsert: true,
          }
        })));
      }
      this.logger.log(`Seeded ${pairs.length} shortcuts`);
    } catch (err) {
      this.logger.error('Failed to seed shortcuts from file', err as any);
    }
  }

  private async seedRelatedAreasFromFile() {
    try {
      const filePath = path.join(process.cwd(), 'related-areas.txt');
      const data = await fs.readFile(filePath, 'utf8');
      const lines = data.split('\n');
      let currentMain = '';
      const map = new Map<string, string[]>();
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('[') && line.endsWith(']')) {
          currentMain = line.slice(1, -1).trim();
          if (!map.has(currentMain)) map.set(currentMain, []);
        } else if (currentMain) {
          map.get(currentMain)!.push(line);
        }
      }

      const ops = Array.from(map.entries()).map(([main, related]) => ({
        updateOne: {
          filter: { main },
          update: { $set: { main, related } },
          upsert: true,
        }
      }));
      if (ops.length) {
        await this.relatedAreaModel.bulkWrite(ops);
      }
      this.logger.log(`Seeded ${ops.length} related areas`);
    } catch (err) {
      this.logger.error('Failed to seed related areas from file', err as any);
    }
  }
} 