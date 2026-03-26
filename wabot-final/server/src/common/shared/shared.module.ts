import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DriverMessagePrivate, DriverMessagePrivateSchema } from '../../drivers/schemas/driver-message-private.schema';
import { DriverSearchKeyword, DriverSearchKeywordSchema } from '../../drivers/schemas/driver-search-keyword.schema';
import { DriverMessageTracker, DriverMessageTrackerSchema } from '../../drivers/schemas/driver-message-tracker.schema';
import { Driver, DriverSchema } from '../../drivers/schemas/driver.schema';
import { DriverMessagePrivateService } from '../../drivers/driver-message-private.service';
import { DriverSearchKeywordService } from '../../drivers/driver-search-keyword.service';
import { DriverMessageTrackerService } from '../../drivers/driver-message-tracker.service';
import { WhatsAppMessagingService } from 'src/services/whatsapp-messaging.service';
import { LocalizationModule } from '../localization/localization.module';
import { ConfigModule } from '@nestjs/config';
import { LocalizationService } from '../localization/localization.service';
import { WabotService } from 'src/services/wabot.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DriverMessagePrivate.name, schema: DriverMessagePrivateSchema },
      { name: DriverSearchKeyword.name, schema: DriverSearchKeywordSchema },
      { name: DriverMessageTracker.name, schema: DriverMessageTrackerSchema },
      { name: Driver.name, schema: DriverSchema },
    ]),
    ConfigModule,
    LocalizationModule,
  ],
  providers: [
    DriverMessagePrivateService,
    DriverSearchKeywordService,
    DriverMessageTrackerService,
    WhatsAppMessagingService,
    LocalizationService,
    WabotService
  ],
  exports: [
    DriverMessagePrivateService,
    DriverSearchKeywordService,
    DriverMessageTrackerService,
    WhatsAppMessagingService,
    LocalizationService,
    WabotService
  ],
})
export class SharedModule {} 