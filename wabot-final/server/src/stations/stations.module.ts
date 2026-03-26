import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Station, StationSchema } from './schemas/station.schema';
import { StationService } from './station.service';
import { StationController } from './station.controller';
import { StationWhatsappService } from './station-whatsapp.service';
import { WawebModule } from '../waweb/waweb.module';
import { WhatsAppMessagingModule } from '../services/whatsapp-messaging.module';
import { LocalizationModule } from '../common/localization/localization.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Station.name, schema: StationSchema }
    ]),
    WawebModule,
    WhatsAppMessagingModule,
    LocalizationModule,
  ],
  providers: [StationService, StationWhatsappService],
  controllers: [StationController],
  exports: [StationService, StationWhatsappService],
})
export class StationsModule {} 