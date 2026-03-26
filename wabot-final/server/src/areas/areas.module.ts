import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';
import { AreaShortcut, AreaShortcutSchema, RelatedArea, RelatedAreaSchema, SupportArea, SupportAreaSchema } from './areas.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupportArea.name, schema: SupportAreaSchema },
      { name: AreaShortcut.name, schema: AreaShortcutSchema },
      { name: RelatedArea.name, schema: RelatedAreaSchema },
    ]),
  ],
  controllers: [AreasController],
  providers: [AreasService],
  exports: [AreasService],
})
export class AreasModule {} 