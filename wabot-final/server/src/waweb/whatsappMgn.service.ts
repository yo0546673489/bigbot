import { Injectable, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Driver } from '../drivers/schemas/driver.schema';
import { LocalizationService } from 'src/common/localization/localization.service';
import { DriverSearchKeywordService } from '../drivers/driver-search-keyword.service';
import {
  extractPhoneAndTextFromWaMeLink,
  extractRelevantLinkFromMessage,
  fixBoldMultiLine,
  getLanguageByPhoneNumber,
  getMainMenuButtons,
  isDriverEligible,
  isInTrial,
  isNeedToPay,
  toLocalPhoneNumber,
  getOriginAndDestination,
} from '../common/utils';
import { DriverMessageTrackerService } from '../drivers/driver-message-tracker.service';
import { Groq } from 'groq-sdk';
import { WhatsAppMessagingService } from 'src/services/whatsapp-messaging.service';
import { DriverMessagePrivate, MessageType } from 'src/drivers/schemas/driver-message-private.schema';
import { DriverSearchKeywordDocument } from 'src/drivers/schemas/driver-search-keyword.schema';
import Redis from 'ioredis';
import { ElasticsearchService } from 'src/shared/elasticsearch/elasticsearch.service';
import { WhatsAppGroupsService } from 'src/whatsapp-groups/whatsapp-groups.service';
import { AreasService } from 'src/areas/areas.service';
import { WabotService } from 'src/services/wabot.service';
import { Queue, Worker } from 'bullmq';

// ✅ FIX 8: In-memory areas cache to avoid 4 Redis calls per message
interface AreasCache {
  supportAreas: string[];
  shortcuts: Record<string, string>;
  relatedToMain: Record<string, string>;
  mainToRelatedList: Record<string, string[]>;
  expiresAt: number;
}

@Injectable()
export class WhatsappServiceMgn implements OnModuleInit {
  private readonly logger = new Logger(WhatsappServiceMgn.name);
  private groq = new Groq({ apiKey: this.configService.get('GROQ_API_KEY') });
  private readonly specialRouterName = [
    this.localizationService.getMessage('specialRouterDelivery', 'he'),
    this.localizationService.getMessage('specialRouterDeliveries', 'he')
  ];

  private specialGroup = `120363024226519232@g.us`;
  private sendRegularMessageQueues = new Map<string, Promise<void>>();
  private armConnectedQueue: Queue;
  private messageProcessingQueue: Queue;

