import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppMessagingService } from '../services/whatsapp-messaging.service';
import { LocalizationModule } from '../common/localization/localization.module';
import { WabotService } from '../services/wabot.service';

@Module({
  imports: [
    ConfigModule,
    LocalizationModule,
  ],
  providers: [WhatsAppMessagingService, WabotService],
  exports: [WhatsAppMessagingService, WabotService],
})
export class WhatsAppMessagingModule {} 