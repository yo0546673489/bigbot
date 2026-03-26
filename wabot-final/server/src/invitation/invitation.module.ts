import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { Invitation, InvitationSchema } from './schemas/invitation.schema';
import { WbaMgmtModule } from '../wabmgmt/wab.module';
import { Driver, DriverSchema } from 'src/drivers/schemas/driver.schema';
import { WhatsAppMessagingModule } from 'src/services/whatsapp-messaging.module';
import { LocalizationModule } from 'src/common/localization/localization.module';
import { WawebModule } from 'src/waweb/waweb.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invitation.name, schema: InvitationSchema },
      { name: Driver.name, schema: DriverSchema },
    ]),
    ConfigModule,
    WbaMgmtModule,
    WhatsAppMessagingModule,
    WawebModule,
    LocalizationModule
  ],
  controllers: [InvitationController],
  providers: [InvitationService,],
  exports: [InvitationService],
})
export class InvitationsModule {} 