import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

/**
 * Public (no JWT) endpoint that returns all areas data for the Android app.
 * GET /api/areas/all → { shortcuts, supportAreas, neighborhoods }
 */
@Controller('areas')
export class AreasPublicController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get('all')
  async getAll() {
    const [shortcuts, supportAreas, nonStreetKeywords] = await Promise.all([
      this.connection.collection('areashortcuts').find({}, {
        projection: { shortName: 1, fullName: 1, lat: 1, lng: 1, _id: 0 },
      }).toArray(),
      this.connection.collection('supportareas').find({}, {
        projection: { name: 1, _id: 0 },
      }).toArray(),
      this.connection.collection('nonstreetkeywords').find({}, {
        projection: { word: 1, _id: 0 },
      }).toArray(),
    ]);

    return {
      shortcuts: shortcuts.map((s: any) => ({
        shortName: s.shortName || '',
        fullName: s.fullName || '',
        lat: s.lat ?? null,
        lng: s.lng ?? null,
      })),
      supportAreas: supportAreas.map((a: any) => a.name || ''),
      neighborhoods: [],
      nonStreetKeywords: nonStreetKeywords.map((k: any) => k.word || ''),
    };
  }
}
