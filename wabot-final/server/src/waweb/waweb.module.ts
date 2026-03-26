import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { Driver, DriverSchema } from '../drivers/schemas/driver.schema';
import { LocalizationModule } from 'src/common/localization/localization.module';
import { SharedModule } from '../common/shared/shared.module';
import { DriverMessagePrivate, DriverMessagePrivateSchema } from 'src/drivers/schemas/driver-message-private.schema';
import { WawebController } from './waweb.controller';
import { ElasticsearchModule } from 'src/shared/elasticsearch';
import { WhatsAppGroupsModule } from 'src/whatsapp-groups/whatsapp-groups.module';
import { AreasModule } from 'src/areas/areas.module';
import { WhatsappServiceMgn } from './whatsappMgn.service';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Driver.name, schema: DriverSchema },
      { name: DriverMessagePrivate.name, schema: DriverMessagePrivateSchema }
    ]),
    SharedModule,
    LocalizationModule,
    ElasticsearchModule,
    WhatsAppGroupsModule,
    AreasModule,
  ],
  controllers: [WawebController],
  providers: [WhatsappServiceMgn],
  exports: [WhatsappServiceMgn],
})
export class WawebModule { } 