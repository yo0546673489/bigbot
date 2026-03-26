import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Driver } from 'src/drivers/schemas/driver.schema';
import { Payment } from 'src/payment/schemas/payment.schema';
import { Invitation, InvitationStatus } from 'src/invitation/schemas/invitation.schema';
import { WhatsAppGroup } from 'src/whatsapp-groups/whatsapp-group.schema';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Driver.name) private driverModel: Model<Driver>,
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(Invitation.name) private invitationModel: Model<Invitation>,
    @InjectModel(WhatsAppGroup.name) private groupsModel: Model<WhatsAppGroup>,
  ) {}

  async getStats() {
    const [drivers, payments, invitedDrivers, groups] = await Promise.all([
      this.driverModel.countDocuments({}).exec(),
      this.paymentModel.countDocuments({}).exec(),
      this.invitationModel.countDocuments({ status: InvitationStatus.INVITED }).exec(),
      this.groupsModel.countDocuments({}).exec(),
    ]);
    return { drivers, payments, invitedDrivers, groups };
  }
} 