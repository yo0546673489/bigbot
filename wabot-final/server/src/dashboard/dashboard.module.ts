import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Driver, DriverSchema } from 'src/drivers/schemas/driver.schema';
import { Payment, PaymentSchema } from 'src/payment/schemas/payment.schema';
import { Invitation, InvitationSchema } from 'src/invitation/schemas/invitation.schema';
import { WhatsAppGroup, WhatsAppGroupSchema } from 'src/whatsapp-groups/whatsapp-group.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Driver.name, schema: DriverSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Invitation.name, schema: InvitationSchema },
      { name: WhatsAppGroup.name, schema: WhatsAppGroupSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {} 