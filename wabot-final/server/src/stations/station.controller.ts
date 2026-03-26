import { Controller, Get, Param } from '@nestjs/common';
import { StationService } from './station.service';
import { Station } from './schemas/station.schema';

@Controller('stations')
export class StationController {
  constructor(private readonly stationService: StationService) {}

  @Get(':code')
  async getStationByCode(@Param('code') code: string): Promise<Station | null> {
    return this.stationService.findByStationCode(code);
  }
} 