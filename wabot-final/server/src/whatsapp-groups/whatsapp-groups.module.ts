import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsAppGroup, WhatsAppGroupSchema } from './whatsapp-group.schema';
import { WhatsAppGroupsService } from './whatsapp-groups.service';
import { WhatsAppGroupsController } from './whatsapp-groups.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: WhatsAppGroup.name, schema: WhatsAppGroupSchema }])],
  providers: [WhatsAppGroupsService],
  controllers: [WhatsAppGroupsController],
  exports: [WhatsAppGroupsService],
})
export class WhatsAppGroupsModule {}
