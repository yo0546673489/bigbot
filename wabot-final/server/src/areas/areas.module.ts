import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AreasController } from './areas.controller';
import { AreasPublicController } from './areas-public.controller';
import { AreasService } from './areas.service';
import { AreaShortcut, AreaShortcutSchema, NonStreetKeyword, NonStreetKeywordSchema, RelatedArea, RelatedAreaSchema, SupportArea, SupportAreaSchema } from './areas.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupportArea.name, schema: SupportAreaSchema },
      { name: AreaShortcut.name, schema: AreaShortcutSchema },
      { name: RelatedArea.name, schema: RelatedAreaSchema },
      { name: NonStreetKeyword.name, schema: NonStreetKeywordSchema },
    ]),
  ],
  controllers: [AreasController, AreasPublicController],
  providers: [AreasService],
  exports: [AreasService],
})
export class AreasModule {} 