import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DispatcherService } from './dispatcher.service';
import { DispatcherController } from './dispatcher.controller';
import { DispatcherRegistrationStateService } from './dispatcher-registration-state.service';
import { LocalizationModule } from '../common/localization/localization.module';
import { Station, StationSchema } from '../stations/schemas/station.schema';
import { Ride, RideSchema } from '../rides/rides.schema';
import { WhatsAppMessagingModule } from '../services/whatsapp-messaging.module';
import { WawebModule } from 'src/waweb/waweb.module';
import { ConfigModule } from '@nestjs/config';
import { Driver, DriverSchema } from 'src/drivers/schemas/driver.schema';
import { Dispatcher, DispatcherSchema } from './schemas/dispatcher.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Dispatcher.name, schema: DispatcherSchema },
      { name: Station.name, schema: StationSchema },
      { name: Ride.name, schema: RideSchema },
      { name: Driver.name, schema: DriverSchema },
    ]),
    LocalizationModule,
    WhatsAppMessagingModule,
    WawebModule,
  ],
  providers: [DispatcherService, DispatcherRegistrationStateService],
  controllers: [DispatcherController],
  exports: [DispatcherService]
})
export class DispatcherModule {}
