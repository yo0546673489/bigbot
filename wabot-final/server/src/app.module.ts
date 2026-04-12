import { Module, forwardRef } from '@nestjs/common';
import { RedisProviderModule } from './redis';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { WawebModule } from './waweb/waweb.module';
import { WhatsAppGroupsModule } from './whatsapp-groups/whatsapp-groups.module';
import { DriversModule } from './drivers/drivers.module';
import { WbaMgmtModule } from './wabmgmt/wab.module';
import { LocalizationModule } from './common/localization/localization.module';
import { StationsModule } from './stations/stations.module';
import { WhatsappFlowModule } from './whatsappflow/whatsappflow.module';
import { AuthModule } from './auth/auth.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PaymentModule } from './payment/payment.module';
import { InvitationsModule } from './invitation/invitation.module';
import { DispatcherModule } from './dispatcher/dispatcher.module';
import { ElasticsearchModule } from './shared/elasticsearch';
import { DashboardModule } from './dashboard/dashboard.module';
import { AreasModule } from './areas/areas.module';
import { DevicesModule } from './devices/devices.module';
import { BenchmarkModule } from './benchmark/benchmark.module';
 
 @Module({
   imports: [
     ElasticsearchModule,
     ServeStaticModule.forRoot({
       rootPath: join(__dirname, '..', 'public'),
       serveRoot: '/media',
     }),
     ConfigModule.forRoot(),
     MongooseModule.forRoot(process.env.MONGODB_URI),
     AuthModule,
     WawebModule,
     DriversModule,
     WbaMgmtModule,
     LocalizationModule,
     StationsModule,
     WhatsappFlowModule,
     PaymentModule,
     DispatcherModule,
     InvitationsModule,
     WhatsAppGroupsModule,
     RedisProviderModule,
     DashboardModule,
     AreasModule,
     DevicesModule,
     BenchmarkModule,
   ],
 })
 export class AppModule { } 