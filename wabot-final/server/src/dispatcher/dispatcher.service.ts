import { Injectable } from '@nestjs/common';
import { LocalizationService } from '../common/localization/localization.service';
import { DispatcherRegistrationStateService, DispatcherRegistrationStep } from './dispatcher-registration-state.service';
import { Dispatcher } from './schemas/dispatcher.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Group, StageSteps, StagesType, Station, StationDocument } from '../stations/schemas/station.schema';
import { Ride, RideDocument, RideStatus } from '../rides/rides.schema';
import { Driver, DriverDocument } from '../drivers/schemas/driver.schema';
import { WhatsAppMessagingService } from 'src/services/whatsapp-messaging.service';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappServiceMgn } from 'src/waweb/whatsappMgn.service';
import { WabotService } from 'src/services/wabot.service';

@Injectable()
export class DispatcherService {
  private readonly logger = new Logger(DispatcherService.name);

  constructor(
    @InjectModel(Station.name) private stationModel: Model<StationDocument>,
    @InjectModel(Ride.name) private rideModel: Model<RideDocument>,
    @InjectModel(Driver.name) private driverModel: Model<DriverDocument>,
    @InjectModel(Dispatcher.name) private dispatcherModel: Model<Dispatcher>,
    private readonly stateService: DispatcherRegistrationStateService,
    private readonly localizationService: LocalizationService,
    private readonly whatsappMessagingService: WhatsAppMessagingService,
    private readonly whatsappServiceMgn: WhatsappServiceMgn,
    private readonly configService: ConfigService,
    private readonly wabotService: WabotService,
  ) { }

  private async generateCode(): Promise<string> {
    let code: string;
    let isUnique = false;

    while (!isUnique) {
      // Generate a 7-digit code
      code = Math.floor(1000000 + Math.random() * 9000000).toString();
      const existingRide = await this.rideModel.findOne({ code });
      if (!existingRide) {
        isUnique = true;
      }
    }

    return code;
  }

