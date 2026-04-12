import { Body, Controller, Get, Inject, Logger, Post, Query } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { DriverWsServer } from './driver-ws.server';
import Redis from 'ioredis';

/**
 * Admin endpoints used by the bigbotdrivers.com admin dashboard. Currently
 * exposes:
 *
 *   GET  /api/admin/pending-areas?kind=shortcuts|fullNames
 *        Returns the candidate list parsed from the drivebot chat history,
 *        each item annotated with whether it already exists in our DB.
 *
 *   POST /api/admin/approve-areas
 *        Body: { shortcuts: string[], fullNames: string[] }
 *        Inserts the approved entries into the `areashortcuts` collection
 *        if they're not already there.
 */
@Controller('admin')
export class AdminAreasController {
  private readonly logger = new Logger('AdminAreasController');

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
  ) {}

  @Get('pending-areas')
  async getPending(@Query('kind') kind: string) {
    // The parsed JSON files are bundled with the server build under
    // /opt/bigbot/server/drivebot_parsed/ — generated locally and uploaded.
    // We read them on each request so the user can re-upload without
    // restarting the server.
    const fs = await import('fs');
    const path = await import('path');
    const file = kind === 'shortcuts' ? 'shortcuts.json' : 'fullNames.json';
    const candidates = [
      path.join(process.cwd(), 'drivebot_parsed', file),
      path.join('/opt/bigbot/server/drivebot_parsed', file),
    ];
    let raw: string | null = null;
    for (const p of candidates) {
      try { raw = fs.readFileSync(p, 'utf-8'); break; } catch {}
    }
    if (!raw) return [];

    let items: { name: string; count: number; known?: boolean }[];
    try { items = JSON.parse(raw); } catch { return []; }

    // Re-check the "known" flag against the live DB so we don't show stale
    // data — AND populate the fullName from the DB so the UI can show
    // "shortcut ← full name" for everything already saved.
    const existing = await this.connection.collection('areashortcuts').find(
      {}, { projection: { shortName: 1, fullName: 1, _id: 0 } }
    ).toArray();
    const knownByShort = new Map<string, string>();   // shortName → fullName
    const knownFullNames = new Set<string>();          // standalone full names
    existing.forEach((d: any) => {
      const sn = (d.shortName || '').toString();
      const fn = (d.fullName || '').toString();
      if (sn) knownByShort.set(sn, fn || sn);
      if (fn) knownFullNames.add(fn);
    });

    return items.map(i => {
      const existingFull = knownByShort.get(i.name);
      const known = typeof existingFull !== 'undefined' || knownFullNames.has(i.name);
      return {
        ...i,
        known,
        // Carry the DB's full name when available so the UI can render
        // "shortcut ← full name" correctly out of the box.
        fullName: existingFull ?? '',
      };
    });
  }

  @Post('approve-areas')
  async approve(@Body() body: {
    shortcuts?: Array<{ shortName: string; fullName: string } | string>;
    fullNames?: Array<{ shortName: string; fullName: string } | string>;
  }) {
    // Normalize both shapes — the admin UI sends objects with shortName +
    // fullName, but we still accept plain strings for backwards compat.
    const normalize = (arr: any[] = []): Array<{ shortName: string; fullName: string }> =>
      arr
        .map((x: any) => {
          if (typeof x === 'string') {
            const s = x.trim();
            return s ? { shortName: s, fullName: s } : null;
          }
          const shortName = (x?.shortName || '').toString().trim();
          const fullName = (x?.fullName || '').toString().trim() || shortName;
          return shortName ? { shortName, fullName } : null;
        })
        .filter((v: any): v is { shortName: string; fullName: string } => !!v);

    const shortcuts = normalize(body?.shortcuts);
    const fullNames = normalize(body?.fullNames);

    if (!shortcuts.length && !fullNames.length) {
      return { ok: false, error: 'nothing to add' };
    }

    const coll = this.connection.collection('areashortcuts');
    let added = 0;

    const upsert = async (shortName: string, fullName: string) => {
      const existing = await coll.findOne({ shortName });
      if (existing) return false;
      await coll.insertOne({
        shortName,
        fullName,
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0,
      });
      return true;
    };

    for (const { shortName, fullName } of shortcuts) {
      if (await upsert(shortName, fullName)) added++;
    }
    for (const { shortName, fullName } of fullNames) {
      if (await upsert(shortName, fullName)) added++;
    }

    this.logger.log(`Approved ${added} new areas (${shortcuts.length} shortcuts + ${fullNames.length} fullNames requested)`);

    // Bump server cache version + broadcast to all connected apps
    if (added > 0) {
      try {
        await this.redisClient.set('wa:areas:cache_v', Date.now().toString());

        const allShortcuts = await this.connection.collection('areashortcuts').find({}, {
          projection: { shortName: 1, fullName: 1, lat: 1, lng: 1, _id: 0 },
        }).toArray();
        const allSupport = await this.connection.collection('supportareas').find({}, {
          projection: { name: 1, _id: 0 },
        }).toArray();
        DriverWsServer.getInstance().broadcast('areas_updated', {
          shortcuts: allShortcuts.map((s: any) => ({ shortName: s.shortName || '', fullName: s.fullName || '', lat: s.lat ?? null, lng: s.lng ?? null })),
          supportAreas: allSupport.map((a: any) => a.name || ''),
          neighborhoods: [],
        });
      } catch {}
    }

    return { ok: true, added, total: shortcuts.length + fullNames.length };
  }
}
