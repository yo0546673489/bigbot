import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ElasticsearchModule } from '../shared/elasticsearch';
import { WbaMgmtController } from './wab.controller';
import { WbaMgmtService } from './wab.service';
import { DriversModule } from '../drivers/drivers.module';
import { StationsModule } from '../stations/stations.module';
import { WhatsappFlowModule } from '../whatsappflow/whatsappflow.module';
import { SharedModule } from '../common/shared/shared.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Payment, PaymentSchema } from 'src/payment/schemas/payment.schema';
import { WawebModule } from '../waweb/waweb.module';
import { Driver, DriverSchema } from 'src/drivers/schemas/driver.schema';
import { DispatcherModule } from 'src/dispatcher/dispatcher.module';
import { DriverMessagePrivate, DriverMessagePrivateSchema } from 'src/drivers/schemas/driver-message-private.schema';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    ElasticsearchModule,
    SharedModule,
    DriversModule,
    DispatcherModule,
    WawebModule,
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Driver.name, schema: DriverSchema },
      { name: DriverMessagePrivate.name, schema: DriverMessagePrivateSchema },
    ]),
    StationsModule,
    WhatsappFlowModule
  ],
  controllers: [WbaMgmtController],
  providers: [WbaMgmtService],
  exports: [WbaMgmtService],
})
export class WbaMgmtModule {} 