  async handleMessage(phone: string, message: string, language: string = 'he'): Promise<Dispatcher | Ride | null> {
    let state = await this.stateService.getState(phone);
    if (this.isRegistrationTrigger(message)) {
      if (!state) {
        state = await this.stateService.startRegistration(phone);
      } else {
        state = await this.stateService.updateState(phone, DispatcherRegistrationStep.FULL_NAME);
      }
      await this.whatsappMessagingService.sendTextMessage({
        phone,
        text: this.localizationService.getMessage('dispatcherRegistrationAskName', language)
      });
      return state;
    }

    const ride = await this.rideModel.findOne({ phone, status: RideStatus.PENDING }).exec();
    if (ride) {
      ride.message = message;
      ride.status = RideStatus.READY;
      await ride.save();
      await this.whatsappMessagingService.sendInteractiveWithListButtons({
        phone,
        language,
        message: this.localizationService.getMessage('dispatcherProcessingRideAskMethods', language),
        optionsTitle: this.localizationService.getMessage('selectRideMethod', language),
        sections: [{
          title: this.localizationService.getMessage('selectRideMethod', language),
          rows: [
            {
              id: 'dispatcherProcessingRideNormalMethodButton',
              title: this.localizationService.getMessage('dispatcherProcessingRideNormalMethodButton', language),
            },
            {
              id: 'dispatcherProcessingRideFastMethodButton',
              title: this.localizationService.getMessage('dispatcherProcessingRideFastMethodButton', language),
            },
            {
              id: 'dispatcherProcessingRideAllGroupsMethodButton',
              title: this.localizationService.getMessage('dispatcherProcessingRideAllGroupsMethodButton', language),
            },
            {
              id: 'dispatcherProcessingRideAdditionalMethodButton',
              title: this.localizationService.getMessage('dispatcherProcessingRideAdditionalMethodButton', language),
            },
          ],
        }],
      });

      return ride;
    }

    if (!state) {
      return null;
    }

    if (this.isRidesProcessCommand(message, language) && state.currentStep === DispatcherRegistrationStep.COMPLETED) {
      const rideNumber = await this.generateCode();
      const msg = this.localizationService.getMessage('dispatcherProcessingRideAsk', language).replace('{rideNumber}', rideNumber);
      await this.rideModel.create({ phone, code: rideNumber, status: RideStatus.PENDING });
      await this.whatsappMessagingService.sendTextMessage({
        phone,
        text: msg
      });
      return state;
    }

    switch (state.currentStep) {
      case DispatcherRegistrationStep.FULL_NAME: {
        if (!this.isValidFullName(message)) {
          await this.whatsappMessagingService.sendTextMessage({
            phone,
            text: this.localizationService.getMessage('dispatcherRegistrationInvalidName', language)
          });
          return state;
        }

        await this.whatsappMessagingService.sendTextMessage({
          phone,
          text: this.localizationService.getMessage('dispatcherRegistrationAskStationCode', language)
        });
        return await this.stateService.updateState(phone, DispatcherRegistrationStep.STATION_CODE, { name: message });
      }

      case DispatcherRegistrationStep.STATION_CODE: {
        if (!this.isValidStationCode(message)) {
          await this.whatsappMessagingService.sendTextMessage({
            phone,
            text: this.localizationService.getMessage('dispatcherRegistrationInvalidStationCode', language)
          });
          return state;
        }

        const stationInfo = await this.getStationInfoByCode(message);
        if (!stationInfo) {
          await this.whatsappMessagingService.sendTextMessage({
            phone,
            text: this.localizationService.getMessage('dispatcherRegistrationStationNotFound', language)
          });
          return state;
        }
        const msg = this.localizationService.getMessage('dispatcherRegistrationStationConfirm', language)
          .replace('{name}', stationInfo.name)
          .replace('{owner}', stationInfo.phone);
        await this.whatsappMessagingService.sendInteractiveMessage({
          phone,
          language,
          message: msg,
          buttons: [
            {
              id: 'dispatcherRegistrationConfirmButton',
              title: this.localizationService.getMessage('dispatcherRegistrationConfirmButton', language),
            },
          ],
        });
        const newState = await this.stateService.updateState(phone, DispatcherRegistrationStep.STATION_CODE, { stationCode: message, stationInfo });
        return newState;
      }

      default: {
        return null
      }
    }
  }

  private isRegistrationTrigger(message: string): boolean {
    return [
      'רישום סדרן',
      'dispatcher registration',
    ].includes(message.toLowerCase().trim());
  }

  private isRidesProcessCommand(message: string, language: string): boolean {
    const command = this.localizationService.getMessage('dispatcherProcessingCommand', language);
    return command.toLowerCase() === message.toLowerCase().trim();
  }

  private isValidFullName(message: string): boolean {
    // Simple validation: at least two words
    return message.trim().split(' ').length >= 2;
  }

  private isValidStationCode(message: string): boolean {
    // Example: must be 6 digits
    return /^\d{6}$/.test(message.trim());
  }

  async getStationInfoByCode(code: string): Promise<StationDocument | null> {
    return await this.stationModel.findOne({ stationCode: code }).exec();
  }

  async handleDispatcherRegistrationConfirmButton(phone: string, language: string) {
    const state = await this.stateService.getState(phone);
    if (!state) {
      return;
    }
    await this.stateService.updateState(phone, DispatcherRegistrationStep.CONFIRM_STATION);
    await this.notifyStationOwner({
      dispatcherInfo: state,
      ownerPhone: state.stationInfo.phone,
      language,
    });
  }

