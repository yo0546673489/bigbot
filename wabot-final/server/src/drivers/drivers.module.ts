import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DriversService } from './drivers.service';
import { DriversController } from './drivers.controller';
import { AdminAreasController } from './admin-areas.controller';
import { AppDriverController } from './app-driver.controller';
import { EtaService } from './eta.service';
import { RegistrationStateService } from './registration-state.service';
import { Driver, DriverSchema } from './schemas/driver.schema';
import { DriverSearchKeyword, DriverSearchKeywordSchema } from './schemas/driver-search-keyword.schema';
import { DriverSearchKeywordService } from './driver-search-keyword.service';
import { WawebModule } from '../waweb/waweb.module';
import { ElasticsearchModule } from '../shared/elasticsearch';
import { WhatsAppMessagingModule } from 'src/services/whatsapp-messaging.module';
import { RedisProviderModule } from 'src/redis';
import { LocalizationModule } from 'src/common/localization/localization.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Driver.name, schema: DriverSchema },
      { name: DriverSearchKeyword.name, schema: DriverSearchKeywordSchema },
    ]),
    WawebModule,
    ElasticsearchModule,
    WhatsAppMessagingModule,
    LocalizationModule,
  ],
  controllers: [DriversController, AppDriverController, AdminAreasController],
  providers: [DriversService, RegistrationStateService, EtaService, DriverSearchKeywordService],
  exports: [DriversService, RegistrationStateService, EtaService, DriverSearchKeywordService],
})
export class DriversModule {}