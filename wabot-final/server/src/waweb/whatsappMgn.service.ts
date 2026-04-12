import { Injectable, OnModuleInit, OnModuleDestroy, Inject, Optional, Logger } from '@nestjs/common';
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
  parseRideMessage,
  matchAppVehicleFilter,
  isDeliveryRide,
  isInternalRide,
  isRoundTrip,
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
import { BenchmarkService } from '../benchmark/benchmark.service';
import { Queue, Worker } from 'bullmq';
import { DriverWsServer } from '../drivers/driver-ws.server';

// ✅ FIX 8: In-memory areas cache to avoid 4 Redis calls per message
interface AreasCache {
  supportAreas: string[];
  shortcuts: Record<string, string>;
  relatedToMain: Record<string, string>;
  mainToRelatedList: Record<string, string[]>;
  expiresAt: number;
}

@Injectable()
export class WhatsappServiceMgn implements OnModuleInit, OnModuleDestroy {
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
  private statusBroadcastInterval?: NodeJS.Timeout;
  private mapCleanupInterval?: NodeJS.Timeout;

  // ✅ FIX 8: In-memory cache for areas data (avoids 4 Redis calls per message)
  private areasCache: AreasCache | null = null;
  private areasCacheVersion = '';
  private readonly AREAS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // Context per ride: maps messageId → { botPhone, groupId, senderPhone, senderName, origin, destination }.
  // origin/destination are used by the success flow (when the dispatcher replies
  // privately after a ת button press) to show the right route in the notification.
  private rideContext = new Map<string, {
    botPhone: string;
    groupId: string;
    senderPhone: string;
    senderName: string;
    origin?: string;
    destination?: string;
  }>();

  // Chat routing: dispatcherPhone → driverPhone of the app that owns the conversation.
  // When the dispatcher replies privately to the bot, we forward the message to that driver app
  // instead of treating it as a driver registration message.
  private chatRouting = new Map<string, string>();
  // Dispatcher phones where the FIRST incoming reply should auto-open the chat.
  // Keyed by dispatcherPhone, value is driverPhone. Set on take_ride_link.
  private awaitingFirstReply = new Map<string, string>();
  // Phones that are ride BOTS (wa.me link targets). Replies from these phones
  // should NOT trigger "ride accepted" — only intermediary chat. Keyed by
  // linkPhone, value is driverPhone.
  private linkBotPhones = new Map<string, string>();

  // Pending chat tokens: token → { driverPhone, rideId, rideContext, expiresAt }.
  // After the user taps "💬 צ'אט עם סדרן", we send the chat code to the chat-bot
  // and stash unique tokens from that code (e.g. ride IDs). Later, when the
  // ACTUAL dispatcher messages the user privately with the same token in the
  // body, we identify them, whitelist them, and auto-open the conversation.
  private pendingChatTokens = new Map<string, { driverPhone: string; rideId: string; ride: any; expiresAt: number }>();

  // Pending reply-ack rides: after the user pressed ת לקבוצה / ת לפרטי / ת לשניהם,
  // we wait for the dispatcher to reply privately — that's the real "you got
  // the ride" signal. When the dispatcher's private message arrives, we emit
  // a ride_update with status=success so the app shows the SuccessCard + fires
  // a "קיבלת את הנסיעה" notification. Keyed by "<driverPhone>:<dispatcherPhone>"
  // because the same dispatcher can send multiple rides to the same driver.
  private pendingReplyRides = new Map<string, {
    rideId: string;
    driverPhone: string;
    dispatcherPhone: string;
    origin: string;
    destination: string;
    groupId: string;
    expiresAt: number;
  }>();

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
    @Optional() private readonly benchmarkService: BenchmarkService,
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

    try { await this.setAllDriversCache(); } catch (e: any) { this.logger.error(`setAllDriversCache failed: ${e?.message}`); }
    try { this.startMessageProcessingWorker(); } catch (e: any) { this.logger.error(`startMessageProcessingWorker failed: ${e?.message}`); }

    // Register ride action handler for Android app WebSocket
    DriverWsServer.getInstance().onRideAction(this.handleRideAction.bind(this));
    DriverWsServer.getInstance().onChatMessage(this.handleChatMessageFromApp.bind(this));
    DriverWsServer.getInstance().onAvailability(this.handleAppAvailabilityChange.bind(this));
    DriverWsServer.getInstance().onKmFilter(this.handleAppKmFilterChange.bind(this));
    DriverWsServer.getInstance().onMinPrice(this.handleAppMinPriceChange.bind(this));
    DriverWsServer.getInstance().setWaStatusProvider(async (phone: string) => {
      try {
        // Bypass cache for fresh status (cache is 10min, too stale for live status)
        const status = await this.wabotService.getStatus() || [];
        const entry = status.find(s => s.phone === phone);
        return !!(entry && entry.isHealthy);
      } catch { return false; }
    });

    // Periodic wa_status broadcast every 15s to all connected driver apps
    this.statusBroadcastInterval = setInterval(async () => {
      try {
        const wsServer = DriverWsServer.getInstance();
        const phones = wsServer.connectedPhones;
        if (phones.length === 0) return;
        const status = await this.wabotService.getStatus() || [];
        for (const phone of phones) {
          const entry = status.find(s => s.phone === phone);
          const isConn = !!(entry && entry.isHealthy);
          wsServer.send(phone, 'wa_status', { connected: isConn });
        }
      } catch { /* swallow */ }
    }, 15000);