  private async notifyStationOwner({ dispatcherInfo, ownerPhone, language }: { dispatcherInfo: Dispatcher, ownerPhone: string, language: string }) {
    const msg = this.localizationService.getMessage('dispatcherRegistrationStationMessageToOwner', language)
      .replace('{dispatcherName}', dispatcherInfo.name)
      .replace('{dispatcherPhone}', dispatcherInfo.phone)
      .replace('{stationName}', dispatcherInfo.stationInfo.name);
    await this.whatsappMessagingService.sendInteractiveMessage({
      phone: ownerPhone,
      language,
      message: msg,
      buttons: [
        {
          id: `dispatcherRegistrationStationOwnerAcceptButton_${dispatcherInfo.phone}`,
          title: this.localizationService.getMessage('dispatcherRegistrationStationOwnerAcceptButton', language),
        },
        {
          id: `dispatcherRegistrationStationOwnerRejectButton_${dispatcherInfo.phone}`,
          title: this.localizationService.getMessage('dispatcherRegistrationStationOwnerRejectButton', language),
        },
      ],
    });
  }

  async handleDispatcherRegistrationStationOwnerAcceptButton(dispatcherPhone: string, language: string) {
    const state = await this.stateService.getState(dispatcherPhone);
    if (!state) {
      return;
    }
    const msg = this.localizationService.getMessage('dispatcherRegistrationStationOwnerAcceptMessage', language)
      .replace('{stationName}', state.stationInfo.name);
    await this.stateService.updateState(dispatcherPhone, DispatcherRegistrationStep.COMPLETED);
    await this.whatsappMessagingService.sendTextMessage({
      phone: dispatcherPhone,
      text: msg
    });
  }

  async handleDispatcherRegistrationStationOwnerRejectButton(dispatcherPhone: string, language: string) {
    const state = await this.stateService.getState(dispatcherPhone);
    if (!state) {
      return;
    }
    const msg = this.localizationService.getMessage('dispatcherRegistrationStationOwnerRejectMessage', language)
      .replace('{stationName}', state.stationInfo.name);
    await this.stateService.updateState(dispatcherPhone, DispatcherRegistrationStep.REJECTED);
    await this.whatsappMessagingService.sendTextMessage({
      phone: dispatcherPhone,
      text: msg
    });
  }

  transformInput(input: string, rideCode: string, language: string) {
    const [locationLine, phoneLine] = input.trim().split('\n');
    if (!locationLine || !phoneLine) {
      return;
    }
    const message = `טן ${rideCode}`;
    return `${locationLine}

${this.localizationService.getMessage('newRideDriverAskConfirmLink', language)}
wa.me/${this.configService.get('BOT_NUMBER')}?text=${encodeURIComponent(message)}`;
  }

  async handleDispatcherProcessingRideMethodButton(phone: string, language: string, stageType: StagesType) {
    const state = await this.stateService.getState(phone);
    if (!state) {
      return;
    }

    const stages = state.stationInfo.stages[stageType];
    if (!state
      || state.currentStep !== DispatcherRegistrationStep.COMPLETED
      || !stages
      || !stages?.data
      || stages?.isDraft) {
      return;
    }

    const ride = await this.rideModel.findOne({ phone, status: RideStatus.READY }).exec();
    if (!ride) {
      return;
    }

    const message = this.transformInput(ride.message, ride.code, language);
    if (!message) {
      return;
    }

    const status = await this.whatsappServiceMgn.getConnectionStatus();
    if (!status || status.length === 0) {
      return;
    }

    const arms = (state.stationInfo.arms || []).filter(p => !!p && typeof p === 'string' && p.trim().length > 0).map(p => p.trim());
    if (!arms || arms.length === 0) {
      return;
    }
    const healthyArms = arms.filter(a => status.find(s => s.phone === a)?.isHealthy);
    if (!healthyArms || healthyArms.length === 0) {
      return;
    }

    // Flatten groups across all stages with their corresponding delay
    const groupEntries: { groupId: string; delay: number }[] = [];
    for (const key of Object.keys(stages.data)) {
      const data = stages.data[key] as Group;
      if (!data) {
        continue;
      }
      for (const element of data.elements) {
        groupEntries.push({ groupId: `${element.id}` , delay: data.delay });
      }
    }

    if (groupEntries.length === 0) {
      return;
    }

    // Distribute groups evenly among arms using round-robin
    const assignments: Record<string, { groupId: string; delay: number }[]> = {};
    for (const arm of healthyArms) {
      assignments[arm] = [];
    }

    let armIndex = 0;
    for (const entry of groupEntries) {
      const arm = healthyArms[armIndex % healthyArms.length];
      assignments[arm].push(entry);
      armIndex++;
    }

    // Schedule sends per assignment while preserving stage delays
    for (const arm of healthyArms) {
      for (const task of assignments[arm]) {
        setTimeout(async () => {
          await this.wabotService.sendMessageToGroup(arm, task.groupId, message);
        }, task.delay * 1000);
      }
    }

  }

