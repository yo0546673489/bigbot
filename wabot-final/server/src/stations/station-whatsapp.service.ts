import { Injectable, Logger, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { StationService } from './station.service';
import { WhatsAppMessagingService } from '../services/whatsapp-messaging.service';
import { LocalizationService } from '../common/localization/localization.service';
import { LocalizedMessages } from 'src/common/localization/messages';
import { StageSteps, StagesType } from './schemas/station.schema';
import { GroupMetadata } from '@whiskeysockets/baileys';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis';
import { WhatsappServiceMgn } from 'src/waweb/whatsappMgn.service';
import { WabotService } from 'src/services/wabot.service';
import { Queue, Worker } from 'bullmq';

interface StationRegistrationState {
  step: 'name' | 'phone' | 'email' | 'arm' | 'arm_confirm';
  data: {
    name?: string;
    billingPhone?: string;
    email?: string;
    arms?: string[];
  };
}

interface StationStageState {
  step: StageSteps;
  type: StagesType
}

@Injectable()
export class StationWhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StationWhatsappService.name);
  private static readonly REG_TTL = 60 * 60 * 24 * 7; // 7 days
  private worker: Worker;

  constructor(
    private readonly stationService: StationService,
    private readonly whatsappMessagingService: WhatsAppMessagingService,
    private readonly localizationService: LocalizationService,
    private readonly whatsappServiceMgn: WhatsappServiceMgn,
    private readonly wabotService: WabotService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {
  }

  onModuleInit() {
    this.worker = new Worker('armConnectedQueue', async job => {
      const { armPhone, language } = job.data;
      try {
        await this.processArmConnected(armPhone, language);
      } catch (err) {
        this.logger.error(`❌ Arm connected job ${job.id} failed:`, err);
        throw err; // to allow retries
      }
    }, { connection: this.redisClient.duplicate() });

    this.worker.on('completed', job => {
      this.logger.log(`✅ Arm connected job ${job.id} completed for ${job.data.armPhone}`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`❌ Arm connected job ${job?.id} failed: ${err?.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker.close();
  }

  private regKey(phone: string) { return `station:reg:${phone}`; }
  private stageKey(phone: string) { return `station:stage:${phone}`; }

  private revive<T>(raw: string | null): T | undefined {
    if (!raw) return undefined;
    try { return JSON.parse(raw) as T; } catch { return undefined; }
  }

  private async getRegState(phone: string): Promise<StationRegistrationState | undefined> {
    const raw = await this.redisClient.get(this.regKey(phone));
    return this.revive<StationRegistrationState>(raw);
  }
  private async setRegState(phone: string, state: StationRegistrationState): Promise<void> {
    await this.redisClient.set(this.regKey(phone), JSON.stringify(state), 'EX', StationWhatsappService.REG_TTL);
  }
  private async delRegState(phone: string): Promise<void> {
    await this.redisClient.del(this.regKey(phone));
  }

  private async getStageState(phone: string): Promise<StationStageState | undefined> {
    const raw = await this.redisClient.get(this.stageKey(phone));
    return this.revive<StationStageState>(raw);
  }
  private async setStageState(phone: string, state: StationStageState): Promise<void> {
    await this.redisClient.set(this.stageKey(phone), JSON.stringify(state), 'EX', StationWhatsappService.REG_TTL);
  }
  private async delStageState(phone: string): Promise<void> {
    await this.redisClient.del(this.stageKey(phone));
  }

  async handleRegistration(phone: string, message: string, language: string): Promise<StationRegistrationState | StationStageState> {
    const text = message.toLowerCase();
    // Get current registration state
    const state = await this.getRegState(phone) || await this.getStageState(phone);
    /** bypass for testing, clean state */
    if (text.toLowerCase() === 'register station new') {
      await this.delRegState(phone);
      await this.delStageState(phone);
      return null;
    }

    // Check if this is the start of registration
    if (text.toLowerCase() === this.localizationService.getMessage('stationRegistration', language).toLowerCase()) {
      const station = await this.stationService.getStationByPhone(phone);
      if (station) {
        await this.sendStationByPhone(phone, language);
        return null;
      }
      await this.sendMessageStartRegistration(phone, language);
      return {} as StationRegistrationState;
    }

    if (!state) return null;

    // Handle each step
    switch (state.step) {
      case 'name':
        (state as StationRegistrationState).data.name = message;
        (state as StationRegistrationState).step = 'phone';
        const msg = this.localizationService.getMessage('stationRegistrationPhone', language);
        await this.sendMessage(phone, msg, language);
        await this.setRegState(phone, state as StationRegistrationState);
        return state as StationRegistrationState;

      case 'phone':
        (state as StationRegistrationState).data.billingPhone = message;
        (state as StationRegistrationState).step = 'email';
        await this.sendEmailMessage(phone, language);
        await this.setRegState(phone, state as StationRegistrationState);
        return state as StationRegistrationState;

      case 'email':
        (state as StationRegistrationState).data.email = message;
        if (!this.validateEmail(message)) {
          await this.sendEmailMessage(phone, language);
          await this.setRegState(phone, state as StationRegistrationState);
          return state as StationRegistrationState;
        }
        await this.completeRegistrationBasicInfo(phone, (state as StationRegistrationState).data, language);
        return state as StationRegistrationState;
      case 'arm': {
        (state as StationRegistrationState).data.arms = message.split('\n');
        (state as StationRegistrationState).step = 'arm_confirm';
        await this.setRegState(phone, state as StationRegistrationState);
        const buttons = [{
          id: 'stationRegistrationArmConfirmOk',
          title: this.localizationService.getMessage('stationRegistrationArmConfirmOk', language)
        }, {
          id: 'stationRegistrationArmConfirmEdit',
          title: this.localizationService.getMessage('stationRegistrationArmConfirmEdit', language)
        }];

        const armsList = (state as StationRegistrationState).data.arms.map((arm, index) => `${index + 1}. ${arm}`).join('\n');
        const msg = `${this.localizationService.getMessage('stationRegistrationArmConfirm', language)}
${armsList}
${this.localizationService.getMessage('stationRegistrationArmConfirmAsk', language)}`;
        await this.sendMessage(phone, msg, language, buttons);
        return state;
      }
      case StageSteps.STAGE2:
        if (this.validateNumber(text)) {
          this.createGroups({
            phone,
            stage: StageSteps.STAGE2,
            delay: parseInt(text),
            groups: [],
            isDraft: true,
          });
          await this.sendStationManageSpeedMessageStep2(phone, +text, language);
        }
        return state;
      case StageSteps.STAGE3:
        if (this.validateNumber(text)) {
          this.createGroups({
            phone,
            stage: StageSteps.STAGE3,
            delay: parseInt(text),
            groups: [],
            isDraft: true,
          });
          await this.sendStationManageSpeedMessageStep3(phone, +text, language);
        }
        return state;
    }
  }
  async sendStationRegistrationArmMessage(phone: string, language: string): Promise<void> {
    const msg = this.localizationService.getMessage('stationRegistrationArmAsk', language);
    const state = { step: 'arm', data: {} } as StationRegistrationState;
    await this.setRegState(phone, state as StationRegistrationState);
    await this.sendMessage(phone, msg, language);
  }

  private async sendMessageStartRegistration(phone: string, language: string): Promise<void> {
    const message = this.localizationService.getMessage('stationRegistrationNew', language) + '\n' +
      this.localizationService.getMessage('stationRegistrationStart', language);

    const buttons = [{
      id: 'registerStation',
      title: this.localizationService.getMessage('stationRegistrationButton', language)
    }];

    await this.sendMessage(phone, message, language, buttons);
  }

  private async sendEmailMessage(phone: string, language: string): Promise<void> {
    const msg = this.localizationService.getMessage('stationRegistrationEmail', language);
    await this.sendMessage(phone, msg, language);
  }

  async startRegistration(phone: string, language: string): Promise<void> {
    await this.setRegState(phone, { step: 'name', data: {} });
    const msg = this.localizationService.getMessage('stationRegistrationName', language);
    await this.sendMessage(phone, msg, language);
  }

  private async completeRegistrationBasicInfo(phone: string, data: any, language: string): Promise<void> {
    try {
      const station = await this.stationService.createStation(
        data.name,
        phone,
        data.billingPhone,
        data.email,
        data.stationCode = await this.stationService.generateStationCode(),
      );

      const msg = this.localizationService.getMessage('stationRegistrationComplete', language)
        .replace('{stationCode}', station.stationCode);

      const buttons = [{
        id: 'resendStationCode',
        title: this.localizationService.getMessage('stationCodeResend', language)
      }, {
        id: 'stationGroupManageButton',
        title: this.localizationService.getMessage('stationGroupManageButton', language)
      }, {
        id: 'stationRegistrationArmButton',
        title: this.localizationService.getMessage('stationRegistrationArmButton', language)
      }];
      await this.sendMessage(phone, msg, language, buttons);
    } catch (error) {
      this.logger.error('Error completing station registration:', error);
      const errMsg = this.localizationService.getMessage('stationRegistrationError', language);
      await this.sendMessage(phone, errMsg, language);
    }
  }

  async completeRegistrationArm(phone: string, language: string): Promise<void> {
    const station = await this.stationService.getStationByPhone(phone);
    if (!station) {
      return;
    }
    station.arms = (await this.getRegState(phone))?.data.arms;
    station.markModified('arms');
    await station.save();
    const armIndex = 1;
    const buttons = [{
      id: `stationRegistrationArmConnectWhatsapp_${armIndex}`,
      title: `${this.localizationService.getMessage('stationRegistrationArmConnectWhatsappButton', language)} ${armIndex}`
    }];
    await this.sendMessage(phone, this.localizationService.getMessage('stationRegistrationArmConnectWhatsapp', language), language, buttons);
  }

  async registrationArmEdit(phone: string, language: string): Promise<void> {
    const state = await this.getRegState(phone);
    if (!state) {
      return;
    }
    (state as StationRegistrationState).step = 'arm';
    await this.setRegState(phone, state as StationRegistrationState);
    await this.sendMessage(phone, this.localizationService.getMessage('stationRegistrationArmAsk', language), language);
  }

  async sendStationRegistrationArmConnectWhatsapp(phone: string, language: string, armIndex: number): Promise<void> {
    const station = await this.stationService.getStationByPhone(phone);
    if (!station) {
      return;
    }
    const arms = station.arms;
    const arm = arms[armIndex - 1];
    if (!arm) {
      return;
    }
    // Check if the arm number is already connected
    const phoneStatus = await this.whatsappServiceMgn.getConnectionStatus();
    if (phoneStatus && phoneStatus.find(p => p.phone === arm)?.isHealthy) {
      const msg = `${this.localizationService.getMessage('stationRegistrationArmConnected', language)
        .replace('{armIndex}', `${station.arms.indexOf(arm) + 1}`)
        .replace('{phoneNumber}', arm)}\n\n${this.localizationService.getMessage('stationRegistrationArmConnectNext', language)}`;

      const nextArmIndex = station.arms.indexOf(arm) + 2;
      // e.g. If have 3 arm validate if is the last arm
      if (nextArmIndex > station.arms.length) {
        await this.sendArmsConnectedMessage(station, language);
        return;
      }

      const buttons = [{
        id: `stationRegistrationArmConnectWhatsapp_${nextArmIndex}`,
        title: `${this.localizationService.getMessage('stationRegistrationArmConnectWhatsappButton', language)} ${nextArmIndex}`
      }];
      await this.sendMessage(station.phone, msg, language, buttons);
      return;
    }
    const pairingCode = await this.wabotService.getPairingCode(arm);
    await this.sendMessage(phone, pairingCode, language);
  }

  private async processArmConnected(armPhone: string, language: string): Promise<void> {
    // armphone start with 972, replace it with 0 and try to find the station
    if (armPhone.startsWith('972')) {
      armPhone = '0' + armPhone.slice(3);
    }
    const station = await this.stationService.getStationByArmPhone(armPhone);
    if (!station) {
      return;
    }
    const state = await this.getRegState(station.phone);
    if (!state) {
      return;
    }
    (state as StationRegistrationState).data.arms = station.arms;
    await this.setRegState(station.phone, state as StationRegistrationState);
    const msg = `${this.localizationService.getMessage('stationRegistrationArmConnected', language)
      .replace('{armIndex}', `${station.arms.indexOf(armPhone) + 1}`)
      .replace('{phoneNumber}', armPhone)}\n\n${this.localizationService.getMessage('stationRegistrationArmConnectNext', language)}`;

    const nextArmIndex = station.arms.indexOf(armPhone) + 2;
    // e.g. If have 3 arm validate if is the last arm
    if (nextArmIndex > station.arms.length) {
      await this.sendArmsConnectedMessage(station, language);
      return;
    }
    const buttons = [{
      id: `stationRegistrationArmConnectWhatsapp_${nextArmIndex}`,
      title: `${this.localizationService.getMessage('stationRegistrationArmConnectWhatsappButton', language)} ${nextArmIndex}`
    }];
    await this.sendMessage(station.phone, msg, language, buttons);
  }

  private async sendArmsConnectedMessage(station: any, language: string): Promise<void> {
    const msg = this.localizationService.getMessage('stationRegistrationArmsConnected', language)
      .replace('{armsList}', station.arms.map((arm, index) => `${index + 1}. ${arm}`).join('\n'));
    await this.sendMessage(station.phone, msg, language);
    await this.delRegState(station.phone);
  }

  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private validateNumber(number: string): boolean {
    const numberRegex = /^\d+$/;
    return numberRegex.test(number);
  }

  private async sendMessage(phone: string, message: string, language: string, buttons?: any[]): Promise<void> {
    if (buttons && buttons.length > 0) {
      await this.whatsappMessagingService.sendInteractiveMessage({
        phone,
        message,
        buttons,
        language,
      });
    } else {
      await this.whatsappMessagingService.sendTextMessage({
        phone,
        text: message,
      });
    }
  }

  async sendStationByPhone(phone: string, language: string): Promise<void> {
    const station = await this.stationService.getStationByPhone(phone);
    if (station) {
      const buttons = [{
        id: 'resendStationCode',
        title: this.localizationService.getMessage('stationCodeResend', language)
      }, {
        id: 'stationGroupManageButton',
        title: this.localizationService.getMessage('stationGroupManageButton', language)
      }, {
        id: 'stationRegistrationArmButton',
        title: this.localizationService.getMessage('stationRegistrationArmButton', language)
      }];
      const msg = this.localizationService.getMessage('stationCodeMessage', language)
        .replace('{stationCode}', station.stationCode);
      await this.sendMessage(phone, msg, language, buttons);
    }
  }

  async sendStationManageMessage(phone: string, language: string): Promise<void> {
    const msg = this.localizationService.getMessage('stationManageMessage', language);
    const buttons = [{
      id: 'stationManageNormalSpeed',
      title: this.localizationService.getMessage('stationManageSpeed', language).replace('{speedType}', this.localizationService.getMessage('stationNormalSpeed', language))
    },
    {
      id: 'stationManageFastSpeed',
      title: this.localizationService.getMessage('stationManageSpeed', language).replace('{speedType}', this.localizationService.getMessage('stationFastSpeed', language))
    }];
    await this.sendMessage(phone, msg, language, buttons);
  }

  private getSpeedTypeText(type: StagesType, language: string): string {
    const speedType = type === StagesType.NORMAL ? 'stationNormalSpeed' : 'stationFastSpeed';
    return this.localizationService.getMessage(speedType, language);
  }

  async sendStationManageSpeedMessage(phone: string, language: string, type: StagesType): Promise<void> {
    const msg = this.localizationService.getMessage('stationManageSpeedDescription', language).replace('{speedType}',
      this.getSpeedTypeText(type, language));
    const buttons = [{
      id: `stationManage_${type}_SpeedStartButton`,
      title: this.localizationService.getMessage('stationManageSpeedStartButton', language).replace('{speedType}', this.getSpeedTypeText(type, language))
    }];
    await this.sendMessage(phone, msg, language, buttons);
  }

  async getRegistrationStageState(phone: string): Promise<{ type: StagesType, step: StageSteps } | undefined> {
    return this.getStageState(phone);
  }

  async sendStationManageSpeedMessageStep1(phone: string, language: string, type: StagesType): Promise<void> {
    const msg = this.localizationService.getMessage('stationManageSpeedDescription1', language).replace('{speedType}',
      this.getSpeedTypeText(type, language));
    await this.setStageState(phone, { type, step: StageSteps.STAGE1 });
    const buttons = [{
      id: `stationManage_${type}_SpeedButtonGroups_${StageSteps.STAGE1}`,
      title: this.localizationService.getMessage('stationManageSpeedButtonGroups', language).replace('{speedType}',
        this.getSpeedTypeText(type, language))
    }];
    await this.sendMessage(phone, msg, language, buttons);
  }

  async sendStationManageSpeedMessageStep2Delay(phone: string, language: string): Promise<void> {
    const type = (await this.getRegistrationStageState(phone))?.type;
    if (!type) {
      return;
    }
    const msg = this.localizationService.getMessage('stationManageSpeedDescription2Delay', language).replace('{speedType}',
      this.getSpeedTypeText(type, language));
    await this.sendMessage(phone, msg, language);
  }

  async sendStationManageSpeedMessageStep3Delay(phone: string, language: string): Promise<void> {
    const type = (await this.getRegistrationStageState(phone))?.type;
    if (!type) {
      return;
    }
    const msg = this.localizationService.getMessage('stationManageSpeedDescription3Delay', language).replace('{speedType}',
      this.getSpeedTypeText(type, language));
    await this.sendMessage(phone, msg, language);
  }

  async sendStationManageSpeedMessageStep2(phone: string, delay: number, language: string): Promise<void> {
    const type = (await this.getRegistrationStageState(phone))?.type;
    if (!type) {
      return;
    }
    const msg = this.localizationService.getMessage('stationManageSpeedDescription2', language).replace('{value}', `${delay}`).replace('{speedType}', this.getSpeedTypeText(type, language));
    const buttons = [{
      id: `stationManage_${type}_SpeedButtonGroups_${StageSteps.STAGE2}`,
      title: this.localizationService.getMessage('stationManageSpeedButtonGroups', language).replace('{speedType}',
        this.getSpeedTypeText(type, language))
    }];
    await this.sendMessage(phone, msg, language, buttons);
  }

  async sendStationManageSpeedMessageStep3(phone: string, delay: number, language: string): Promise<void> {
    const type = (await this.getRegistrationStageState(phone))?.type;
    if (!type) {
      return;
    }
    const msg = this.localizationService.getMessage('stationManageSpeedDescription3', language).replace('{value}', `${delay}`).replace('{speedType}', this.getSpeedTypeText(type, language));
    const buttons = [{
      id: `stationManage_${type}_SpeedButtonGroups_${StageSteps.STAGE3}`,
      title: this.localizationService.getMessage('stationManageSpeedButtonGroups', language).replace('{speedType}',
        this.getSpeedTypeText(type, language))
    }];
    await this.sendMessage(phone, msg, language, buttons);
  }

  async sendStationManageNormalSpeedMessageConfirmation(phone: string, language: string): Promise<void> {
    const station = await this.stationService.getStationByPhone(phone);
    if (!station) {
      return;
    }
    const type = (await this.getRegistrationStageState(phone))?.type;
    if (!type) {
      return;
    }
    const stages = station.stages;
    const messageParts = Object.entries(stages[type].data).map(([stageKey, stageValue]) => {
      const key = `stationManage_${stageKey}` as keyof LocalizedMessages;
      const stageName = this.localizationService.getMessage(key, language);
      const title = `${stageName.replace('{value}', `${stageValue.delay}`)}`;
      const groupList = stageValue.elements.map(el => `${el.name}`).join(', ');
      return `${title}${groupList}`;
    });

    const msg = `${this.localizationService.getMessage('stationManageConfirmMessage', language)}\n\n${messageParts.join('\n\n')}\n\n${this.localizationService.getMessage('stationManageConfirmMessage2')}`;
    const buttons = [{
      id: `stationManageConfirmButton`,
      title: this.localizationService.getMessage('stationManageConfirmButton', language)
    }, {
      id: `stationManageReEditButton`,
      title: this.localizationService.getMessage('stationManageReEditButton', language)
    }];
    await this.sendMessage(phone, msg.replace('{speedType}', this.getSpeedTypeText(type, language)), language, buttons);
  }

  async sendStationManageNormalSpeedMessageSuccess(phone: string, language: string): Promise<void> {
    const stageState = await this.getRegistrationStageState(phone);
    const msg = this.localizationService.getMessage('stationManageSuccessMessage', language).replace('{speedType}', this.getSpeedTypeText(stageState?.type, language));
    const station = await this.stationService.getStationByPhone(phone);
    if (!station) {
      return;
    }
    const type = stageState?.type;
    if (!type) {
      return;
    }
    station.stages[type].isDraft = false;
    station.markModified('stages');
    await station.save();
    await this.sendMessage(phone, msg, language);
    await this.delStageState(phone);
  }

  async sendFlowMessageListGroups(phone: string, language: string, stage: StageSteps) {
    const status = await this.whatsappServiceMgn.getConnectionStatus();
    if (!status || !status.find(p => p.phone === phone)?.isHealthy) {
      return;
    }
    const groups = await this.wabotService.getGroups(phone);
    const formattedGroups = groups.map(group => ({
      id: group.jid,
      title: group.name,
    }));

    let body = ''
    if (stage === StageSteps.STAGE1) {
      body = this.localizationService.getMessage('stationManageSpeedSelectGroups1', language);
    } else if (stage === StageSteps.STAGE2) {
      body = this.localizationService.getMessage('stationManageSpeedSelectGroups2', language);
    } else if (stage === StageSteps.STAGE3) {
      body = this.localizationService.getMessage('stationManageSpeedSelectGroups3', language);
    }

    const type = (await this.getRegistrationStageState(phone))?.type;
    this.logger.debug('stationManageSpeedSelectGroups', stage, body.replace('{speedType}', this.getSpeedTypeText(type, language)));
    await this.whatsappMessagingService.sendFlowMessage({
      to: phone,
      flowName: 'driver_filters_groups',
      header: this.localizationService.getMessage('stationManageSpeedButtonGroups', language).replace('{speedType}', this.getSpeedTypeText(type, language)),
      body: body.replace('{speedType}', this.getSpeedTypeText(type, language)),
      cta: this.localizationService.getMessage('stationManageSpeedButtonGroups', language).replace('{speedType}', this.getSpeedTypeText(type, language)),
      flow_token: `driver_station_${stage}_filters_groups`,
      screenId: 'driver_filters_groups',
      dynamicData: {
        title: this.localizationService.getMessage('stationManageSpeedButtonGroups', language).replace('{speedType}', this.getSpeedTypeText(type, language)),
        groups_label: body.replace('{speedType}', this.getSpeedTypeText(type, language)),
        cta: this.localizationService.getMessage('confirmButton', language),
        groups_options: formattedGroups
      }
    });
  }

  async createGroups({
    phone,
    stage,
    delay,
    groups,
    isDraft = true,
  }: {
    phone: string;
    stage: StageSteps;
    delay?: number;
    groups: { id: string, name: string, description: string }[];
    isDraft?: boolean;
  }) {
    try {
      const station = await this.stationService.getStationByPhone(phone);
      if (!station) {
        return;
      }
      const state = await this.getRegistrationStageState(phone);
      if (!state) {
        return;
      }
      const type = state.type;
      station.stages[type] = station.stages?.[type] ? station.stages[type] : { isDraft: true, data: {} };
      if (!station.stages[type].data[stage]) {
        station.stages[type].data[stage] = {};
      }

      station.stages[type].isDraft = isDraft;
      if (this.validateNumber(`${delay}`)) {
        station.stages[type].data[stage].delay = delay;
      }
      if (groups?.length) {
        station.stages[type].data[stage].elements = groups;
      }
      const nextStep = stage === StageSteps.STAGE1 ? StageSteps.STAGE2 : StageSteps.STAGE3;
      await this.setStageState(phone, { step: nextStep, type });
      station.markModified('stages');
      await station.save();
    } catch (error) {
      this.logger.error('createGroups', error);
    }
  }

} 