    // Cleanup expired in-memory maps every 5 minutes to prevent memory leaks.
    this.mapCleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, val] of this.pendingChatTokens) {
        if (val.expiresAt < now) this.pendingChatTokens.delete(key);
      }
      for (const [key, val] of this.pendingReplyRides) {
        if (val.expiresAt < now) this.pendingReplyRides.delete(key);
      }
      // rideContext has no TTL — keep only the last 1000 to cap growth
      if (this.rideContext.size > 1000) {
        const toDelete = [...this.rideContext.keys()].slice(0, this.rideContext.size - 1000);
        toDelete.forEach(k => this.rideContext.delete(k));
      }
      // chatRouting has no TTL — cap at 500 (dispatcherPhone→driverPhone entries)
      if (this.chatRouting.size > 500) {
        const toDelete = [...this.chatRouting.keys()].slice(0, this.chatRouting.size - 500);
        toDelete.forEach(k => this.chatRouting.delete(k));
      }
    }, 5 * 60 * 1000);

    this.logger.log('Registered ride action + chat message handlers for Android app WebSocket');
  }

  // ✅ FIX 8: Cached areas loader - loads from Redis once, caches in memory for 5 minutes.
  // Version key 'wa:areas:cache_v' is bumped by AreasService on every mutation so
  // admin-panel changes take effect immediately (within one Redis GET, ~1ms).
  private async getAreasData(): Promise<AreasCache> {
    const now = Date.now();
    if (this.areasCache && this.areasCache.expiresAt > now) {
      // Fast-path: check if admin panel bumped the version key
      const v = await this.redisClient.get('wa:areas:cache_v').catch(() => '');
      if (v === this.areasCacheVersion) return this.areasCache;
      // Version changed → fall through and reload
    }

    // Load all 4 Redis structures in parallel
    const [rawSupport, rawShortcuts, rawRelated, rawMainToList, latestVersion] = await Promise.all([
      this.redisClient.smembers('wa:areas:support').catch(() => []),
      this.redisClient.hgetall('wa:areas:shortcuts').catch(() => ({})),
      this.redisClient.hgetall('wa:areas:related').catch(() => ({})),
      this.redisClient.hgetall('wa:areas:related_main_to_list').catch(() => ({})),
      this.redisClient.get('wa:areas:cache_v').catch(() => ''),
    ]);

    this.areasCacheVersion = latestVersion || '';

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

  onModuleDestroy() {
    if (this.statusBroadcastInterval) clearInterval(this.statusBroadcastInterval);
    if (this.mapCleanupInterval) clearInterval(this.mapCleanupInterval);
  }

  /**
   * Called when the Android app toggles פנוי/לא פנוי. Persists to Mongo and
   * refreshes the Redis cache so `handleMessageListenerRegular` (which checks
   * `driver.isBusy` from the cache) immediately stops dispatching rides when
   * the user turns availability off.
   */
  private async handleAppAvailabilityChange(driverPhone: string, available: boolean): Promise<void> {
    try {
      const isBusy = !available;
      await this.driverModel.updateOne(
        { phone: driverPhone },
        { $set: { isBusy } },
      ).exec();
      const updated = await this.driverModel.findOne({ phone: driverPhone }).lean();
      if (updated) {
        await this.redisClient.set(`driver:${driverPhone}`, JSON.stringify(updated));
      }
      // When driver goes unavailable, clear any buffered rides so WS
      // reconnects don't replay stale rides after the toggle-off.
      if (isBusy) {
        DriverWsServer.getInstance().clearBuffer(driverPhone);
      }
      this.logger.log(`App availability change: ${driverPhone} available=${available} isBusy=${isBusy}`);
    } catch (e: any) {
      this.logger.error(`handleAppAvailabilityChange failed for ${driverPhone}: ${e?.message}`);
    }
  }

  /**
   * Called when the Android app sets/clears the km-range filter. Persists to
   * Mongo and refreshes the Redis cache so the ride dispatcher picks it up on
   * the very next incoming message.
   */
  private async handleAppKmFilterChange(driverPhone: string, km: number | null): Promise<void> {
    try {
      await this.driverModel.updateOne(
        { phone: driverPhone },
        { $set: { kmFilter: km } },
      ).exec();
      const updated = await this.driverModel.findOne({ phone: driverPhone }).lean();
      if (updated) {
        await this.redisClient.set(`driver:${driverPhone}`, JSON.stringify(updated));
      }
      this.logger.log(`App km filter change: ${driverPhone} km=${km}`);
    } catch (e: any) {
      this.logger.error(`handleAppKmFilterChange failed for ${driverPhone}: ${e?.message}`);
    }
  }

  /**
   * Haversine distance in kilometers between two (lat,lng) points. Used by
   * the km-range filter to decide if a ride origin is close enough to a
   * driver's keyword city.
   */
  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // earth radius km
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /**
   * Look up {lat,lng} for a city name in the areashortcuts collection.
   * Matches by either shortName or fullName (case-insensitive). Returns null
   * if the city isn't geocoded yet — callers should "fail open" in that case
   * so unknown cities don't silently block rides.
   */
  private async getCityCoords(name: string): Promise<{ lat: number; lng: number } | null> {
    if (!name) return null;
    const cacheKey = `geo:${name.trim().toLowerCase()}`;
    try {
      const cached = await this.redisClient.get(cacheKey);
      if (cached === 'null') return null;
      if (cached) return JSON.parse(cached);
    } catch { /* ignore cache errors */ }

    try {
      const db: any = (this.driverModel as any).db;
      const col = db.collection('areashortcuts');
      const trimmed = name.trim();
      const doc = await col.findOne({
        $or: [
          { shortName: trimmed },
          { fullName: trimmed },
          { shortName: trimmed.toLowerCase() },
          { fullName: trimmed.toLowerCase() },
        ],
      });
      if (doc && typeof doc.lat === 'number' && typeof doc.lng === 'number') {
        const coords = { lat: doc.lat, lng: doc.lng };
        try { await this.redisClient.set(cacheKey, JSON.stringify(coords), 'EX', 86400); } catch { }
        return coords;
      }
      try { await this.redisClient.set(cacheKey, 'null', 'EX', 3600); } catch { }
      return null;
    } catch (e: any) {
      this.logger.warn(`getCityCoords failed for "${name}": ${e?.message}`);
      return null;
    }
  }

  /**
   * Km-range filter check. Returns true if the ride passes (should be sent
   * to the driver), false if it should be filtered out.
   * - No kmFilter set → always true
   * - Either the ride origin or ALL of the driver's keyword cities missing
   *   coords → fail open (true) so unknown cities don't silently block rides
   * - Otherwise → the ride passes if its origin is within kmFilter of ANY
   *   keyword city the driver has
   */
  private async passesKmFilter(
    kmFilter: number | null | undefined,
    rideOriginCity: string,
    driverKeywords: string[],
  ): Promise<boolean> {
    if (!kmFilter || kmFilter <= 0) return true;
    const originCoords = await this.getCityCoords(rideOriginCity);
    if (!originCoords) return true; // fail open
    // A keyword may be "origin_dest" — only the origin part identifies the
    // driver's location, so take the substring before "_".
    const originKeywords = driverKeywords
      .map(k => (k || '').split('_')[0].trim())
      .filter(k => k.length > 0);
    if (originKeywords.length === 0) return true;
    for (const kw of originKeywords) {
      const kwCoords = await this.getCityCoords(kw);
      if (!kwCoords) continue;
      const dist = this.haversineKm(
        originCoords.lat, originCoords.lng,
        kwCoords.lat, kwCoords.lng,
      );
      if (dist <= kmFilter) return true;
    }
    return false;
  }

  /**
   * Called when the Android app sets/clears the minimum-price filter.
   * Persists to Mongo and refreshes the Redis cache so the dispatcher picks
   * it up on the very next incoming message.
   */
  private async handleAppMinPriceChange(driverPhone: string, minPrice: number | null): Promise<void> {
    try {
      await this.driverModel.updateOne(
        { phone: driverPhone },
        { $set: { minPrice } },
      ).exec();
      const updated = await this.driverModel.findOne({ phone: driverPhone }).lean();
      if (updated) {
        await this.redisClient.set(`driver:${driverPhone}`, JSON.stringify(updated));
      }
      this.logger.log(`App min price change: ${driverPhone} minPrice=${minPrice}`);
    } catch (e: any) {
      this.logger.error(`handleAppMinPriceChange failed for ${driverPhone}: ${e?.message}`);
    }
  }

  /**
   * Parse a numeric price in shekels from a ride body. Handles common Hebrew
   * formats: "100 ש", "100 ש״ח", "100 שח", "₪100", "100₪", "100 NIS", and
   * bolded variants like "*100 ש*". Returns null when no price is detected,
   * which the caller treats as "fail open" (pass the filter).
   *
   * Picks the LARGEST detected number so a ride with two prices (driver's
   * payout vs. passenger fare) doesn't accidentally match the wrong one.
   */
  private extractRidePrice(text: string): number | null {
    if (!text) return null;
    const candidates: number[] = [];
    // ₪ symbol, before or after
    const reShekel = /₪\s*(\d{2,5})|(\d{2,5})\s*₪/g;
    let m: RegExpExecArray | null;
    while ((m = reShekel.exec(text)) !== null) {
      const n = parseInt(m[1] || m[2], 10);
      if (!isNaN(n)) candidates.push(n);
    }
    // Hebrew ש / ש״ח / שח / שקל — require at least 2 digits to avoid matching
    // years, seat counts, phone fragments, etc. Ignore matches where the
    // number is part of a longer digit run (e.g. phone number).
    const reHebrew = /(?<!\d)(\d{2,5})\s*(ש(?:["״]?ח|קל(?:ים)?)?(?!\w))/g;
    while ((m = reHebrew.exec(text)) !== null) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n)) candidates.push(n);
    }
    // NIS literal
    const reNis = /(\d{2,5})\s*NIS/gi;
    while ((m = reNis.exec(text)) !== null) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n)) candidates.push(n);
    }
    if (candidates.length === 0) return null;
    return Math.max(...candidates);
  }

  /** Handle ride_action messages coming from the Android driver app via WebSocket */
  private async handleRideAction(driverPhone: string, data: any): Promise<void> {
    const { rideId, action, linkPhone, linkText, chatPhone, chatText } = data || {};
    const wsServer = DriverWsServer.getInstance();
    this.logger.log(`handleRideAction: driver=${driverPhone} action=${action} rideId=${rideId}`);

    try {
      if (action === 'take_ride_link') {
        if (!linkPhone) {
          this.logger.warn(`take_ride_link: missing linkPhone for ride ${rideId}`);
          return;
        }
        // ALWAYS send through the user's own WhatsApp account. The previous
        // logic preferred ctx.botPhone which is the user that won the global
        // dedup race when the message was forwarded — that meant button
        // presses were getting attributed to the wrong user.
        const sendVia = driverPhone;
        const msgText = linkText || 'ת';
        await this.wabotService.sendPrivateMessage(sendVia, linkPhone, msgText);
        // Whitelist this contact for chat sync — replies from the ride bot/contact
        // should now appear in the app's chat tab (the user "claimed" this convo).
        this.chatRouting.set(linkPhone, driverPhone);
        this.awaitingFirstReply.set(linkPhone, driverPhone);
        this.linkBotPhones.set(linkPhone, driverPhone);
        // The GROUP sender is also a bot — NOT the dispatcher. The real
        // dispatcher will message us privately later. We identify them by
        // matching tokens: the ride's identifying number, origin, destination.
        // Extract tokens from the ride rawText and rideId.
        const ctx = this.rideContext.get(rideId);
        const expiresAt = Date.now() + 30 * 60 * 1000;
        const ride = ctx ? { origin: ctx.origin, destination: ctx.destination } : null;

        // Token 1: the rideId itself (often contains the identifying number)
        if (rideId && rideId.length >= 4) {
          // Strip block suffix (e.g. "abc123#0" → "abc123")
          const baseId = rideId.split('#')[0];
          this.pendingChatTokens.set(baseId, { driverPhone, rideId, ride, expiresAt });
        }
        // Token 2: any number >= 5 digits from linkPhone (the bot's number)
        const phoneDigits = linkPhone.replace(/\D/g, '');
        if (phoneDigits.length >= 5) {
          this.pendingChatTokens.set(phoneDigits, { driverPhone, rideId, ride, expiresAt });
        }
        // Token 3: extract the identifying NUMBER from linkText (e.g. "561406886").
        // Only pure digit sequences >= 5 chars — these are ride IDs that the
        // dispatcher will echo back.
        const linkNumbers = (msgText || '').split(/\s+/).filter(s => /^\d{5,}$/.test(s));
        for (const ln of linkNumbers) {
          this.pendingChatTokens.set(ln, { driverPhone, rideId, ride, expiresAt });
        }
        // Token 4: origin + destination as dispatcher might echo back ride details.
        // Store multiple formats: "בני ברק ירושלים", "בב ים" (short codes)
        if (ctx?.origin && ctx?.destination) {
          // Full names with space (e.g. "בני ברק ירושלים")
          const fullRoute = `${ctx.origin} ${ctx.destination}`;
          if (fullRoute.length >= 5) this.pendingChatTokens.set(fullRoute, { driverPhone, rideId, ride, expiresAt });
          // Short codes: reverse lookup from areas
          try {
            const areasData = await this.getAreasData();
            const originShort = Object.entries(areasData.shortcuts).find(([, v]) => v === ctx.origin.toLowerCase())?.[0] || '';
            const destShort = Object.entries(areasData.shortcuts).find(([, v]) => v === ctx.destination.toLowerCase())?.[0] || '';
            if (originShort && destShort) {
              const shortRoute = `${originShort} ${destShort}`;
              if (shortRoute.length >= 5) this.pendingChatTokens.set(shortRoute, { driverPhone, rideId, ride, expiresAt });
            }
          } catch {}
        }
        this.logger.log(`take_ride_link: stored ${this.pendingChatTokens.size} tokens for ride ${rideId}`);
        // Note: no ride_update sent — card stays as-is, only button changed to "נשלח ✓" on client
        this.logger.log(`take_ride_link: sent "${msgText}" to ${linkPhone} via ${sendVia}`);

      } else if (action === 'open_chat') {
        // "💬 צ'אט עם סדרן" button (two_links). The second wa.me link is to a
        // BOT (not the dispatcher). When we send its chat code, the bot replies
        // with a confirmation and triggers the actual dispatcher to message the
        // user privately. The dispatcher's reply contains the same unique tokens
        // that were in the chat code, so we use those tokens to identify the
        // dispatcher when their message arrives and auto-open the chat.
        const target = (chatPhone || '').toString().trim();
        const text = ((chatText || 'צ').toString());
        if (target) {
          try {
            // Always send through the user's own WhatsApp account.
            await this.wabotService.sendPrivateMessage(driverPhone, target, text);
            this.logger.log(`open_chat: sent "${text}" to ${target} via ${driverPhone}`);
          } catch (e: any) {
            this.logger.warn(`open_chat: failed to send chat code: ${e?.message}`);
          }
          // Extract identifying tokens from the chat code (anything that looks
          // like an ID — alphanumeric segments of length >= 6) and remember them
          // for ~30 minutes so we can match the dispatcher's incoming message.
          const tokens = (text || '')
            .split(/[\s+]+/)
            .map(s => s.trim())
            .filter(s => s.length >= 6 && /^[A-Za-z0-9]+$/.test(s));
          const ride = (data?.ride as any) || null;
          const expiresAt = Date.now() + 30 * 60 * 1000;
          for (const tok of tokens) {
            this.pendingChatTokens.set(tok, { driverPhone, rideId, ride, expiresAt });
          }
          this.logger.log(`open_chat: stored ${tokens.length} pending tokens for driver ${driverPhone}`);
        }

      } else if (
        action === 'reply_group' ||
        action === 'reply_private' ||
        action === 'reply_both'
      ) {
        const ctx = this.rideContext.get(rideId);
        if (!ctx) return;
        // Send the "ת" through THIS user's own WhatsApp session — never via
        // the user who happened to forward the message to NestJS first
        // (`ctx.botPhone`). The forwarder is just whoever won the global
        // dedup lottery for that messageId, but each user is supposed to
        // reply from their own account.
        if (action === 'reply_group' || action === 'reply_both') {
          await this.wabotService.replyToGroup(driverPhone, ctx.groupId, rideId, 'ת');
        }
        if (action === 'reply_private' || action === 'reply_both') {
          await this.wabotService.replyPrivateFromGroup(driverPhone, ctx.senderPhone, ctx.groupId, rideId, 'ת');
        }
        // Whitelist the dispatcher for chat sync and remember this ride as
        // "waiting for dispatcher reply". When the dispatcher answers privately,
        // handlePrivateMessageFromDriver will fire the success update.
        this.chatRouting.set(ctx.senderPhone, driverPhone);
        this.pendingReplyRides.set(`${driverPhone}:${ctx.senderPhone}`, {
          rideId,
          driverPhone,
          dispatcherPhone: ctx.senderPhone,
          origin: ctx.origin || '',
          destination: ctx.destination || '',
          groupId: ctx.groupId,
          expiresAt: Date.now() + 30 * 60 * 1000,
        });
        this.logger.log(`Pending reply for ride ${rideId}: driver=${driverPhone} waits for dispatcher=${ctx.senderPhone}`);

      } else {
        this.logger.warn(`handleRideAction: unknown action "${action}"`);
      }
    } catch (err: any) {
      this.logger.error(`handleRideAction error (action=${action}): ${err?.message}`);
      wsServer.sendRideUpdate(driverPhone, { rideId, status: 'failed', message: 'שגיאה בשליחה' });
    }
  }

  /** Handle send_message from the Android driver app — sends a 1:1 WhatsApp message
   * via the user's OWN WhatsApp account. There is no central bot — every connected
   * phone is the user's own number, so we send through driverPhone itself. */
  private async handleChatMessageFromApp(driverPhone: string, data: any): Promise<void> {
    const to = (data?.to || '').toString().trim();
    const text = (data?.text || '').toString();
    if (!to || !text) {
      this.logger.warn(`handleChatMessageFromApp: missing to/text from driver ${driverPhone}`);
      return;
    }
    try {
      await this.wabotService.sendPrivateMessage(driverPhone, to, text);
      this.chatRouting.set(to, driverPhone);
      this.logger.log(`Chat message from ${driverPhone} → ${to}: "${text}"`);
    } catch (err: any) {
      this.logger.error(`handleChatMessageFromApp error: ${err?.message}`);
    }
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

  /** Fetch WhatsApp profile picture URL for a phone number via any connected user */
  async getProfilePictureUrl(phone: string): Promise<string> {
    try {
      // Pick any currently-connected user's WhatsApp account to issue the query through.
      const status = await this.wabotService.getStatus() || [];
      const viaPhone = status.find(s => s.isHealthy)?.phone;
      if (!viaPhone) return '';
      const res = await this.wabotService['api'].get<{ url: string }>(
        `/profile-picture?bot=${viaPhone}&phone=${phone}`
      );
      return res.data?.url || '';
    } catch {
      return '';
    }
  }

  async getConnectionStatus(): Promise<{ phone: string; isHealthy: boolean; }[]> {
    const statusCacheKey = 'wa:connected_phones';
    const statusCache = await this.redisClient.get(statusCacheKey);
    if (statusCache) {
      try { return JSON.parse(statusCache); } catch { /* fall through to live fetch */ }
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

      // Full cleanup for the disconnected user — no stale data should remain
      // referencing this phone anywhere in the system.
      try {
        await this.driverModel.deleteOne({ phone }).exec();
        await this.driverSearchKeywordService.removeAllSearchByPhone(phone);
        await this.redisClient.del(`driver:${phone}`);
        await this.redisClient.del(`driverSearchHistory:${phone}`);
        // In-memory routing tables: drop entries that reference this phone
        for (const [k, v] of this.chatRouting.entries()) {
          if (v === phone) this.chatRouting.delete(k);
        }
        for (const [rideId, ctx] of this.rideContext.entries()) {
          if ((ctx as any)?.botPhone === phone) this.rideContext.delete(rideId);
        }
        this.logger.log(`Cleaned up all state for disconnected user ${phone}`);
      } catch (e: any) {
        this.logger.warn(`Cleanup after LoggedOut failed for ${phone}: ${e?.message}`);
      }
    }
    if (event === 'Connected') {
      await this.onArmConnected(phone, getLanguageByPhoneNumber(phone));
    }
    // Push WA status to the driver app (driver phone == user phone)
    try {
      const wsServer = DriverWsServer.getInstance();
      const isConnected = event === 'Connected';
      if (wsServer.isConnected(phone)) {
        wsServer.send(phone, 'wa_status', { connected: isConnected });
      }
    } catch (e) {
      this.logger.warn(`Failed to push wa_status to driver app ${phone}: ${e?.message}`);
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

    // Stamp arrival time so downstream can separate upstream vs. internal latency
    (payload as any).__arrivalMs = now;

    if (messageAge < 2000) {
      setImmediate(() => this.handleIncomingMessage(phone, payload).catch(e => this.logger.error(`handleIncomingMessage failed: ${e?.message}`)));
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
        try { jobData = JSON.parse(data); } catch { return; }
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
      try { trackSearchKeyword = JSON.parse(trackSearchKeywordData); } catch { trackSearchKeyword = []; }
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

    // Get keywords from WebSocket connection (Android app)
    const wsConn = DriverWsServer.getInstance().getConnection(phone);
    const pausedSet = new Set(wsConn?.pausedKeywords || []);

    // Merge WebSocket app keywords with MongoDB keywords
    // (app stores keywords locally - they may not all be synced to MongoDB)
    const mergedKeywords = [...trackSearchKeyword];
    if (wsConn?.keywords?.length) {
      const existingKwSet = new Set(trackSearchKeyword.map(k => k.keyword));
      for (const kw of wsConn.keywords) {
        if (!existingKwSet.has(kw)) {
          mergedKeywords.push({ keyword: kw } as DriverSearchKeywordDocument);
        }
      }
    }

    for (const keyword of mergedKeywords) {
      if (pausedSet.has(keyword.keyword)) continue; // skip paused keywords
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

  /** Resolve a shortcut (e.g. "ים") to its full area name (e.g. "ירושלים"). */
  private async resolveAreaName(area: string): Promise<string> {
    const areasData = await this.getAreasData();
    const key = area.toLowerCase();
    return areasData.shortcuts[key] || area;
  }

  private async shouldHaveMinimumCitiesNumber(message: string) {
    const originAndDestination = await getOriginAndDestination(message, this.redisClient, await this.getAreasData());
    if (!originAndDestination) return '';
    const words = originAndDestination.split('_');
    if (words.length >= 2) return words.join('_');
    // Internal ride: "פנימי ים" / "פ בב" — only 1 city found, duplicate it as origin_destination
    if (words.length === 1 && isInternalRide(message)) {
      return `${words[0]}_${words[0]}`;
    }
    return '';
  }

  // Cache all approved drivers in Redis with key `driver:${phone}`
  private async setAllDriversCache() {
    try {
      const activeDrivers = await this.driverModel.find({ isApproved: true }).lean().exec();
      const pipeline = this.redisClient.pipeline();
      for (const driver of activeDrivers) {
        pipeline.set(`driver:${driver.phone}`, JSON.stringify(driver));
      }
      await pipeline.exec();
      this.logger.log(`setAllDriversCache: cached ${activeDrivers.length} drivers`);
    } catch (e: any) {
      this.logger.error(`setAllDriversCache initial load failed: ${e?.message}`);
    }

    setInterval(async () => {
      try {
        const drivers = await this.driverModel.find({ isApproved: true }).lean().exec();
        const pipe = this.redisClient.pipeline();
        for (const driver of drivers) {
          pipe.set(`driver:${driver.phone}`, JSON.stringify(driver));
        }
        await pipe.exec();
      } catch (e: any) {
        this.logger.error(`setAllDriversCache refresh failed: ${e?.message}`);
      }
    }, 10 * 60 * 1000);
  }

  private async getAllDriversFromRedis(): Promise<Driver[]> {
    const keys = await this.redisClient.keys('driver:*');
    if (keys.length === 0) return [];
    const drivers = await this.redisClient.mget(...keys);
    return drivers
      .filter(Boolean)
      .map(d => { try { return JSON.parse(d); } catch { return null; } })
      .filter(Boolean) as Driver[];
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

  private async sendFormatMessageRegular(phone: string, obj: any, language: string, searchKeyword: DriverSearchKeywordDocument, originAndDestination: string, botPhone?: string) {
    let msgTemplate = `${this.localizationService.getMessage('newRidesMessage', language)}
${fixBoldMultiLine(obj.body)}
\u200F${this.localizationService.getMessage('senderName', language)} ${obj.fromName}
\u200F${this.localizationService.getMessage('senderPhone', language)} ${toLocalPhoneNumber(obj.senderPhone) ?? obj.senderPhone}
\u200F${this.localizationService.getMessage('groupName', language)} ${obj.groupName}
${this.localizationService.getMessage('keyWordSignAppName', language)}`;

    let msgTrack = `${this.localizationService.getMessage('newRidesMessage', language)}
${fixBoldMultiLine(obj.body)}`;

    const waLink = extractRelevantLinkFromMessage(obj.body, searchKeyword.keyword.split('_'));
    let parsedLinkRegular: { phoneNumber?: string; messageText?: string } | null = null;
    if (waLink) {
      parsedLinkRegular = extractPhoneAndTextFromWaMeLink(waLink);
      if (!parsedLinkRegular?.phoneNumber) return; // only phone required
      // FIX: fallback to obj.body if Groq fails
      const formattedMessage = await this.formatWhatsAppMessage(obj.body) || obj.body;
      msgTemplate = `${this.localizationService.getMessage('newRidesMessage', language)}
${fixBoldMultiLine(formattedMessage)}
\u200F${this.localizationService.getMessage('senderName', language)} ${obj.fromName}
\u200F${this.localizationService.getMessage('senderPhone', language)} ${toLocalPhoneNumber(obj.senderPhone) ?? obj.senderPhone}
\u200F${this.localizationService.getMessage('groupName', language)} ${obj.groupName}
${this.localizationService.getMessage('keyWordSignAppName', language)}`;
      msgTrack = `${this.localizationService.getMessage('newRidesMessage', language)}
${fixBoldMultiLine(formattedMessage)}`;
    }

    // ✅ Send ride to Android app BEFORE dedup (app uses messageId for its own dedup)
    // ✅ FIX: Apply keyword filter to main phone too — without this,
    // the bot owner receives ALL rides from ALL groups regardless of keywords.
    try {
      const wsServer = DriverWsServer.getInstance();
      const mainSearchKw = await this.validateSearchKeyword(phone, originAndDestination);
      if (wsServer.isConnected(phone) && mainSearchKw) {
        const [originRaw, destinationRaw] = originAndDestination.split('_');
        const origin = await this.resolveAreaName(originRaw || '');
        const destination = await this.resolveAreaName(destinationRaw || '');
        const parsedForType = parseRideMessage(obj.body || '');
        const messageType = parsedForType.blocks[0]?.type || (waLink ? 'single_link' : 'regular_text');
        wsServer.sendRide(phone, {
          messageId: obj.messageId,
          groupName: obj.groupName || '',
          origin,
          destination,
          price: '',
          seats: '',
          rawText: obj.body || '',
          timestamp: +obj.timestamp,
          isUrgent: false,
          hasLink: !!waLink,
          linkPhone: parsedLinkRegular?.phoneNumber || '',
          linkText: parsedLinkRegular?.messageText || (waLink ? 'ת' : ''),
          messageType,
          senderPhone: obj.senderPhone || '',
        });
        // Store context so we can handle ride actions from the Android app.
        // botPhone MUST be the bot that received the group message (member of
        // the group), not the driver being notified.
        this.rideContext.set(obj.messageId, {
          botPhone: botPhone || phone,
          groupId: obj.groupId || '',
          senderPhone: obj.senderPhone || '',
          senderName: obj.fromName || '',
          origin: origin || '',
          destination: destination || '',
        });
        setTimeout(() => this.rideContext.delete(obj.messageId), 30 * 60 * 1000);
        this.logger.log(`>> Sent ride (regular) to Android app: ${phone} -> ${originAndDestination}`);
      }
    } catch (wsErr) {
      this.logger.warn(`Failed to send ride (regular) to Android app for ${phone}: ${wsErr?.message}`);
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
    this.logger.log(`>> Send found rides to driver: ${phone} -> ${originAndDestination} after ${((end - messageTimestamp) / 1000).toFixed(2)}s`);
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

  private async handleMessageListenerRegular(phones: string[], obj: any, botPhone?: string) {
    try {
      if (!phones?.length) return;

      // ⚡ HOIST: compute origin/destination ONCE per message, not per driver.
      // Was running getOriginAndDestination (text scan over ~1000 areas) for
      // every driver in the group — with 50 drivers × 500 groups that's 25k
      // wasted scans/sec under load. Bail out for the whole batch if no cities.
      const originAndDestination = await this.shouldHaveMinimumCitiesNumber(obj.body);
      if (!originAndDestination) return;

      // ⚡ HOIST: parse body once (used inside the per-driver WS dispatch).
      const parsedRideShared = parseRideMessage(obj.body || '');

      // ⚡ BATCH: pipeline per-driver dedup SETs (NX+EX in one op each, all
      // sent in a single Redis round-trip instead of N×2 sequential round-trips)
      const dedupePipeline = this.redisClient.pipeline();
      for (const phone of phones) {
        const dedupeKey = `wa:regular:dedupe:${phone}:${obj.groupId}:${obj.messageId}`;
        dedupePipeline.set(dedupeKey, '1', 'EX', 11, 'NX');
      }
      const dedupeResults = await dedupePipeline.exec() || [];
      // dedupeResults[i] === [err, 'OK' | null]; null means key already existed
      const dedupedPhones = phones.filter((_, i) => {
        const r = dedupeResults[i];
        return r && r[0] == null && r[1] != null;
      });
      if (dedupedPhones.length === 0) return;

      // ⚡ BATCH: mget all driver records in a single Redis call instead of
      // N sequential GETs. Order matches dedupedPhones.
      const driverKeys = dedupedPhones.map(p => `driver:${p}`);
      const driverCaches = driverKeys.length > 0
        ? await this.redisClient.mget(...driverKeys)
        : [];

      for (let i = 0; i < dedupedPhones.length; i++) {
        const phone = dedupedPhones[i];
        const driverCache = driverCaches[i];
        try {
          // ── Benchmark: track skip reasons for this phone ──
          let _benchSkip: string | null = null;
          const _benchStart = Date.now();

          if (phone === obj.senderPhone) continue;
          if (!driverCache) continue;
          const driver: Driver = JSON.parse(driverCache);

          if (driver?.isBusy || !driver?.isApproved) { _benchSkip = 'driver_busy_or_not_approved'; this._benchLog(phone, obj, false, _benchSkip, _benchStart, originAndDestination); continue; }
          if (!isInTrial(driver)) { _benchSkip = 'not_in_trial'; this._benchLog(phone, obj, false, _benchSkip, _benchStart, originAndDestination); continue; }
          if (isNeedToPay(driver)) { _benchSkip = 'needs_payment'; this._benchLog(phone, obj, false, _benchSkip, _benchStart, originAndDestination); continue; }
          if (driver.filterGroups.includes(obj.groupId.replace('@g.us', ''))) { _benchSkip = 'group_filtered'; this._benchLog(phone, obj, false, _benchSkip, _benchStart, originAndDestination); continue; }
          // Groups blacklist — driver opted out of this group entirely
          if ((driver as any).blacklistedGroups?.includes(obj.groupId)) { _benchSkip = 'group_blacklisted'; this._benchLog(phone, obj, false, _benchSkip, _benchStart, originAndDestination); continue; }

          const language = getLanguageByPhoneNumber(phone);

          // BigBot app: filter by user-selected vehicle types (multi-select).
          // categoryFilters values come from the Android settings screen and are
          // Hebrew labels like "4 מקומות", "מיניק", "כולם", etc.
          // When the driver uses the new Hebrew-label system we skip the legacy
          // isDriverEligible() check (which uses old English IDs like "4Seats")
          // and rely solely on matchAppVehicleFilter().
          const appFilters = (driver.categoryFilters || [])
            .map((f: any) => f?.key)
            .filter((k: any) => typeof k === 'string' && k.length > 0);
          const usingNewFilterSystem = appFilters.length > 0;
          if (usingNewFilterSystem) {
            if (!matchAppVehicleFilter(obj.body || '', appFilters)) { this._benchLog(phone, obj, false, 'vehicle_mismatch', _benchStart, originAndDestination); continue; }
          } else {
            if (!isDriverEligible(driver, obj.body, this.localizationService)) { this._benchLog(phone, obj, false, 'vehicle_mismatch', _benchStart, originAndDestination); continue; }
          }

          // Delivery filter: if the ride is a delivery and the driver opted out → skip.
          // Default: drivers accept deliveries (acceptDeliveries not set = true).
          if ((driver as any).acceptDeliveries === false && isDeliveryRide(obj.body || '')) {
            this._benchLog(phone, obj, false, 'delivery_rejected', _benchStart, originAndDestination); continue;
          }

          // Internal ride filter: "פנימי ים" / "פ בב" — ride within same city.
          // Default: drivers do NOT accept internal rides (acceptInternalRides not set = false).
          if ((driver as any).acceptInternalRides !== true && isInternalRide(obj.body || '')) {
            this._benchLog(phone, obj, false, 'internal_ride_rejected', _benchStart, originAndDestination); continue;
          }

          // Round-trip filter: "הלוך ושוב" / "הלוש" / "הוש".
          // Default: drivers accept round trips (acceptRoundTrip not set = true).
          if ((driver as any).acceptRoundTrip === false && isRoundTrip(obj.body || '')) {
            this._benchLog(phone, obj, false, 'round_trip_rejected', _benchStart, originAndDestination); continue;
          }

          const searchKeyword = await this.validateSearchKeyword(phone, originAndDestination);
          if (!searchKeyword) { this._benchLog(phone, obj, false, 'no_matching_keyword', _benchStart, originAndDestination); continue; }

          // BigBot app: km-range filter. If the driver set a range in the
          // Android app, skip rides whose origin city is farther than that
          // range from ANY of their keyword cities. Fail-open when either
          // side is missing coords (so new/un-geocoded cities don't silently
          // block rides). kmFilter=null/0/undefined → no filter.
          if ((driver as any).kmFilter && (driver as any).kmFilter > 0) {
            const kwDocs = await this.driverSearchKeywordService.getDriverSearchHistory(phone);
            const driverKeywords = kwDocs
              .filter(d => !d.isBlocked)
              .map(d => d.keyword);
            const rideOrigin = (originAndDestination || '').split('_')[0] || '';
            const passes = await this.passesKmFilter(
              (driver as any).kmFilter,
              rideOrigin,
              driverKeywords,
            );
            if (!passes) { this._benchLog(phone, obj, false, 'km_range_exceeded', _benchStart, originAndDestination); continue; }
          }

          // BigBot app: minimum price filter. If the driver set a min price,
          // skip rides whose parsed price is below it. Fail-open when the
          // ride has no detectable price (so edge cases don't silently drop
          // otherwise-valid rides).
          if ((driver as any).minPrice && (driver as any).minPrice > 0) {
            const ridePrice = this.extractRidePrice(obj.body || '');
            if (ridePrice != null && ridePrice < (driver as any).minPrice) { this._benchLog(phone, obj, false, 'below_min_price', _benchStart, originAndDestination); continue; }
          }

          // Cross-group dedup: same ride posted in multiple groups should only
          // reach the driver once. Check similarity BEFORE WS send.
          const msgTrackWs = `${originAndDestination}:${obj.body || ''}`;
          const isDupWs = await this.checkMessageDuplicate(phone, msgTrackWs);
          if (isDupWs) { this._benchLog(phone, obj, false, 'cross_group_duplicate', _benchStart, originAndDestination); continue; }
          // Mark as seen (SET NX, 5 min TTL)
          const wsDedupeKey = `trackedMessage:${phone}:${Buffer.from(msgTrackWs).toString('base64').substring(0, 100)}`;
          const wsDedupeResult = await this.redisClient.set(wsDedupeKey, msgTrackWs, 'EX', 60 * 5, 'NX');
          if (wsDedupeResult === null) { this._benchLog(phone, obj, false, 'cross_group_duplicate', _benchStart, originAndDestination); continue; }

          // ✅ Send to Android app IMMEDIATELY (before any queue/Groq delay).
          // ⚡ Do NOT gate on isConnected — buffer in DriverWsServer queues the
          // ride if WS is momentarily down and replays on reconnect, so a brief
          // disconnect window cannot lose a ride. Skipping the immediate path
          // dropped us into the slow Groq+DB queued path (1-2s latency).

          // Pre-compute ETA (minutes) from the driver's keyword city to the
          // ride's origin. Uses Haversine distance / ~60 km/h average speed.
          // Sent in the ride payload so the notification shows ETA immediately
          // (no GPS wait). 0 = unknown (missing coords).
          let etaMinutes = 0;
          try {
            const rideOrigin = (originAndDestination || '').split('_')[0] || '';
            const originCoords = await this.getCityCoords(rideOrigin);
            if (originCoords) {
              const kwDocs = await this.driverSearchKeywordService.getDriverSearchHistory(phone);
              const kwNames = kwDocs.filter(d => !d.isBlocked).map(d => (d.keyword || '').split('_')[0].trim()).filter(k => k.length > 0);
              let minDist = Infinity;
              for (const kw of kwNames) {
                const kwCoords = await this.getCityCoords(kw);
                if (kwCoords) {
                  const d = this.haversineKm(originCoords.lat, originCoords.lng, kwCoords.lat, kwCoords.lng);
                  if (d < minDist) minDist = d;
                }
              }
              if (minDist < Infinity) {
                // ~60 km/h average, minimum 1 minute
                etaMinutes = Math.max(1, Math.round(minDist / 60 * 60));
              }
            }
          } catch { /* ETA calc failure — leave 0 */ }

          try {
            const wsServer = DriverWsServer.getInstance();
            {
              const [originRaw, destinationRaw] = originAndDestination.split('_');
              const origin = await this.resolveAreaName(originRaw || '');
              const destination = await this.resolveAreaName(destinationRaw || '');
              // ⚡ Reuse the parse computed once at top of function
              const parsed = parsedRideShared;

              // For multi_ride, emit one ride card per block (each block is its own
              // ride message). For 0/1/2-link messages, blocks has exactly one entry.
              const isMulti = parsed.type === 'multi_ride';
              parsed.blocks.forEach((block, idx) => {
                const blockMessageId = isMulti
                  ? `${obj.messageId}#${idx}`
                  : obj.messageId;
                const blockType = block.type; // 'regular_text' | 'single_link' | 'two_links'

                wsServer.sendRide(phone, {
                  messageId: blockMessageId,
                  groupName: obj.groupName || '',
                  origin,
                  destination,
                  price: '', seats: '',
                  rawText: isMulti ? block.rawText : (obj.body || ''),
                  timestamp: +obj.timestamp,
                  isUrgent: false,
                  etaMinutes,
                  // Backwards-compatible fields (Android still uses these for the
                  // single-link "take ride" auto-mode flow)
                  hasLink: blockType === 'single_link' || blockType === 'two_links',
                  linkPhone: block.rideRequestPhone || '',
                  linkText: block.rideRequestText || (block.rideRequestLink ? 'ת' : ''),
                  // New spec fields
                  messageType: blockType,
                  chatLink: block.chatLink || '',
                  chatPhone: block.chatPhone || '',
                  chatText: block.chatText || '',
                  senderPhone: obj.senderPhone || '',
                  isInternalRide: isInternalRide(obj.body || ''),
                  isRoundTrip: isRoundTrip(obj.body || ''),
                });

                this.rideContext.set(blockMessageId, {
                  // botPhone MUST be the bot that received the group message
                  // (and is a member of the group), NOT the driver iterated in
                  // this loop. Only the receiving bot can reply to that group.
                  botPhone: botPhone || phone,
                  groupId: obj.groupId || '',
                  senderPhone: obj.senderPhone || '',
                  senderName: obj.fromName || '',
                  origin: origin || '',
                  destination: destination || '',
                });
                setTimeout(() => this.rideContext.delete(blockMessageId), 30 * 60 * 1000);
              });
              const latencyMs = Date.now() - (+obj.timestamp * 1000);
              this.logger.log(
                `>> [immediate] Sent ride to Android app: ${phone} -> ${originAndDestination} (${parsed.type}, ${parsed.blocks.length} block${parsed.blocks.length > 1 ? 's' : ''}) latency=${latencyMs}ms viaBot=${botPhone || phone}`
              );
              // ── Benchmark: log successful send ──
              this._benchLog(phone, obj, true, null, _benchStart, originAndDestination);
            }
          } catch (wsErr) {
            this.logger.warn(`Failed immediate WS send for ${phone}: ${wsErr?.message}`);
          }

          this.enqueueSendMessage(phone, () =>
            this.sendFormatMessageRegular(phone, obj, language, searchKeyword, originAndDestination, botPhone)
          );
        } catch (error) {
          this.logger.error(`Error in handleMessageListenerRegular for ${phone}:`, error);
        }
      }
    } catch (error) {
      this.logger.error(`Error in handleMessageListenerRegular:`, error);
    }
  }

  /** Benchmark helper: log group event if a benchmark run is active for this phone. */
  private _benchLog(phone: string, obj: any, recognized: boolean, skipReason: string | null, startMs: number, originDest?: string) {
    if (!this.benchmarkService) return;
    this.benchmarkService.getActiveRun(phone).then(run => {
      if (!run) return;
      const parts = (originDest || '').split('_');
      this.benchmarkService.logGroupEvent(
        run.runId, obj, recognized, skipReason,
        Date.now() - startMs,
        parts[0], parts[1],
        this.extractRidePrice(obj.body || '')?.toString(),
      );
    }).catch(() => {});
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
      if ((driver as any).blacklistedGroups?.includes(obj.groupId)) return false;

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

      // BUG FIX: the forwarder path was skipping drivers who use the new
      // Hebrew-label vehicle filter system ("4 מקומות", "מיניק", etc.)
      // because isDriverEligible() only understands legacy English IDs.
      // Mirror the two-path logic from handleMessageListenerRegular so
      // forwarders who configured their vehicle via the Android app are no
      // longer silently excluded from their own group's rides.
      const appFilters = (driver.categoryFilters || [])
        .map((f: any) => f?.key)
        .filter((k: any) => typeof k === 'string' && k.length > 0);
      const usingNewFilterSystem = appFilters.length > 0 &&
        !appFilters.every((k: string) => /^[a-zA-Z]/.test(k));
      if (usingNewFilterSystem) {
        if (!matchAppVehicleFilter(obj.body || '', appFilters)) return false;
      } else {
        if (!isDriverEligible(driver, obj.body, this.localizationService)) return false;
      }

      let privateMessageCacheKey = `privateMessage:${phone}:${originAndDestination}`;
      let privateMessageData = await this.redisClient.get(privateMessageCacheKey);
      let privateMessage: any;
      if (privateMessageData) {
        try { privateMessage = JSON.parse(privateMessageData); } catch { privateMessage = null; }
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

      // ✅ Send to Android app IMMEDIATELY (before any Groq/DB delay).
      // This path handles the connected bot driver. Mirror the same immediate
      // WS send from handleMessageListenerRegular so rides reach the Android
      // app sub-second. Buffer in DriverWsServer covers disconnect windows.

      // Pre-compute ETA for the forwarder — same logic as regular path.
      let fwdEtaMinutes = 0;
      try {
        const rideOrig = (originAndDestination || '').split('_')[0] || '';
        const origC = await this.getCityCoords(rideOrig);
        if (origC) {
          const kwDocs = await this.driverSearchKeywordService.getDriverSearchHistory(phone);
          const kwList = kwDocs.filter(d => !d.isBlocked).map(d => (d.keyword || '').split('_')[0].trim()).filter(k => k.length > 0);
          let minD = Infinity;
          for (const kw of kwList) {
            const kwC = await this.getCityCoords(kw);
            if (kwC) { const d = this.haversineKm(origC.lat, origC.lng, kwC.lat, kwC.lng); if (d < minD) minD = d; }
          }
          if (minD < Infinity) fwdEtaMinutes = Math.max(1, Math.round(minD / 60 * 60));
        }
      } catch { /* leave 0 */ }

      try {
        const wsServer = DriverWsServer.getInstance();
        const [originRaw3, destinationRaw3] = originAndDestination.split('_');
        const origin = await this.resolveAreaName(originRaw3 || '');
        const destination = await this.resolveAreaName(destinationRaw3 || '');
        const parsed = parseRideMessage(obj.body || '');
        const isMulti = parsed.type === 'multi_ride';
        parsed.blocks.forEach((block, idx) => {
          const blockMessageId = isMulti ? `${obj.messageId}#${idx}` : obj.messageId;
          const blockType = block.type;
          wsServer.sendRide(phone, {
            messageId: blockMessageId,
            groupName: obj.groupName || '',
            origin,
            destination,
            price: '', seats: '',
            rawText: isMulti ? block.rawText : (obj.body || ''),
            timestamp: +obj.timestamp,
            isUrgent: false,
            etaMinutes: fwdEtaMinutes,
            hasLink: blockType === 'single_link' || blockType === 'two_links',
            linkPhone: block.rideRequestPhone || '',
            linkText: block.rideRequestText || (block.rideRequestLink ? 'ת' : ''),
            messageType: blockType,
            chatLink: block.chatLink || '',
            chatPhone: block.chatPhone || '',
            chatText: block.chatText || '',
            senderPhone: obj.senderPhone || '',
          });
          this.rideContext.set(blockMessageId, {
            botPhone: phone,
            groupId: obj.groupId || '',
            senderPhone: obj.senderPhone || '',
            senderName: obj.fromName || '',
            origin: origin || '',
            destination: destination || '',
          });
          setTimeout(() => this.rideContext.delete(blockMessageId), 30 * 60 * 1000);
        });
        const nowMs = Date.now();
        const totalMs = nowMs - (+obj.timestamp * 1000);
        const arrivalMs = (obj as any).__arrivalMs as number | undefined;
        const upstreamMs = arrivalMs ? arrivalMs - (+obj.timestamp * 1000) : -1;
        const internalMs = arrivalMs ? nowMs - arrivalMs : -1;
        this.logger.log(
          `>> [immediate-main] Sent ride to Android app: ${phone} -> ${originAndDestination} (${parsed.type}, ${parsed.blocks.length} block${parsed.blocks.length > 1 ? 's' : ''}) total=${totalMs}ms upstream=${upstreamMs}ms internal=${internalMs}ms`
        );
        // ── Benchmark: log direct-path send ──
        this._benchLog(phone, obj, true, null, Date.now() - internalMs, originAndDestination);
      } catch (wsErr: any) {
        this.logger.warn(`Failed immediate WS send (main) for ${phone}: ${wsErr?.message}`);
      }

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
        // FIX: allow empty messageText — use default "ת" if link format is non-standard
        const parsed = extractPhoneAndTextFromWaMeLink(waLink);
        const linkPhoneNumber = parsed?.phoneNumber;
        const linkMessageText = parsed?.messageText || 'ת';
        if (!linkPhoneNumber) return false; // only require phone number
        const privateMessageBase64 = Buffer.from(linkMessageText).toString('base64');
        // FIX: if Groq formatting fails, fall back to original body instead of blocking
        const formattedMessage = await this.formatWhatsAppMessage(obj.body) || obj.body;
        msgTemplate = `${this.localizationService.getMessage('newRidesMessage', language)}
${fixBoldMultiLine(formattedMessage)}
\u200F${this.localizationService.getMessage('senderName', language)} ${obj.fromName}
\u200F${this.localizationService.getMessage('groupName', language)} ${obj.groupName}
${this.localizationService.getMessage('keyWordSignAppName', language)}`;
        msgTrack = `${this.localizationService.getMessage('newRidesMessage', language)}
${fixBoldMultiLine(formattedMessage)}`;
        buttons.pop();
        buttons.push({
          id: `sendPrivateMessageButton_${linkPhoneNumber}_BASE64${privateMessageBase64}_${obj.groupId}_${obj.messageId}`,
          title: this.localizationService.getMessage('sendPrivateMessageButton', language)
        });
      }

      // NOTE: WS send to Android app already happened in the immediate path
      // inside handleMessageListenerRegular (before this slow Groq+DB stage).
      // Don't re-send here — client dedupes by messageId anyway, but this saves
      // the redundant work and avoids confusion in latency timing.

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
    const ageMs = now - messageTimestamp;
    if (messageTimestamp < now - 60000) {
      this.logger.log(`[MSG-SKIP] too old: age=${ageMs}ms body="${(payload.body||'').slice(0,40)}"`);
      return;
    }

    // Debug: log what we're processing
    const bodyPreview = (payload.body || '').slice(0, 60).replace(/\n/g, ' ');
    this.logger.log(`[MSG-PROC] phone=${phone} group=${payload.groupId?.slice(0,15)} age=${ageMs}ms type=${payload.type || '?'} body="${bodyPreview}" participants=${payload.participants?.length || 0}`);

    // Process the forwarding user's own driver (the user whose WhatsApp
    // session caught the message and forwarded it to us).
    this.handleMessageListener(phone, payload);

    // Scan the group once and match against EVERY driver who's a member of
    // the group, regardless of whether they have their own WhatsApp session
    // connected. The Go bot globally dedups so we only get the message once —
    // so we must cover all drivers here. Excludes the forwarder (already
    // handled above) and the message sender.
    // If participants list is missing (Go bot cache miss), try to fetch from
    // Redis group cache. This avoids dropping the broadcast path entirely.
    let participants: string[] = payload?.participants || [];
    if (participants.length === 0 && payload?.groupId) {
      try {
        const groupKey = payload.groupId.includes('@') ? payload.groupId : `${payload.groupId}@g.us`;
        const cached = await this.redisClient.get(`group:info:${groupKey}`);
        if (cached) {
          const groupInfo = JSON.parse(cached);
          if (groupInfo?.participants?.length > 0) {
            participants = groupInfo.participants.map((p: any) =>
              (p.phoneNumber || p.jid || '').replace('@s.whatsapp.net', '').replace('@lid', '')
            ).filter((p: string) => p && /^\d+$/.test(p));
            this.logger.log(`[PARTICIPANTS-FIX] Recovered ${participants.length} participants from Redis cache for group ${payload.groupId.slice(0,15)}`);
          }
        }
      } catch (e: any) {
        this.logger.warn(`[PARTICIPANTS-FIX] Redis lookup failed: ${e?.message}`);
      }
    }

    if (participants.length > 0) {
      const { drivers: allDrivers } = await this.getDriversAndConnectionStatus();
      const driversMap = new Map(allDrivers.map(d => [d.phone, d]));

      const driversInGroup: string[] = [];
      for (const pn of participants) {
        const driver = driversMap.get(pn);
        if (!driver?.phone) continue;
        if (driver.phone === phone) continue;            // forwarder already done
        if (driver.phone === payload.senderPhone) continue; // don't notify the sender
        driversInGroup.push(driver.phone);
      }

      if (driversInGroup.length > 0) {
        setImmediate(() => {
          this.handleMessageListenerRegular(driversInGroup, payload, phone).catch(error => {
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
    const { senderPhone, body, fromName, timestamp, isFromMe, messageId } = payload;
    // Diagnostic: log EVERY incoming private message regardless of filter
    this.logger.log(
      `>> [PRIV-RAW] bot=${botPhone} sender=${senderPhone} isFromMe=${isFromMe} bodyLen=${(body||'').length} body="${(body||'').slice(0,80).replace(/\s+/g,' ')}"`
    );
    if (!senderPhone || !body) return;

    // 🕵️ DRIVEBOT TRACKING — competitor bot 972552732722 sends rides via private
    // message. Log every message it sends so we can compare against our own
    // [immediate-main] output. Use loose matching: senderPhone might be in
    // formats like "972552732722", "972552732722@s.whatsapp.net", or with
    // trailing :NN device id. Strip non-digits and check prefix.
    const senderDigits = String(senderPhone || '').replace(/\D/g, '');
    const isDrivebot = senderDigits.startsWith('972552732722');
    if (isDrivebot && !isFromMe) {
      try {
        const od = await this.shouldHaveMinimumCitiesNumber(body);
        const firstLine = (body || '').split('\n')[0].slice(0, 120).replace(/\s+/g, ' ');
        const ts = timestamp ? +timestamp * 1000 : Date.now();
        const ageMs = Date.now() - ts;
        this.logger.log(
          `>> [DRIVEBOT] to=${botPhone} od=${od || 'NO_MATCH'} ts=${ts} age=${ageMs}ms msgId=${messageId || ''} firstLine="${firstLine}"`
        );
        // ── Benchmark: log DryBot private message ──
        if (this.benchmarkService) {
          // botPhone is the driver who received this DryBot message
          const benchRun = await this.benchmarkService.getActiveRun(botPhone);
          if (benchRun) {
            await this.benchmarkService.logDrybotEvent(benchRun.runId, payload);
          }
        }
      } catch (e: any) {
        this.logger.warn(`[DRIVEBOT] log failed: ${e?.message}`);
      }
    } else if (!isFromMe && body && body.length > 20) {
      // Temporary diagnostic: log first 60 chars + sender so we can see what
      // format senderPhone arrives in (helps identify drivebot if format differs).
      this.logger.log(`>> [PRIV-MSG] from=${senderPhone} to=${botPhone} body="${(body||'').slice(0,60).replace(/\s+/g,' ')}"`);
    }

    // WHITELIST sync: only mirror conversations the user has explicitly opened
    // from inside the app (by tapping reply_private / reply_both / take_ride_link
    // / open_chat on a ride card). Random WhatsApp DMs that have nothing to do
    // with BigBot stay in WhatsApp only — they must NOT pollute the app's chat tab.
    let routedDriverPhone = this.chatRouting.get(senderPhone);
    let autoOpen = false;
    let pendingRide: any = null;

    // If not yet whitelisted, check whether this incoming message matches a
    // pending chat token (set by a recent open_chat action). When the chat
    // bot triggers the dispatcher, the dispatcher's reply will contain the
    // same ride-id-like tokens we stashed — that's how we discover the
    // dispatcher's actual phone for the first time.
    // Check pending chat tokens — even for already-whitelisted senders, because
    // the dispatcher may have been whitelisted from a previous ride but this is
    // a NEW ride confirmation that needs to fire success.
    if (!isFromMe) {
      const now = Date.now();
      const tokenCount = this.pendingChatTokens.size;
      if (tokenCount > 0) {
        const myTokens = [...this.pendingChatTokens.entries()].filter(([, i]) => i.driverPhone === botPhone).map(([t]) => t);
        this.logger.log(`[TOKEN-CHECK] sender=${senderPhone} bot=${botPhone} body="${(body||'').slice(0,60)}" tokens=${myTokens.length}: ${myTokens.join(', ')}`);
      }
      for (const [tok, info] of this.pendingChatTokens.entries()) {
        if (info.expiresAt < now) {
          this.pendingChatTokens.delete(tok);
          continue;
        }
        if (info.driverPhone !== botPhone) continue;
        // For short tokens (< 5 chars), require whole-word match to prevent
        // "ים" matching inside "הנופלים". For longer tokens (IDs, numbers),
        // substring match is safe.
        let tokMatches = false;
        if (tok.length >= 5) {
          tokMatches = body.includes(tok);
        } else {
          const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          tokMatches = new RegExp(`(?:^|\\s)${escaped}(?=$|\\s)`, 'g').test(body);
        }
        if (tokMatches) {
          // Match — promote this sender to the whitelist and signal the app
          // to auto-open this chat.
          this.chatRouting.set(senderPhone, botPhone);
          routedDriverPhone = botPhone;
          autoOpen = true;
          pendingRide = info.ride;
          // Fire ride_update success — the dispatcher confirmed the ride
          const wsServer2 = DriverWsServer.getInstance();
          wsServer2.sendRideUpdate(botPhone, {
            rideId: info.rideId,
            status: 'success',
            dispatcherPhone: senderPhone,
            dispatcherName: fromName || senderPhone,
            origin: info.ride?.origin || '',
            destination: info.ride?.destination || '',
            message: body.slice(0, 200),
          });
          this.logger.log(`🎉 Token match → dispatcher ${senderPhone} confirmed ride ${info.rideId} for ${botPhone}`);
          // Drop ALL pending tokens for this driver
          for (const [t, i] of this.pendingChatTokens.entries()) {
            if (i.driverPhone === botPhone) this.pendingChatTokens.delete(t);
          }
          break;
        }
      }
    }

    if (!routedDriverPhone || routedDriverPhone !== botPhone) return;

    // First reply from a take_ride_link contact → auto-open the chat.
    // But NOT if the sender is a link bot — bot replies are intermediary only.
    if (!isFromMe && this.awaitingFirstReply.get(senderPhone) === botPhone) {
      if (!this.linkBotPhones.has(senderPhone)) {
        autoOpen = true;
        this.logger.log(`First reply from dispatcher ${senderPhone} → auto-open chat for driver ${botPhone}`);
      } else {
        this.logger.log(`First reply from LINK BOT ${senderPhone} → skipping auto-open`);
      }
      this.awaitingFirstReply.delete(senderPhone);
    }

    const wsServer = DriverWsServer.getInstance();

    // 🎉 Dispatcher reply ack — if we were waiting for this dispatcher to
    // respond (after the user pressed ת לקבוצה / ת לפרטי / ת לשניהם), this
    // incoming private message means "you got the ride". Fire the success
    // ride_update so the app swaps the card to SuccessCard and shows the
    // "קיבלת את הנסיעה" notification. Only fire for incoming (not outgoing).
    //
    // IMPORTANT: replies from link BOT phones (take_ride_link targets) do NOT
    // count as "ride accepted". The bot is just an intermediary. Only a reply
    // from the actual dispatcher (a different phone) confirms the ride.
    const isLinkBot = this.linkBotPhones.has(senderPhone);
    if (!isFromMe && isLinkBot) {
      // Bot replied — check if it asks for ETA ("זמן")
      const lowerBody = (body || '').toLowerCase();
      if (lowerBody.includes('זמן')) {
        // Auto-reply with the driver's configured default ETA
        const conn = wsServer.getConnection(botPhone);
        const defaultEta = conn?.defaultEta || 5;
        try {
          await this.wabotService.sendPrivateMessage(botPhone, senderPhone, String(defaultEta));
          this.logger.log(`Auto-ETA reply: sent "${defaultEta}" to bot ${senderPhone} for driver ${botPhone}`);
        } catch (e: any) {
          this.logger.warn(`Auto-ETA reply failed: ${e?.message}`);
        }
      }
      this.logger.log(`Link bot ${senderPhone} replied to ${botPhone} — NOT marking as success`);
      // Don't fire success — fall through to chat sync only
    } else if (!isFromMe) {
      const pendingKey = `${botPhone}:${senderPhone}`;
      const pending = this.pendingReplyRides.get(pendingKey);
      if (pending && pending.expiresAt > Date.now()) {
        this.pendingReplyRides.delete(pendingKey);
        wsServer.sendRideUpdate(botPhone, {
          rideId: pending.rideId,
          status: 'success',
          dispatcherPhone: senderPhone,
          dispatcherName: fromName || senderPhone,
          origin: pending.origin,
          destination: pending.destination,
          message: body.slice(0, 200),
        });
        this.logger.log(
          `🎉 Dispatcher ${senderPhone} accepted ride ${pending.rideId} for driver ${botPhone} (${pending.origin}→${pending.destination})`
        );
      }
    }

    if (!wsServer.isConnected(botPhone)) return;

    wsServer.send(botPhone, 'chat_message', {
      id: messageId || `${senderPhone}_${Date.now()}`,
      from: senderPhone,
      fromName: fromName || senderPhone,
      text: body,
      timestamp: timestamp ? timestamp * 1000 : Date.now(),
      isOutgoing: !!isFromMe,
      autoOpen,
      // Pass ride context so the app can show origin/destination on the new chat
      rideOrigin: pendingRide?.origin || '',
      rideDestination: pendingRide?.destination || '',
      ridePrice: pendingRide?.price || '',
    });
    this.logger.log(
      `Synced ${isFromMe ? 'outgoing' : 'incoming'} chat: ${botPhone} ↔ ${senderPhone}: "${body}"${autoOpen ? ' [auto-open]' : ''}`
    );
  }
}