  async sendRideMessage(phone: string, rideCode: string, language: string): Promise<boolean> {
    const ride = await this.rideModel.findOne({ code: rideCode, status: RideStatus.READY }).exec();
    if (!ride || phone === ride?.phone) {
      return false;
    }
    // Send to driver phone who sent the text(myself)
    await this.whatsappMessagingService.sendTextMessage({
      phone,
      text: this.localizationService.getMessage('rideReceivedAndWaitingDispatcherMessage', language)
    });

    // Send to dispatcher phone who create a ride
    const driver = await this.driverModel.findOne({ phone }).exec();
    if (!driver) {
      return false;
    }

    const message = `${this.localizationService.getMessage('newDriverRequestRide', language)}

${this.localizationService.getMessage('newRideDriverName', language)} ${driver.name}
${this.localizationService.getMessage('newRideDriverPhone', language)} ${driver.phone}
${this.localizationService.getMessage('newRideDriverVehicle', language)} ${driver.vehicle}

${this.localizationService.getMessage('newRideDriverAskConfirm', language)}`;
    await this.whatsappMessagingService.sendInteractiveMessage({
      phone: ride.phone,
      language,
      message,
      buttons: [
        {
          id: `takeRideButton_${ride.code}_${phone}`,
          title: this.localizationService.getMessage('takeRideButton', language),
        },
      ],
    });
    return true;
  }

  // dispatcher confirm send to driver phone who sent the text
  async takeRide(phone: string, language: string, rideCode: string, driverPhone: string) {
    const message = `${this.localizationService.getMessage('rideApprovalMessage', language)}

${this.localizationService.getMessage('customerNumber', language)} ${driverPhone}
${this.localizationService.getMessage('customerMessageAsk', language)}
${this.localizationService.getMessage('dispatcherContact', language)} ${phone}`;
    await this.whatsappMessagingService.sendTextMessage({
      phone: driverPhone,
      text: message,
    });

    await this.rideModel.findOneAndUpdate({ code: rideCode }, { status: RideStatus.TAKEN, driverPhone }).exec();
  }

  async completeRide(phone: string, language: string) {
    const ride = await this.rideModel.findOne({ driverPhone: phone, status: RideStatus.TAKEN }).exec();
    if (!ride) {
      return;
    }
    const dispatcher = await this.dispatcherModel.findOne({ phone: ride.phone }).exec();
    if (!dispatcher) {
      return;
    }

    await this.rideModel.findOneAndUpdate({ code: ride.code }, { status: RideStatus.COMPLETED }).exec();
    const amount = '15 ₪ (10% מתוך 150 ₪)';
    const message = `${this.localizationService.getMessage('completeRide', language)}

${this.localizationService.getMessage('paymentSummary', language)}
${this.localizationService.getMessage('paymentStationName', language).replace('{stationName}', dispatcher.stationInfo?.name)}
${this.localizationService.getMessage('paymentAmount', language)} ${amount}
${this.localizationService.getMessage('paymentCompletedContact', language)}`;

    await this.whatsappMessagingService.sendTextMessage({
      phone: phone,
      text: message
    });
  }
}
