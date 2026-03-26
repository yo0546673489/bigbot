import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DriversService } from './drivers.service';
import { DriversController } from './drivers.controller';
import { RegistrationStateService } from './registration-state.service';
import { Driver, DriverSchema } from './schemas/driver.schema';
import { WawebModule } from '../waweb/waweb.module';
import { ElasticsearchModule } from '../shared/elasticsearch';
import { WhatsAppMessagingModule } from 'src/services/whatsapp-messaging.module';
import { RedisProviderModule } from 'src/redis';
import { LocalizationModule } from 'src/common/localization/localization.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Driver.name, schema: DriverSchema },
    ]),
    WawebModule,
    ElasticsearchModule,
    WhatsAppMessagingModule,
    LocalizationModule,
  ],
  controllers: [DriversController],
  providers: [DriversService, RegistrationStateService],
  exports: [DriversService, RegistrationStateService],
})
export class DriversModule {} 