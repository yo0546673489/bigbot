import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AreasService } from './areas.service';
import { ApiTags } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreateAreaShortcutDto, CreateNonStreetKeywordDto, CreateRelatedAreaDto, CreateSupportAreaDto, UpdateAreaShortcutDto, UpdateRelatedAreaDto, UpdateSupportAreaDto } from './areas.dto';

@ApiTags('areas')
@Controller('areas')
@UseGuards(JwtAuthGuard)
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  // Support Areas
  @Get('support')
  listSupportAreas(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('sortBy') sortBy: string = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    return this.areasService.listSupportAreas({ page: parseInt(page), limit: parseInt(limit), search, sortBy, sortOrder });
  }

  @Post('support')
  createSupportArea(@Body() dto: CreateSupportAreaDto) {
    return this.areasService.createSupportArea(dto);
  }

  @Put('support/:id')
  updateSupportArea(@Param('id') id: string, @Body() dto: UpdateSupportAreaDto) {
    return this.areasService.updateSupportArea(id, dto);
  }

  @Delete('support/:id')
  deleteSupportArea(@Param('id') id: string) {
    return this.areasService.deleteSupportArea(id);
  }

  // Shortcuts
  @Get('shortcuts')
  listShortcuts(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('sortBy') sortBy: string = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    return this.areasService.listShortcuts({ page: parseInt(page), limit: parseInt(limit), search, sortBy, sortOrder });
  }

  @Post('shortcuts')
  createShortcut(@Body() dto: CreateAreaShortcutDto) {
    return this.areasService.createShortcut(dto);
  }

  @Put('shortcuts/:id')
  updateShortcut(@Param('id') id: string, @Body() dto: UpdateAreaShortcutDto) {
    return this.areasService.updateShortcut(id, dto);
  }

  @Delete('shortcuts/:id')
  deleteShortcut(@Param('id') id: string) {
    return this.areasService.deleteShortcut(id);
  }

  // Related
  @Get('related')
  listRelatedAreas(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('sortBy') sortBy: string = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    return this.areasService.listRelatedAreas({ page: parseInt(page), limit: parseInt(limit), search, sortBy, sortOrder });
  }

  @Post('related')
  upsertRelated(@Body() dto: CreateRelatedAreaDto) {
    return this.areasService.upsertRelatedArea(dto);
  }

  @Put('related/:id')
  updateRelated(@Param('id') id: string, @Body() dto: UpdateRelatedAreaDto) {
    return this.areasService.updateRelatedArea(id, dto);
  }

  @Delete('related/:id')
  deleteRelated(@Param('id') id: string) {
    return this.areasService.deleteRelatedArea(id);
  }

  // Non-Street Keywords
  @Get('non-street-keywords')
  listNonStreetKeywords(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
    @Query('search') search?: string,
    @Query('sortBy') sortBy: string = 'word',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'asc',
  ) {
    return this.areasService.listNonStreetKeywords({ page: parseInt(page), limit: parseInt(limit), search, sortBy, sortOrder });
  }

  @Post('non-street-keywords')
  createNonStreetKeyword(@Body() dto: CreateNonStreetKeywordDto) {
    return this.areasService.createNonStreetKeyword(dto);
  }

  @Delete('non-street-keywords/:id')
  deleteNonStreetKeyword(@Param('id') id: string) {
    return this.areasService.deleteNonStreetKeyword(id);
  }

  // Seed DB once from files
  @Post('seed')
  seed() {
    return this.areasService.seedFromFilesIfEmpty();
  }
} 