  // ✅ FIX 8: In-memory cache for areas data (avoids 4 Redis calls per message)
  private areasCache: AreasCache | null = null;
  private readonly AREAS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Driver.name) private driverModel: Model<Driver>,
    @InjectModel(DriverMessagePrivate.name) private driverMessagePrivateModel: Model<DriverMessagePrivate>,
    private readonly localizationService: LocalizationService,
    private readonly driverSearchKeywordService: DriverSearchKeywordService,
    private readonly driverMessageTrackerService: DriverMessageTrackerService,
    private readonly whatsAppMessagingService: WhatsAppMessagingService,
    private readonly elasticsearchService: ElasticsearchService,
    private readonly whatsappGroupsService: WhatsAppGroupsService,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
    private readonly areasService: AreasService,
    private readonly wabotService: WabotService,
  ) {
    this.armConnectedQueue = new Queue('armConnectedQueue', { connection: this.redisClient });
    this.messageProcessingQueue = new Queue('messageProcessingQueue', {
      connection: this.redisClient,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }
    });
  }

  async onModuleInit() {
    try { await this.areasService.seedFromFilesIfEmpty(); } catch (e) { this.logger.warn(`Areas seed failed: ${e?.message}`); }
    try { await this.areasService.rebuildRedisFromDb(); } catch (e) { this.logger.warn(`Areas Redis rebuild failed: ${e?.message}`); }

    try {
      const [supportCount, shortcutsCount, relatedCount] = await Promise.all([
        this.redisClient.scard('wa:areas:support'),
        this.redisClient.hlen('wa:areas:shortcuts'),
        this.redisClient.hlen('wa:areas:related'),
      ]);
      this.logger.log(`Areas in Redis -> support: ${supportCount}, shortcuts: ${shortcutsCount}, related: ${relatedCount}`);
    } catch { }

    this.setAllDriversCache();
    this.startMessageProcessingWorker();
  }

  // ✅ FIX 8: Cached areas loader - loads from Redis once, caches in memory for 5 minutes
  private async getAreasData(): Promise<AreasCache> {
    const now = Date.now();
    if (this.areasCache && this.areasCache.expiresAt > now) {
      return this.areasCache;
    }

    // Load all 4 Redis structures in parallel
    const [rawSupport, rawShortcuts, rawRelated, rawMainToList] = await Promise.all([
      this.redisClient.smembers('wa:areas:support').catch(() => []),
      this.redisClient.hgetall('wa:areas:shortcuts').catch(() => ({})),
      this.redisClient.hgetall('wa:areas:related').catch(() => ({})),
      this.redisClient.hgetall('wa:areas:related_main_to_list').catch(() => ({})),
    ]);

    const mainToRelatedList: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(rawMainToList || {})) {
      try { mainToRelatedList[k] = JSON.parse(v as string); } catch { mainToRelatedList[k] = []; }
    }

    this.areasCache = {
      supportAreas: rawSupport,
      shortcuts: rawShortcuts || {},
      relatedToMain: rawRelated || {},
      mainToRelatedList,
      expiresAt: now + this.AREAS_CACHE_TTL_MS,
    };

    return this.areasCache;
  }

  // Invalidate areas cache when areas are updated
  invalidateAreasCache() {
    this.areasCache = null;
  }

  async handleGroup(group: any) {
    await this.whatsappGroupsService.createOrUpdate({
      groupId: group.jid,
      name: group.name,
      description: group.description,
      participants: group.participants.map(p => ({
        jid: p.jid,
        lid: p.lid,
        phoneNumber: p.phoneNumber,
        isAdmin: p.isAdmin,
        isSuperAdmin: p.isSuperAdmin,
      })),
    });
  }

  async getConnectionStatus(): Promise<{ phone: string; isHealthy: boolean; }[]> {
    const statusCacheKey = 'wa:connected_phones';
    const statusCache = await this.redisClient.get(statusCacheKey);
    if (statusCache) {
      return JSON.parse(statusCache);
    }
    const status = await this.wabotService.getStatus();
    await this.redisClient.set(statusCacheKey, JSON.stringify(status), 'EX', 10 * 60);
    return status;
  }

  async handleGroupCreated(group: any) {
    await this.whatsappGroupsService.createOrUpdate({
      groupId: group.jid,
      name: group.name,
      description: group.description,
      participants: group.participants.map(p => ({
        jid: p.jid,
        lid: p.lid,
        phoneNumber: p.phoneNumber,
        isAdmin: p.isAdmin,
        isSuperAdmin: p.isSuperAdmin,
      })),
    });
  }

  async postConnectionStatus(event: string, phone: string) {
    if (event === 'Connected' || event === 'Disconnected' || event === 'LoggedOut') {
      await this.redisClient.del('wa:connected_phones');
    }
    if (event === 'LoggedOut') {
      const status = await this.wabotService.getStatus() || [];
      const connectedPhones = status.map(p => p.phone);
      await this.whatsappGroupsService.removeGroupsByPhone(phone, connectedPhones);
    }
    if (event === 'Connected') {
      await this.onArmConnected(phone, getLanguageByPhoneNumber(phone));
    }
  }

  async onArmConnected(armPhone: string, language: string): Promise<void> {
    await this.armConnectedQueue.add('processArmConnected', { armPhone, language }, {
      removeOnComplete: true,
      removeOnFail: true,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  async queueMessageForProcessing(phone: string, payload: any): Promise<void> {
    const now = Date.now();
    const messageTimestamp = +payload.timestamp * 1000;
    const messageAge = now - messageTimestamp;

    if (messageAge < 2000) {
      setImmediate(() => this.handleIncomingMessage(phone, payload));
      return;
    }

    await this.messageProcessingQueue.add('processMessage', { phone, payload, timestamp: now }, {
      priority: 1,
      delay: 0,
    });
  }

  private startMessageProcessingWorker(): void {
    const worker = new Worker('messageProcessingQueue', async (job) => {
      const { data } = job;
      let jobData: any;
      if (typeof data === 'string') {
        jobData = JSON.parse(data);
      } else {
        jobData = data;
      }

      const jobName = jobData.jobName || 'processMessage';

      if (jobName === 'processMessage') {
        const { phone, payload } = jobData;
        await this.handleIncomingMessage(phone, payload);
      } else if (jobName === 'processWhatsAppMessage') {
        await this.handleWhatsAppMessageFromBot(jobData);
      } else {
        this.logger.warn(`Unknown job type: ${jobName}`);
      }
    }, {
      connection: this.redisClient,
      concurrency: 500,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    });

    worker.on('failed', (job, err) => {
      this.logger.error(`Message processing job ${job?.id} failed:`, err);
    });
  }

  async getPairingCodeForUI(phone: string): Promise<string> {
    return await this.wabotService.getPairingCode(phone);
  }

  async sendPairingCodeToPhone(phone: string) {
    const language = getLanguageByPhoneNumber(phone);
    try {
      const pairingCode = await this.wabotService.getPairingCode(phone);
      if (!pairingCode) return;
      const msg = `${this.localizationService.getMessage('whatsappReconnectionRequired', language)}\n\n${this.localizationService.getMessage('whatsappReconnectionMessage', language)}\n\n${this.localizationService.getMessage('whatsappPairingCode', language).replace('{pairingCode}', pairingCode)}\n\n${this.localizationService.getMessage('whatsappReconnectInstructions', language)}`;
      await this.whatsAppMessagingService.sendTextMessage({ phone, text: msg });
    } catch (error) {
      this.logger.error(`Error sending pairing code to ${phone}:`, error);
    }
  }

  async formatWhatsAppMessage(rawMessage: string) {
    try {
      const base64Message = Buffer.from(rawMessage).toString('base64');
      const messageKey = `groq:${base64Message}`;
      const existMessage = await this.redisClient.get(messageKey);
      if (existMessage) return existMessage;

      const completion = await this.groq.chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'system',
            content: `You are a strict Hebrew message formatter. Only respond in Hebrew. Never explain anything.

Formatting rules:
1. Remove all phone numbers, links (like wa.me), and any contact-related text.
2. Remove lines that contain the word "סדרן" or "לשאלות בלבד".
3. Remove lines that begin with the ">" character (quoted text).
4. Remove any line that includes text inside backticks (\`...\`).
5. Never alter the text of valid lines — preserve numbers, prices, symbols (like ש), and spacing exactly as they appear. Only remove entire lines when they match a filtering rule.
6. Do NOT add or invent any new lines or content, including emojis or decorations like 🔥 or ⚡ unless they exist in the original message.
7. Return only the original lines that remain after filtering, in their original order.
8. Do not summarize or explain anything.

Output should be the cleaned lines only, in plain text.
`
          },
          { role: 'user', content: rawMessage },
        ],
      });

      const result = completion.choices[0].message.content.trim();
      await this.redisClient.set(messageKey, result, 'EX', 60 * 60); // 1 hour cache
      return result;
    } catch (error) {
      this.logger.error(error.message || error);
    }
    return null;
  }

  async validateSearchKeyword(phone: string, originDestination: string) {
    // Redis cache for driver search history
    let trackSearchKeywordData = await this.redisClient.get(`driverSearchHistory:${phone}`);
    let trackSearchKeyword: DriverSearchKeywordDocument[];
    if (trackSearchKeywordData) {
      trackSearchKeyword = JSON.parse(trackSearchKeywordData);
    } else {
      trackSearchKeyword = await this.driverSearchKeywordService.getDriverSearchHistory(phone);
      if (trackSearchKeyword) {
        await this.redisClient.set(`driverSearchHistory:${phone}`, JSON.stringify(trackSearchKeyword), 'EX', 30 * 60);
      }
    }

    const [origin, destination] = originDestination.split('_');

    // ✅ FIX 6: Load areas data from in-memory cache (not Redis per call)
    const areasData = await this.getAreasData();
    const { shortcuts, relatedToMain, mainToRelatedList } = areasData;

    const normalize = (area: string): string => {
      const key = area.toLowerCase();
      return shortcuts[key] || key;
    };

    const isRelated = (area: string, targetArea: string): boolean => {
      const areaNorm = normalize(area);
      const targetNorm = normalize(targetArea);
      const relList = mainToRelatedList[targetNorm];
      if (relList?.includes(areaNorm)) return true;
      const mainOfArea = relatedToMain[areaNorm];
      if (mainOfArea && mainOfArea === targetNorm) return true;
      return false;
    };

    const matchAreas = (area1: string, area2: string): boolean => {
      const norm1 = normalize(area1);
      const norm2 = normalize(area2);
      if (norm1 === norm2) return true;
      if (isRelated(area1, area2)) return true;
      if (isRelated(area2, area1)) return true;
      return false;
    };

    for (const keyword of trackSearchKeyword) {
      const parts = keyword.keyword.split('_');
      if (parts.length === 2) {
        const [driverOrigin, driverDestination] = parts;
        if (matchAreas(driverOrigin, origin) && matchAreas(driverDestination, destination)) {
          return keyword;
        }
      } else {
        const driverArea = parts[0];
        if (matchAreas(driverArea, origin)) {
          return keyword;
        }
      }
    }
    return undefined;
  }

  private async shouldHaveMinimumCitiesNumber(message: string) {
    const originAndDestination = await getOriginAndDestination(message, this.redisClient, await this.getAreasData());
    if (!originAndDestination) return '';
    const words = originAndDestination.split('_');
    if (words.length >= 2) return words.join('_');
    return '';
  }

  // Cache all approved drivers in Redis with key `driver:${phone}`
  private async setAllDriversCache() {
    const activeDrivers = await this.driverModel.find({ isApproved: true }).lean().exec();
    const pipeline = this.redisClient.pipeline();
    for (const driver of activeDrivers) {
      pipeline.set(`driver:${driver.phone}`, JSON.stringify(driver));
    }
    await pipeline.exec(); // ✅ Batch all SET operations in one round-trip

    setInterval(async () => {
      const drivers = await this.driverModel.find({ isApproved: true }).lean().exec();
      const pipe = this.redisClient.pipeline();
      for (const driver of drivers) {
        pipe.set(`driver:${driver.phone}`, JSON.stringify(driver));
      }
      await pipe.exec();
    }, 10 * 60 * 1000);
  }

  private async getAllDriversFromRedis(): Promise<Driver[]> {
    const keys = await this.redisClient.keys('driver:*');
    if (keys.length === 0) return [];
    const drivers = await this.redisClient.mget(...keys);
    return drivers.filter(Boolean).map(d => JSON.parse(d));
  }

  private async getDriversAndConnectionStatus(): Promise<{ drivers: Driver[], connectedPhones: Set<string> }> {
    const [allDrivers, connectedPhones] = await Promise.all([
      this.getAllDriversFromRedis(),
      this.getConnectionStatus()
    ]);

    const connectedPhonesSet = new Set(
      connectedPhones.filter(cp => cp.isHealthy).map(cp => cp.phone)
    );

    return { drivers: allDrivers, connectedPhones: connectedPhonesSet };
  }

  private async sendFormatMessageRegular(phone: string, obj: any, language: string, searchKeyword: DriverSearchKeywordDocument, originAndDestination: string) {
    let msgTemplate = `${this.localizationService.getMessage('newRidesMessage', language)}
${fixBoldMultiLine(obj.body)}
\u200F${this.localizationService.getMessage('senderName', language)} ${obj.fromName}
\u200F${this.localizationService.getMessage('senderPhone', language)} ${toLocalPhoneNumber(obj.senderPhone)}
\u200F${this.localizationService.getMessage('groupName', language)} ${obj.groupName}
${this.localizationService.getMessage('keyWordSignAppName', language)}`;

    let msgTrack = `${this.localizationService.getMessage('newRidesMessage', language)}
${fixBoldMultiLine(obj.body)}`;

    const waLink = extractRelevantLinkFromMessage(obj.body, searchKeyword.keyword.split('_'));
    if (waLink) {
      const { phoneNumber, messageText } = extractPhoneAndTextFromWaMeLink(waLink) || {};
      if (!phoneNumber || !messageText) return;
      const formattedMessage = await this.formatWhatsAppMessage(obj.body);
      if (!formattedMessage) return;
      msgTemplate = `${this.localizationService.getMessage('newRidesMessage', language)}
${fixBoldMultiLine(formattedMessage)}
\u200F${this.localizationService.getMessage('senderName', language)} ${obj.fromName}
\u200F${this.localizationService.getMessage('senderPhone', language)} ${toLocalPhoneNumber(obj.senderPhone)}
\u200F${this.localizationService.getMessage('groupName', language)} ${obj.groupName}
${this.localizationService.getMessage('keyWordSignAppName', language)}`;
      msgTrack = `${this.localizationService.getMessage('newRidesMessage', language)}
${fixBoldMultiLine(formattedMessage)}`;
    }

    // ✅ FIX 9: Use SCAN instead of KEYS to avoid blocking Redis
    const isDuplicate = await this.checkMessageDuplicate(phone, msgTrack);
    if (isDuplicate) return;

    const trackedMessageCacheKey = `trackedMessage:${phone}:${Buffer.from(msgTrack).toString('base64')}`;
    const result = await this.redisClient.set(trackedMessageCacheKey, msgTrack, 'EX', 60 * 5, 'NX');
    if (result === null) return;

    this.driverMessageTrackerService.trackMessage(phone, obj.senderPhone, originAndDestination);

    const sectionObj = getMainMenuButtons(language, this.localizationService);
    this.whatsAppMessagingService.sendInteractiveWithListButtons({
      phone,
      language,
      message: msgTemplate,
      sections: sectionObj.sections,
      optionsTitle: sectionObj.optionsTitle,
    });

    const end = Date.now();
    const messageTimestamp = +obj.timestamp * 1000;
    this.logger.log(`>> Send found rides to driver not connected: ${phone} -> ${originAndDestination} after ${((end - messageTimestamp) / 1000).toFixed(2)}s`);
  }

  // ✅ FIX 9: Use SCAN instead of KEYS - non-blocking Redis operation
  private async checkMessageDuplicate(phone: string, msgTrack: string): Promise<boolean> {
    const pattern = `trackedMessage:${phone}:*`;
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        const values = await this.redisClient.mget(...keys);
        for (const existingMessage of values) {
          if (existingMessage) {
            const similarity = this.calculateMessageSimilarity(msgTrack, existingMessage);
            if (similarity > 0.8) return true;
          }
        }
      }
    } while (cursor !== '0');

    return false;
  }

  private enqueueSendMessage(phone: string, fn: () => Promise<void>) {
    const lastPromise = this.sendRegularMessageQueues.get(phone) || Promise.resolve();
    const newPromise = lastPromise
      .then(() => fn())
      .catch((e) => { this.logger.error('Failed to process enqueue:', e); })
      .finally(() => {
        if (this.sendRegularMessageQueues.get(phone) === newPromise) {
          this.sendRegularMessageQueues.delete(phone);
        }
      });
    this.sendRegularMessageQueues.set(phone, newPromise);
    return newPromise;
  }

  private async handleMessageListenerRegular(phones: string[], obj: any) {
    try {
      if (!phones?.length) return;

      for (const phone of phones) {
        try {
          // Per-driver deduplication
          const dedupeKey = `wa:regular:dedupe:${phone}:${obj.groupId}:${obj.messageId}`;
          const acquired = await this.redisClient.setnx(dedupeKey, '1');
          if (!acquired) continue;
          await this.redisClient.expire(dedupeKey, 11);

          if (phone === obj.senderPhone) continue;

          const language = getLanguageByPhoneNumber(phone);
          const driverCache = await this.redisClient.get(`driver:${phone}`);
          if (!driverCache) continue;
          const driver: Driver = JSON.parse(driverCache);

          if (driver?.isBusy || !driver?.isApproved) continue;
          if (!isInTrial(driver)) continue;
          if (isNeedToPay(driver)) continue;
          if (driver.filterGroups.includes(obj.groupId.replace('@g.us', ''))) continue;

          const originAndDestination = await this.shouldHaveMinimumCitiesNumber(obj.body);
          if (!originAndDestination) continue;

          if (!isDriverEligible(driver, obj.body, this.localizationService)) continue;

          const searchKeyword = await this.validateSearchKeyword(phone, originAndDestination);
          if (!searchKeyword) continue;

          this.enqueueSendMessage(phone, () =>
            this.sendFormatMessageRegular(phone, obj, language, searchKeyword, originAndDestination)
          );
        } catch (error) {
          this.logger.error(`Error in handleMessageListenerRegular for ${phone}:`, error);
        }
      }
    } catch (error) {
      this.logger.error(`Error in handleMessageListenerRegular:`, error);
    }
  }

  private async handleMessageListener(phone: string, obj: any): Promise<boolean> {
    try {
      const language = getLanguageByPhoneNumber(phone);

      const driverCache = await this.redisClient.get(`driver:${phone}`);
      if (!driverCache) return false;

      const driver: Driver = JSON.parse(driverCache);

      if (!driver?.isApproved || driver?.isBusy) return false;
      if (!isInTrial(driver)) return false;
      if (isNeedToPay(driver)) return false;
      if (driver.filterGroups.includes(obj.groupId.replace('@g.us', ''))) return false;

      const specialRouterName = this.specialRouterName.find(name => obj.body.includes(name));
      if (specialRouterName) {
        const privateMessage = await this.driverMessagePrivateModel.findOne({ phone, message: specialRouterName, isActive: true });
        if (privateMessage) {
          return await this.handleSpecialRouterName({
            phone, specialRouterName, driver, language,
            messageText: obj.body, groupId: obj.groupId,
            messageId: obj.messageId, targetPhoneNumber: obj.senderPhone
          });
        }
      }

      const originAndDestination = await this.shouldHaveMinimumCitiesNumber(obj.body);
      if (!originAndDestination) return false;

      if (!isDriverEligible(driver, obj.body, this.localizationService)) return false;

      let privateMessageCacheKey = `privateMessage:${phone}:${originAndDestination}`;
      let privateMessageData = await this.redisClient.get(privateMessageCacheKey);
      let privateMessage: any;
      if (privateMessageData) {
        privateMessage = JSON.parse(privateMessageData);
      } else {
        privateMessage = await this.driverMessagePrivateModel.findOne({ phone, message: originAndDestination, isActive: true });
        await this.redisClient.set(privateMessageCacheKey, JSON.stringify(privateMessage || null), 'EX', 5 * 60);
      }
      if (privateMessage) {
        return await this.handlePrivateMessageListener({
          phone, language, originAndDestination,
          messageText: obj.body, groupId: obj.groupId,
          messageId: obj.messageId, targetPhoneNumber: obj.senderPhone
        });
      }

      const searchKeyword = await this.validateSearchKeyword(phone, originAndDestination);
      if (!searchKeyword) return false;

      let msgTemplate = `${this.localizationService.getMessage('newRidesMessage', language)}
${fixBoldMultiLine(obj.body)}
\u200F${this.localizationService.getMessage('senderName', language)} ${obj.fromName}
\u200F${this.localizationService.getMessage('groupName', language)} ${obj.groupName}
${this.localizationService.getMessage('keyWordSignAppName', language)}`;

      const buttons = [
        {
          id: `driverResponseToGroupButton_${obj.groupId}_${obj.messageId}`,
          title: this.localizationService.getMessage('defaultText', language)
        },
        {
          id: `driverResponsePrivateFromGroupButton_${obj.groupId}_${obj.messageId}`,
          title: `ת לפרטי`
        }
      ];

      let msgTrack = `${this.localizationService.getMessage('newRidesMessage', language)}
${fixBoldMultiLine(obj.body)}`;

      const waLink = extractRelevantLinkFromMessage(obj.body, searchKeyword.keyword.split('_'));

      if (obj.groupId === this.specialGroup) {
        buttons.push({
          id: `driverResponseToGroupButton2_${obj.groupId}_${obj.messageId}`,
          title: 'ן'
        });
      } else if (obj.groupId === '972539236511-1567164800@g.us') {
        buttons.push({
          id: `driverResponseToGroupButton3_${obj.groupId}_${obj.messageId}`,
          title: this.localizationService.getMessage('specialGroupButton', language)
        });
      } else if (waLink) {
        const { phoneNumber, messageText } = extractPhoneAndTextFromWaMeLink(waLink) || {};
        if (!phoneNumber || !messageText) return false;
        const privateMessageBase64 = Buffer.from(messageText).toString('base64');
        const formattedMessage = await this.formatWhatsAppMessage(obj.body);
        if (!formattedMessage) return false;
        msgTemplate = `${this.localizationService.getMessage('newRidesMessage', language)}
${fixBoldMultiLine(formattedMessage)}
\u200F${this.localizationService.getMessage('senderName', language)} ${obj.fromName}
\u200F${this.localizationService.getMessage('groupName', language)} ${obj.groupName}
${this.localizationService.getMessage('keyWordSignAppName', language)}`;
        msgTrack = `${this.localizationService.getMessage('newRidesMessage', language)}
${fixBoldMultiLine(formattedMessage)}`;
        buttons.pop();
        buttons.push({
          id: `sendPrivateMessageButton_${phoneNumber}_BASE64${privateMessageBase64}_${obj.groupId}_${obj.messageId}`,
          title: this.localizationService.getMessage('sendPrivateMessageButton', language)
        });
      }

      // ✅ FIX 9: SCAN instead of KEYS
      const isDuplicate = await this.checkMessageDuplicate(phone, msgTrack);
      if (isDuplicate) return false;

      const trackedMessageCacheKey = `trackedMessage:${phone}:${Buffer.from(msgTrack).toString('base64')}`;
      const result = await this.redisClient.set(trackedMessageCacheKey, msgTrack, 'EX', 60 * 5, 'NX');
      if (result === null) return false;

      this.driverMessageTrackerService.trackMessage(phone, obj.senderPhone, originAndDestination);

      await this.whatsAppMessagingService.sendInteractiveMessage({ phone, language, buttons, message: msgTemplate });

      const end = Date.now();
      const messageTimestamp = +obj.timestamp * 1000;
      this.logger.log(`>> Send found rides to driver: ${phone} -> ${originAndDestination} after ${((end - messageTimestamp) / 1000).toFixed(2)}s`);

      return true;
    } catch (error) {
      this.logger.error(`Error in sendMessageListener for ${phone}:`, error);
    }
    return false;
  }

  async sendWhatsappRemoveGroupContentSuccess(phone: string, language: string, totalGroups: number, clearedGroups: number): Promise<void> {
    const msg = this.localizationService.getMessage('settingsRemoveGroupContentSuccessMessage', language)
      .replace('{totalGroups}', totalGroups.toString())
      .replace('{clearedGroups}', clearedGroups.toString());
    const obj = getMainMenuButtons(language, this.localizationService);
    await this.whatsAppMessagingService.sendInteractiveWithListButtons({
      phone, language, message: msg,
      sections: obj.sections, optionsTitle: obj.optionsTitle,
    });
  }

  async handlePrivateMessageListener({ phone, language, originAndDestination, messageText, groupId, messageId, targetPhoneNumber }: {
    phone: string; language: string; originAndDestination: string;
    messageText: string; groupId: string; messageId: string; targetPhoneNumber: string;
  }): Promise<boolean> {
    const filterNumbers = [50, 60, 70, 80, 90, 100];
    if (filterNumbers.some(number => messageText.includes(number.toString()))) return;

    let text = this.localizationService.getMessage('defaultText', language);

    const waLink = extractRelevantLinkFromMessage(messageText, originAndDestination.split('_'));
    let phoneNumberOnLink = targetPhoneNumber;
    if (waLink) {
      const { messageText: waMsgText, phoneNumber } = extractPhoneAndTextFromWaMeLink(waLink);
      phoneNumberOnLink = phoneNumber;
      text = waMsgText;
    }
    await this.wabotService.replyToGroup(phone, groupId, messageId, text);
    await this.wabotService.replyPrivateFromGroup(phone, phoneNumberOnLink, groupId, messageId, text);
    const customMessage = await this.driverMessagePrivateModel.findOne({ phone, type: MessageType.CUSTOM, isActive: true }).exec();
    if (customMessage?.message && customMessage?.message !== MessageType.CUSTOM) {
      await this.wabotService.sendPrivateMessage(phone, phoneNumberOnLink, customMessage.message);
    }
    const formattedMessage = await this.formatWhatsAppMessage(messageText);
    if (!formattedMessage) return;
    await this.sendWhatsappAutomaticDestinationFoundRide(phone, language, formattedMessage);
    return true;
  }

  private calculateMessageSimilarity(msg1: string, msg2: string): number {
    const words1 = msg1.toLowerCase().split(/\s+/);
    const words2 = msg2.toLowerCase().split(/\s+/);
    const set2 = new Set(words2);
    const commonWords = words1.filter(word => set2.has(word));
    return commonWords.length / Math.max(words1.length, words2.length);
  }

  private async handleSpecialRouterName({ phone, specialRouterName, language, driver, messageText, groupId, messageId, targetPhoneNumber }: {
    phone: string; specialRouterName: string; language: string; driver: Driver;
    messageText: string; groupId: string; messageId: string; targetPhoneNumber: string;
  }): Promise<boolean> {
    if (!isDriverEligible(driver, messageText, this.localizationService)) return;
    return await this.handlePrivateMessageListener({
      phone, language, originAndDestination: specialRouterName,
      messageText, groupId, messageId, targetPhoneNumber
    });
  }

  async sendWhatsappAutomaticDestinationMessage(phone: string, language: string, originAndDestination: string) {
    const msg = `${this.localizationService.getMessage('secretMenuAutomaticDestinationMessage', language)}`.replace('{originAndDestination}', originAndDestination);
    await this.whatsAppMessagingService.sendTextMessage({ phone, text: msg });
  }

  async sendWhatsappAutomaticDestinationFoundRide(phone: string, language: string, body: string) {
    const msg = `${this.localizationService.getMessage('secretMenuAutomaticDestinationFoundRide', language)}`.replace('{body}', body);
    await this.whatsAppMessagingService.sendTextMessage({ phone, text: msg });
  }

  async sendFlowMessageFilterGroups(phone: string, language: string) {
    const groups = await this.wabotService.getGroups(phone);
    const formattedGroups = groups.map(group => ({ id: group.jid, title: group.name }));
    await this.whatsAppMessagingService.sendFlowMessage({
      to: phone,
      flowName: 'driver_filters_groups',
      header: this.localizationService.getMessage('settingsFilterGroups', language),
      body: this.localizationService.getMessage('settingsFilterGroupsDescription', language),
      cta: this.localizationService.getMessage('groupListButton', language),
      flow_token: 'driver_filters_groups',
      screenId: 'driver_filters_groups',
      dynamicData: {
        title: this.localizationService.getMessage('settingsFilterGroups', language),
        groups_label: this.localizationService.getMessage('settingsFilterGroupsLabel', language),
        cta: this.localizationService.getMessage('confirmButton', language),
        groups_options: formattedGroups
      }
    });
  }

  async handleIncomingMessage(phone: string, payload: any) {
    const now = Date.now();
    const messageTimestamp = +payload.timestamp * 1000;
    if (messageTimestamp < now - 20000) return;

    // Process main message handler immediately (for the connected bot's driver)
    this.handleMessageListener(phone, payload);

    // Process participants (disconnected drivers in the group)
    if (payload?.participants?.length > 0) {
      const { drivers: allDrivers, connectedPhones: connectedPhonesSet } = await this.getDriversAndConnectionStatus();

      // ✅ FIX 5: Build Map for O(1) lookup instead of O(n) array.find()
      const driversMap = new Map(allDrivers.map(d => [d.phone, d]));

      const disconnectedDriversInGroup: string[] = [];
      for (const pn of payload.participants) {
        const driver = driversMap.get(pn); // ✅ O(1) lookup!
        if (!driver?.phone || driver.phone === payload.phone) continue;
        if (!connectedPhonesSet.has(driver.phone)) {
          disconnectedDriversInGroup.push(driver.phone);
        }
      }

      if (disconnectedDriversInGroup.length > 0) {
        setImmediate(() => {
          this.handleMessageListenerRegular(disconnectedDriversInGroup, payload).catch(error => {
            this.logger.error(`Error processing regular message listeners:`, error);
          });
        });
      }
    }
  }

  async handleWhatsAppMessageFromBot(whatsappMsg: any) {
    try {
      const payload = {
        body: whatsappMsg.body,
        messageId: whatsappMsg.messageId,
        groupName: whatsappMsg.groupName || '',
        senderPhone: whatsappMsg.senderPhone,
        fromName: whatsappMsg.fromName,
        timestamp: whatsappMsg.timestamp,
        type: whatsappMsg.type,
        isGroup: whatsappMsg.groupId && whatsappMsg.groupId.includes('@g.us'),
        groupId: whatsappMsg.groupId,
        participants: whatsappMsg.participants || [],
        phone: whatsappMsg.phone,
      };
      await this.handleIncomingMessage(whatsappMsg.phone, payload);
    } catch (error) {
      this.logger.error(`Error processing WhatsApp message from bot ${whatsappMsg.messageId}:`, error);
      throw error;
    }
  }

  async handlePrivateMessageFromDriver(botPhone: string, payload: any) {
    const { senderPhone, body, fromName } = payload;
    if (!senderPhone || !body) return;

    const language = getLanguageByPhoneNumber(senderPhone);
    this.logger.log(`Private message from ${senderPhone} to bot ${botPhone}: "${body}"`);

    // Check if driver is registered
    let driver = await this.driverModel.findOne({ phone: senderPhone }).lean();

    // Auto-register new driver
    if (!driver) {
      const newDriver = await this.driverModel.create({
        phone: senderPhone,
        name: fromName || senderPhone,
        isApproved: true,
        isActive: true,
        isBusy: false,
        ignorePayment: true,
        language,
        filterGroups: [],
      });
      driver = newDriver.toObject();
      await this.redisClient.set(`driver:${senderPhone}`, JSON.stringify(driver));
      this.logger.log(`Auto-registered new driver: ${senderPhone} (${fromName})`);

      await this.wabotService.sendPrivateMessage(botPhone, senderPhone,
        `ברוך הבא! 👋\nנרשמת בהצלחה כנהג.\n\nכדי לקבל נסיעות, שלח:\n*פנוי ב[עיר]* – לדוגמה: "פנוי בנתניה"\n\nכדי להפסיק: שלח *עסוק*`
      ).catch(e => this.logger.warn(`Failed to send welcome: ${e.message}`));
      return;
    }

    // Handle "פנוי ב[city]" - register availability
    const availabilityMatch = body.match(/^פנוי\s+ב(.+)$/);
    if (availabilityMatch) {
      const city = availabilityMatch[1].trim();
      await this.driverSearchKeywordService.trackSearch(senderPhone, city);
      await this.redisClient.del(`driverSearchHistory:${senderPhone}`);

      // Update driver as not busy
      await this.driverModel.updateOne({ phone: senderPhone }, { isBusy: false });
      const updatedDriver = await this.driverModel.findOne({ phone: senderPhone }).lean();
      await this.redisClient.set(`driver:${senderPhone}`, JSON.stringify(updatedDriver));

      this.logger.log(`Driver ${senderPhone} registered availability in: ${city}`);
      await this.wabotService.sendPrivateMessage(botPhone, senderPhone,
        `✅ נרשמת לנסיעות מ${city}.\nכשתצא נסיעה מהאזור, תקבל הודעה.`
      ).catch(e => this.logger.warn(`Failed to send confirmation: ${e.message}`));
      return;
    }

    // Handle "עסוק" - mark as busy
    if (body.trim() === 'עסוק') {
      await this.driverModel.updateOne({ phone: senderPhone }, { isBusy: true });
      const updatedDriver = await this.driverModel.findOne({ phone: senderPhone }).lean();
      await this.redisClient.set(`driver:${senderPhone}`, JSON.stringify(updatedDriver));
      await this.driverSearchKeywordService.removeAllSearchByPhone(senderPhone);
      await this.redisClient.del(`driverSearchHistory:${senderPhone}`);

      await this.wabotService.sendPrivateMessage(botPhone, senderPhone,
        `⏸ סומנת כעסוק. לא תקבל נסיעות עד שתשלח "פנוי ב[עיר]" שוב.`
      ).catch(e => this.logger.warn(`Failed to send busy reply: ${e.message}`));
      return;
    }

    // Default help message
    await this.wabotService.sendPrivateMessage(botPhone, senderPhone,
      `שלח:\n• *פנוי ב[עיר]* – להתחיל לקבל נסיעות (דוגמה: "פנוי בנתניה")\n• *עסוק* – להפסיק לקבל נסיעות`
    ).catch(e => this.logger.warn(`Failed to send help: ${e.message}`));
  }
}
