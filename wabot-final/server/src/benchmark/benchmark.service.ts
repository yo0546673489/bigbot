import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { BenchmarkEvent, BenchmarkEventDocument } from './benchmark-event.schema';
import { BenchmarkRun, BenchmarkRunDocument } from './benchmark-run.schema';

@Injectable()
export class BenchmarkService {
  private readonly logger = new Logger('BenchmarkService');
  private stopTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(BenchmarkEvent.name) private eventModel: Model<BenchmarkEventDocument>,
    @InjectModel(BenchmarkRun.name) private runModel: Model<BenchmarkRunDocument>,
  ) {}

  async startRun(driverPhone: string, drybotPhone: string, durationMinutes: number, keywords: string[]) {
    // Stop any active run for this driver first
    await this.runModel.updateMany({ driverPhone, isActive: true }, { isActive: false });

    const runId = `bench_${Date.now()}`;
    const now = new Date();
    const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

    const run = await this.runModel.create({
      runId,
      driverPhone,
      drybotPhone,
      keywords,
      startedAt: now,
      endsAt,
      isActive: true,
    });

    // Auto-stop timer
    const timer = setTimeout(() => {
      this.stopRun(runId).catch(e => this.logger.error(`Auto-stop failed: ${e.message}`));
    }, durationMinutes * 60 * 1000);
    this.stopTimers.set(runId, timer);

    this.logger.log(`Benchmark started: ${runId} for ${driverPhone}, ${durationMinutes}min, keywords=[${keywords}]`);
    return { runId, startedAt: now, endsAt };
  }

  async stopRun(runId: string) {
    const run = await this.runModel.findOneAndUpdate({ runId }, { isActive: false }, { new: true });
    const timer = this.stopTimers.get(runId);
    if (timer) { clearTimeout(timer); this.stopTimers.delete(runId); }

    const totalEvents = await this.eventModel.countDocuments({ runId });
    this.logger.log(`Benchmark stopped: ${runId}, ${totalEvents} events`);
    return { runId, totalEvents };
  }

  async getActiveRun(driverPhone: string): Promise<BenchmarkRunDocument | null> {
    return this.runModel.findOne({ driverPhone, isActive: true, endsAt: { $gt: new Date() } });
  }

  async logGroupEvent(
    runId: string,
    payload: { body?: string; groupName?: string; groupId?: string; timestamp?: number },
    recognized: boolean,
    skipReason: string | null,
    latencyMs: number,
    parsedOrigin?: string,
    parsedDestination?: string,
    parsedPrice?: string,
  ) {
    const raw = payload.body || '';
    await this.eventModel.create({
      runId,
      timestamp: new Date(),
      source: 'bigbot_group',
      groupName: payload.groupName || '',
      groupId: payload.groupId || '',
      rawMessage: raw,
      messageHash: this.hashMessage(raw),
      parsedOrigin,
      parsedDestination,
      parsedPrice,
      bigbotRecognized: recognized,
      bigbotSkipReason: skipReason || undefined,
      processingLatencyMs: latencyMs,
    });
  }

  async logDrybotEvent(runId: string, payload: { body?: string; senderPhone?: string; timestamp?: number }) {
    const raw = payload.body || '';
    const { origin, destination, price } = this.parseRideText(raw);
    await this.eventModel.create({
      runId,
      timestamp: new Date(),
      source: 'drybot_private',
      rawMessage: raw,
      messageHash: this.hashMessage(raw),
      parsedOrigin: origin,
      parsedDestination: destination,
      parsedPrice: price,
    });
  }

  hashMessage(text: string): string {
    // Extract the ride-specific content, stripping DryBot formatting.
    // DryBot appends lines like:
    //   > *סדרן:* name | phone
    //   > *חיפוש:* מירושלים
    //   🏇🏻 סיירת בעל עגולה 🏇🏻
    //   ♾️ מחובַּרים 1 ♾️
    // We strip these to match the raw group message body.
    const lines = text.split('\n');
    const coreLines = lines.filter(line => {
      const trimmed = line.trim();
      // Skip DryBot "סדרן" and "חיפוש" lines
      if (trimmed.startsWith('>') || trimmed.startsWith('> ')) return false;
      // Skip group signature lines (emoji-heavy, short, no Hebrew ride content)
      if (/^[^\u0590-\u05FF]*$/.test(trimmed) && trimmed.length < 40) return false;
      return trimmed.length > 0;
    });
    const normalized = coreLines.join(' ')
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
      .replace(/[*_~`"']/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
  }

  parseRideText(text: string): { origin?: string; destination?: string; price?: string } {
    // Try to extract "חיפוש: X" pattern
    const searchMatch = text.match(/חיפוש[:\s]*[*]?\s*(?:מ)?(.+?)$/m);
    const origin = searchMatch?.[1]?.trim();

    // Try to extract price
    const priceMatch = text.match(/(\d+)\s*[₪ש]/);
    const price = priceMatch?.[1];

    // Try to extract destination from first line or "ל" prefix
    const destMatch = text.match(/^[*]?(.+?)\s+\d+\s*[₪ש]/m) || text.match(/\bל(.+?)[\s*]/);
    const destination = destMatch?.[1]?.trim();

    return { origin, destination, price };
  }

  async generateReport(runId: string) {
    const run = await this.runModel.findOne({ runId });
    if (!run) return null;

    const events = await this.eventModel.find({ runId }).sort({ timestamp: 1 }).lean();

    const bigbotEvents = events.filter(e => e.source === 'bigbot_group');
    const drybotEvents = events.filter(e => e.source === 'drybot_private');

    // Build hash maps
    const bigbotByHash = new Map<string, typeof events[0][]>();
    for (const e of bigbotEvents) {
      const list = bigbotByHash.get(e.messageHash) || [];
      list.push(e);
      bigbotByHash.set(e.messageHash, list);
    }

    const drybotByHash = new Map<string, typeof events[0][]>();
    for (const e of drybotEvents) {
      const list = drybotByHash.get(e.messageHash) || [];
      list.push(e);
      drybotByHash.set(e.messageHash, list);
    }

    // Also try fuzzy matching: extract origin from DryBot messages and match against BigBot messages
    // that have the same origin keyword
    const allHashes = new Set([...bigbotByHash.keys(), ...drybotByHash.keys()]);

    const matched: any[] = [];
    const appMissed: any[] = [];
    const appExtra: any[] = [];

    for (const hash of allHashes) {
      const bb = bigbotByHash.get(hash);
      const db = drybotByHash.get(hash);

      const bbRecognized = bb?.some(e => e.bigbotRecognized);

      if (bbRecognized && db?.length) {
        const bbFirst = bb!.find(e => e.bigbotRecognized)!;
        const dbFirst = db[0];
        const latencyDiff = bbFirst.timestamp.getTime() - dbFirst.timestamp.getTime();
        matched.push({
          hash,
          message: (dbFirst.rawMessage || bbFirst.rawMessage).substring(0, 100),
          bigbotTime: bbFirst.timestamp,
          drybotTime: dbFirst.timestamp,
          latencyDiffMs: latencyDiff,
          bigbotLatencyMs: bbFirst.processingLatencyMs,
          groupName: bbFirst.groupName,
          parsedOrigin: bbFirst.parsedOrigin || dbFirst.parsedOrigin,
          parsedPrice: bbFirst.parsedPrice || dbFirst.parsedPrice,
        });
      } else if (db?.length && !bbRecognized) {
        const dbFirst = db[0];
        const bbSkip = bb?.find(e => !e.bigbotRecognized);
        appMissed.push({
          hash,
          message: dbFirst.rawMessage.substring(0, 200),
          drybotTime: dbFirst.timestamp,
          parsedOrigin: dbFirst.parsedOrigin,
          parsedPrice: dbFirst.parsedPrice,
          skipReason: bbSkip?.bigbotSkipReason || 'no_group_event_found',
          groupName: bbSkip?.groupName,
        });
      } else if (bbRecognized && !db?.length) {
        const bbFirst = bb!.find(e => e.bigbotRecognized)!;
        appExtra.push({
          hash,
          message: bbFirst.rawMessage.substring(0, 100),
          bigbotTime: bbFirst.timestamp,
          groupName: bbFirst.groupName,
          parsedOrigin: bbFirst.parsedOrigin,
        });
      }
    }

    // Metrics
    const totalDrybot = drybotEvents.length;
    const coveragePercent = totalDrybot > 0
      ? Math.round((matched.length / (matched.length + appMissed.length)) * 100)
      : 100;

    const bigbotLatencies = matched.filter(m => m.bigbotLatencyMs).map(m => m.bigbotLatencyMs);
    const avgBigbotLatency = bigbotLatencies.length
      ? Math.round(bigbotLatencies.reduce((a, b) => a + b, 0) / bigbotLatencies.length)
      : 0;

    const bigbotFaster = matched.filter(m => m.latencyDiffMs < 0).length;
    const drybotFaster = matched.filter(m => m.latencyDiffMs > 0).length;

    return {
      run: {
        runId: run.runId,
        driverPhone: run.driverPhone,
        drybotPhone: run.drybotPhone,
        keywords: run.keywords,
        startedAt: run.startedAt,
        endsAt: run.endsAt,
        durationMinutes: Math.round((run.endsAt.getTime() - run.startedAt.getTime()) / 60000),
      },
      summary: {
        totalDrybotRides: totalDrybot,
        totalBigbotRecognized: bigbotEvents.filter(e => e.bigbotRecognized).length,
        matched: matched.length,
        appMissed: appMissed.length,
        appExtra: appExtra.length,
        coveragePercent,
      },
      latency: {
        avgBigbotMs: avgBigbotLatency,
        bigbotFasterCount: bigbotFaster,
        drybotFasterCount: drybotFaster,
      },
      matched: matched.sort((a, b) => a.bigbotTime - b.bigbotTime),
      appMissed,
      appExtra,
    };
  }
}
