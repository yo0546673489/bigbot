import { Controller, Get, Post, Body, Query, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WbaMgmtService } from './wab.service';
import { CATEGORY_BUTTONS_IDS, CLOTHING_BUTTONS_IDS, getMenuCommands } from '../common/constants';
import { LocalizedMessages } from '../common/localization/messages';
import { getLanguageByPhoneNumber } from '../common/utils';
import { DriversService } from '../drivers/drivers.service';
import { StationWhatsappService } from '../stations/station-whatsapp.service';
import { WhatsappFlowService } from 'src/whatsappflow/whatsappflow.service';
import { WhatsAppMessagingService } from 'src/services/whatsapp-messaging.service';
import { LocalizationService } from 'src/common/localization/localization.service';
import * as DRIVER_FILTERS_WORDS_EN from '../../wa-flows/driver_filters_words_en.json';
import * as DRIVER_FILTERS_WORDS_HE from '../../wa-flows/driver_filters_words_he.json';
import { PaymentMethod } from 'src/payment/schemas/payment.schema';
import * as DRIVER_FILTERS_GROUPS from '../../wa-flows/driver_filters_groups.json';
import { StageSteps, StagesType } from 'src/stations/schemas/station.schema';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { ElasticsearchService } from 'src/shared/elasticsearch/elasticsearch.service';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis';
import { WhatsappServiceMgn } from 'src/waweb/whatsappMgn.service';
import { WabotService } from 'src/services/wabot.service';

interface SendMessageDto {
  to: string;
  language?: string;
}

interface SendInteractiveDto extends SendMessageDto {
  messageKey: string;
  buttons?: { id: string; title: string }[];
}

@Controller('travelbot')
export class WbaMgmtController {
  private readonly logger = new Logger(WbaMgmtController.name);

  constructor(
    private readonly wbaMgmtService: WbaMgmtService,
    private readonly whatsappServiceMgn: WhatsappServiceMgn,
    private readonly configService: ConfigService,
    private readonly driversService: DriversService,
    private readonly stationWhatsappService: StationWhatsappService,
    private readonly whatsappFlowService: WhatsappFlowService,
    private readonly whatsAppMessagingService: WhatsAppMessagingService,
    private readonly localizationService: LocalizationService,
    private readonly dispatcherService: DispatcherService,
    private readonly elasticsearchService: ElasticsearchService,
    private readonly wabotService: WabotService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {
    
  }

  private async handlerButtonReply(phone: string, language: string, button: any) {
    const { id, title } = button || {};
    console.log("🔢 Webhook button:", id, title);
    this.elasticsearchService.logMessage(phone, title, WbaMgmtController.name);
    if (id === 'register') {
      const driver = await this.driversService.findByPhone(phone);
      if (driver) {
        await this.wbaMgmtService.sendAlreadyRegisteredMessage(phone, language);
        return;
      }
      await this.wbaMgmtService.sendWelcomeMessage(phone, language);
      await this.wbaMgmtService.startRegistration(phone, language);
    }
    if (id === 'cancelAndReturn') {
      await this.wbaMgmtService.cancelRegistration(phone, language);
    }
    if (id === 'driverContinueRegistrationButtonRegular') {
      await this.wbaMgmtService.sendDriverContinueMessage(phone, language, false);
    }
    if (id === 'driverContinueRegistrationButtonPremium') {
      await this.wbaMgmtService.sendDriverContinueMessage(phone, language, true);
    }
    if (id === 'goWatchVideoHowBotWorks') {
      await this.wbaMgmtService.sendHowBotWorksMessage(phone, language);
    }
    if (id === 'driverConnectWhatsappButton') {
      const status = await this.whatsappServiceMgn.getConnectionStatus();
      if (status && status.find(p => p.phone === phone)?.isHealthy) {
        this.wbaMgmtService.sendWhatsappConnectedMessage(phone, language);
      } else {
        this.wbaMgmtService.sendWhatsappNotConnectedMessage(phone, language);
      }
    }
    if (id === 'driverConnectWhatsappMessageNow') {
      await this.wbaMgmtService.sendWhatsappConnectInstruction(phone, language);
      const pairingCode = await this.wabotService.getPairingCode(phone);
      if (pairingCode) {
        await this.wbaMgmtService.sendWhatsappConnectPairingCode(phone, pairingCode);
        await this.wbaMgmtService.sendWhatsappButtonsExplanation(phone, language);
      } else {
        await this.wbaMgmtService.sendErrorTooManyAttempts(phone, language);
      }
    }
    if (id === 'driverConnectWhatsappConfirmation') {
      const status = await this.whatsappServiceMgn.getConnectionStatus();
      if (status && status.find(p => p.phone === phone)?.isHealthy) {
        await this.wbaMgmtService.sendWhatsappConnectedMessage(phone, language);
      } else {
        await this.wbaMgmtService.sendWhatsappButtonsExplanation(phone, language);
      }
    }
    if (id === 'driverConnectWhatsappExplanationAndroid') {
      await this.wbaMgmtService.sendWhatsappExplanationAndroid(phone, language);
    }
    if (id === 'driverConnectWhatsappExplanationIos') {
      await this.wbaMgmtService.sendWhatsappExplanationIos(phone);
    }
    if (id === 'registerStation') {
      await this.stationWhatsappService.startRegistration(phone, language);
    }
    if (id === 'resendStationCode') {
      await this.stationWhatsappService.sendStationByPhone(phone, language);
    }
    if (id === 'sendMainMenu') {
      const driver = await this.driversService.findByPhone(phone);
      if (!!driver) {
        await this.wbaMgmtService.sendMainMenu(phone, driver.name, language);
      } else {
        await this.wbaMgmtService.sendRegistrationMenu(phone, language);
      }
    }
    if (id.startsWith('adminApprovePayment_')) {
      const [_, clientPhone, method] = id.split('_');
      await this.wbaMgmtService.manualApprovePayment(clientPhone, method);
    }
    if (id === 'cancelAndReturnPayment') {
      await this.wbaMgmtService.cancelPayment(phone);
    }
    if (id === 'stationGroupManageButton') {
      await this.stationWhatsappService.sendStationManageMessage(phone, language);
    }
    if (id === 'stationManageNormalSpeed') {
      await this.stationWhatsappService.sendStationManageSpeedMessage(phone, language, StagesType.NORMAL);
    }
    if (id === 'stationManageFastSpeed') {
      await this.stationWhatsappService.sendStationManageSpeedMessage(phone, language, StagesType.FAST);
    }
    if (id.startsWith('stationManage_') && id.endsWith('_SpeedStartButton')) {
      const type = id.split('_')[1];
      await this.stationWhatsappService.sendStationManageSpeedMessageStep1(phone, language, type);
    }
    if (id.startsWith('stationManage_') && id.includes('_SpeedButtonGroups_')) {
      const stage = id.split('_')[3] as StageSteps;
      await this.stationWhatsappService.sendFlowMessageListGroups(phone, language, stage);
    }
    if (id === 'stationManageConfirmButton') {
      await this.stationWhatsappService.sendStationManageNormalSpeedMessageSuccess(phone, language);
    }
    if (id === 'stationManageReEditButton') {
      const stage = await this.stationWhatsappService.getRegistrationStageState(phone);
      await this.stationWhatsappService.sendStationManageSpeedMessageStep1(phone, language, stage.type);
    }
    if (id === 'stationRegistrationArmButton') {
      await this.stationWhatsappService.sendStationRegistrationArmMessage(phone, language);
    }
    if (id === 'dispatcherRegistrationConfirmButton') {
      await this.dispatcherService.handleDispatcherRegistrationConfirmButton(phone, language);
    }
    if (id.startsWith('dispatcherRegistrationStationOwnerAcceptButton_')) {
      const [_, dispatcherPhone] = id.split('_');
      await this.dispatcherService.handleDispatcherRegistrationStationOwnerAcceptButton(dispatcherPhone, language);
    }
    if (id.startsWith('dispatcherRegistrationStationOwnerRejectButton_')) {
      const [_, dispatcherPhone] = id.split('_');
      await this.dispatcherService.handleDispatcherRegistrationStationOwnerRejectButton(dispatcherPhone, language);
    }
    if (id.startsWith('takeRideButton_')) {
      const [_, rideCode, driverPhone] = id.split('_');
      await this.dispatcherService.takeRide(phone, language, rideCode, driverPhone);
    }
    if (id === 'stationRegistrationArmConfirmOk') {
      await this.stationWhatsappService.completeRegistrationArm(phone, language);
    }
    if (id === 'stationRegistrationArmConfirmEdit') {
      await this.stationWhatsappService.registrationArmEdit(phone, language);
    }
    if (id.startsWith('stationRegistrationArmConnectWhatsapp_')) {
      const [_, armIndex] = id.split('_');
      await this.stationWhatsappService.sendStationRegistrationArmConnectWhatsapp(phone, language, armIndex);
    }
  }

  private async handlerListReply(phone: string, language: string, list: any) {
    const { id, title } = list;
    console.log("🔢 Webhook list:", id, title);
    this.elasticsearchService.logMessage(phone, title, WbaMgmtController.name);
    if (id === 'cancelAndReturn') {
      await this.wbaMgmtService.cancelRegistration(phone, language);
    }
    if (CATEGORY_BUTTONS_IDS.includes(id)) {
      await this.wbaMgmtService.handleRegistrationMessages(phone, id, language);
    }
    if (CLOTHING_BUTTONS_IDS.includes(id)) {
      await this.wbaMgmtService.handleRegistrationMessages(phone, id, language);
    }
    if (id.startsWith('driverPaymentCreditCard_')) {
      await this.wbaMgmtService.initPayment(phone, PaymentMethod.CREDIT_CARD);
      await this.wbaMgmtService.sendWhatsappCreditCard(phone, language, id.split('_')[1]);
    }
    if (id.startsWith('driverPaymentBit_')) {
      await this.wbaMgmtService.initPayment(phone, PaymentMethod.BIT);
      await this.wbaMgmtService.sendWhatsappBit(phone, language, id.split('_')[1]);
    }
    if (id.startsWith('driverPaymentPayBox_')) {
      await this.wbaMgmtService.initPayment(phone, PaymentMethod.PAY_BOX);
      await this.wbaMgmtService.sendWhatsappPayBox(phone, language, id.split('_')[1]);
    }
    if (id.startsWith('driverPaymentBankTransfer_')) {
      await this.wbaMgmtService.initPayment(phone, PaymentMethod.BANK_TRANSFER);
      await this.wbaMgmtService.sendWhatsappBankTransfer(phone, language, id.split('_')[1]);
    }
    if (id === 'menuLocationRides') {
      await this.wbaMgmtService.sendWhatsappLocationRidesMessage(phone, language);
    }
    // if (id === 'settingsRemoveGroupContent') {
    //   await this.wbaMgmtService.sendWhatsappRemoveGroupContent(phone, language);
    //   this.whatsappService.removeGroupContent(phone, language, 200);
    // }
    if (id === 'settingsSummarySearches') {
      await this.wbaMgmtService.sendSummarySearches(phone, language);
    }
    if (id === 'settingsFilterWords') {
      const driver = await this.driversService.findByPhone(phone);
      await this.wbaMgmtService.sendWhatsappFilterWordsMessages(phone, driver.category, language);
    }
    if (id.startsWith('filterWords_')) {
      const category = id.split('_')[1];
      await this.driversService.update(phone, { category });
      await this.wbaMgmtService.sendWhatsappFilterWordsMessages(phone, category, language);
    }
    if (id === 'settingsFilterCarType') {
      await this.whatsappFlowService.sendFlowMessageFilterCars(phone, language);
    }
    if (id === 'settingsLocationShare') {
      await this.whatsAppMessagingService.sendRequestLocationMessage(phone, language);
    }
    if (id === 'supportHuman') {
      await this.wbaMgmtService.sendSupportHumanMessage(phone, language);
    }
    if (id === 'secretMenuAutomaticDestination') {
      await this.wbaMgmtService.sendSecretMenuAutomaticDestination(phone, language);
    }
    if (id === 'secretMenuEditMessageToPrivate') {
      await this.wbaMgmtService.sendSecretMenuEditMessageToPrivate(phone, language);
    }
    if (id === 'secretMenuCancelAutomation') {
      await this.wbaMgmtService.sendSecretMenuCancelAutomation(phone, language);
    }
    if (id === 'settingsFilterGroups') {
      await this.whatsappServiceMgn.sendFlowMessageFilterGroups(phone, language);
    }
    if (id === 'infoVideoHelp') {
      await this.wbaMgmtService.sendHowBotWorksMessage(phone, language);
    }
    if (id === 'dispatcherProcessingRideNormalMethodButton') {
      await this.dispatcherService.handleDispatcherProcessingRideMethodButton(phone, language, StagesType.NORMAL);
    }
    if (id === 'dispatcherProcessingRideFastMethodButton') {
      await this.dispatcherService.handleDispatcherProcessingRideMethodButton(phone, language, StagesType.FAST);
    }
  }

  private async handleNfmReply(phone: string, language: string, nfmReply: any) {
    const { response_json } = nfmReply;
    const { data, flow_token } = JSON.parse(response_json);
    this.elasticsearchService.logMessage(phone, JSON.stringify({ data, flow_token }), WbaMgmtController.name);
    if (flow_token === DRIVER_FILTERS_WORDS_EN.flow_token) {
      const dataSource = language === 'he' ?
        DRIVER_FILTERS_WORDS_HE.data.screens[0].layout.children[0]['data-source'] :
        DRIVER_FILTERS_WORDS_EN.data.screens[0].layout.children[0]['data-source'];
      const categoryFilters = [];
      const categoryInactive = [];
      if (data.includes('allTypes')) {
        categoryFilters.push(...dataSource.filter(c => c.id !== 'allTypes').map(c => ({
          key: c.id,
          value: c.title
        })));
      } else {
        for (const { id, title } of dataSource) {
          if (data.includes(id)) {
            categoryFilters.push({
              key: id,
              value: title
            });
          } else {
            categoryInactive.push({
              key: id,
              value: title
            });
          }
        }
      }
      const allTypes = dataSource.find(c => c.id === 'allTypes');
      await this.driversService.update(phone, { categoryFilters: data.includes('allTypes') ? [{ key: allTypes.id, value: allTypes.title }] : categoryFilters });
      const flowJson = {
        header: DRIVER_FILTERS_WORDS_EN.header,
        body: DRIVER_FILTERS_WORDS_EN.body,
        cta: DRIVER_FILTERS_WORDS_EN.cta,
        flow_token: DRIVER_FILTERS_WORDS_EN.flow_token,
      };
      await this.wbaMgmtService.sendWhatsappFilterCarType(phone, categoryFilters, categoryInactive, flowJson, language);
    }

    if (flow_token === DRIVER_FILTERS_GROUPS.flow_token) {
      await this.driversService.update(phone, { filterGroups: data });
    }

    if (flow_token === `driver_station_${StageSteps.STAGE1}_filters_groups`) {
      const groups = await this.wabotService.getGroups(phone);
      const filterGroups = this.wbaMgmtService.getFilterGroups(groups, data);
      await this.stationWhatsappService.createGroups({
        phone,
        stage: StageSteps.STAGE1,
        delay: 0,
        groups: filterGroups.map(group => ({
          id: group.jid,
          name: group.name,
          description: group.description,
        })),
        isDraft: true,
      });
      await this.stationWhatsappService.sendStationManageSpeedMessageStep2Delay(phone, language);
    }
    if (flow_token === `driver_station_${StageSteps.STAGE2}_filters_groups`) {
      const groups = await this.wabotService.getGroups(phone);
      const filterGroups = this.wbaMgmtService.getFilterGroups(groups, data);
      await this.stationWhatsappService.createGroups({
        phone,
        stage: StageSteps.STAGE2,
        groups: filterGroups.map(group => ({
          id: group.jid,
          name: group.name,
          description: group.description,
        })),
        isDraft: true,
      });
      await this.stationWhatsappService.sendStationManageSpeedMessageStep3Delay(phone, language);
    }
    if (flow_token === `driver_station_${StageSteps.STAGE3}_filters_groups`) {
      const groups = await this.wabotService.getGroups(phone);
      const filterGroups = this.wbaMgmtService.getFilterGroups(groups, data);
      await this.stationWhatsappService.createGroups({
        phone,
        stage: StageSteps.STAGE3,
        groups: filterGroups.map(group => ({
          id: group.jid,
          name: group.name,
          description: group.description,
        })),
        isDraft: true,
      });
      await this.stationWhatsappService.sendStationManageNormalSpeedMessageConfirmation(phone, language);
    }
  }

  private async handleTextMessage(from: string, message: any, language: string) {
    const textLowerCase = message.text ? message.text.body.toLowerCase() : '';
    const text = message.text ? message.text.body : '';
    this.elasticsearchService.logMessage(from, text, WbaMgmtController.name);
    // handle registration messages
    const state = await this.wbaMgmtService.handleRegistrationMessages(from, text, language);
    if (state) {
      return 'OK';
    }
    
    // handle dispatcher registration messages
    const dispatcherState = await this.dispatcherService.handleMessage(from, text, language);
    if (dispatcherState) {
      return 'OK';
    }

    const [commandSender, rideCode] = textLowerCase.split(' ');
    if (commandSender === 'טן' && `${+rideCode}`.length === 7) {
      const result = await this.dispatcherService.sendRideMessage(from, rideCode, language);
      if (result) {
        return 'OK';
      }
    }
    
    if (textLowerCase === 'ס' || textLowerCase === 'סגור' || textLowerCase === 'close' || textLowerCase === 's') {
      await this.dispatcherService.completeRide(from, language);
      return 'OK';
    }


    const stationState = await this.stationWhatsappService.handleRegistration(from, text, language);
    if (stationState) {
      return 'OK';
    }

    if (getMenuCommands(this.localizationService).REGISTER.includes(textLowerCase)) {
      const driver = await this.driversService.findByPhone(from);
      if (!!driver) {
        await this.wbaMgmtService.sendAlreadyRegisteredMessage(from, language);
      } else {
        await this.wbaMgmtService.sendRegistrationMenu(from, language);
      }
      return 'OK';
    }

    if (getMenuCommands(this.localizationService).MENU.includes(textLowerCase)) {
      const driver = await this.driversService.findByPhone(from);
      if (!!driver) {
        await this.wbaMgmtService.sendMainMenu(from, driver.name, language);
      } else {
        await this.wbaMgmtService.sendRegistrationMenu(from, language);
      }
      return 'OK';
    }

    if (textLowerCase === this.localizationService.getMessage('secretMenuCommand', language).toLowerCase()) {
      const driver = await this.driversService.findByPhone(from);
      if (!!driver) {
        await this.wbaMgmtService.sendSecretMenu(driver, language);
      } else {
        await this.wbaMgmtService.sendRegistrationMenu(from, language);
      }
      return 'OK';
    }

    if (textLowerCase === this.localizationService.getMessage('dispatcherRegistrationCommand', language).toLowerCase()) {
      const driver = await this.driversService.findByPhone(from);
      if (!!driver) {
        // await this.wbaMgmtService.sendDispatcherRegistrationMenu(from, language);
      } else {
        await this.wbaMgmtService.sendRegistrationMenu(from, language);
      }
      return 'OK';
    }

    // handle search keyword
    this.wbaMgmtService.handleMessage(from, text, language);
  }

  private async handleWebhookInternal(body: any) {
    const [message] = body.object && body.entry && body.entry[0].changes[0].value?.messages || [];
    if (!message) return 'OK';
    const from = message.from;
    const language = getLanguageByPhoneNumber(from);
    switch (message.type) {
      case 'interactive': {
        const { interactive } = message;
        try {
          if (interactive.type === 'button_reply') {
            await this.handlerButtonReply(from, language, interactive.button_reply);
          } else if (interactive.type === 'list_reply') {
            await this.handlerListReply(from, language, interactive.list_reply);
          } else if (interactive.type === 'nfm_reply') {
            await this.handleNfmReply(from, language, interactive.nfm_reply);
          }
        } catch (error) {
          this.logger.error('Handle webhook error', error);
        }
        return 'OK';
      }
      case 'text': {
        await this.handleTextMessage(from, message, language);
        return 'OK';
      }
      case 'location': {
        const { latitude, longitude } = message.location;
        const city = await this.wbaMgmtService.getAreaFromLocation(latitude, longitude, language);
        if (!city) return 'OK';
        this.logger.debug("📍 Webhook location:", latitude, longitude, city);
        this.elasticsearchService.logMessage(from, city, WbaMgmtController.name);
        this.wbaMgmtService.handleMessage(from, city, language);
        return 'OK';
      }
      case 'image': {
        const { image } = message;
        this.elasticsearchService.logMessage(from, `image: ${image.id}`, WbaMgmtController.name);
        const paymentState = await this.wbaMgmtService.getPaymentState(from);
        if (paymentState) {
          await this.wbaMgmtService.handlePaymentMessages(from, paymentState, image.id);
        }
        return 'OK';
      }
    }
    return 'OK';
  }

  @Get('webhook')
  async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    this.logger.log(`Received webhook verification request: mode=${mode}, token=${token}`);
    if (mode && token) {
      if (mode === 'subscribe' && token === this.configService.get('WHATSAPP_VERIFY_TOKEN')) {
        this.logger.log('Webhook verified!');
        return challenge;
      }
      this.logger.log('Webhook not verified!');
    }
    return 'Forbidden';
  }

  @Post('webhook')
  async handleWebhook(@Body() body: any) {
    const [message] = body.object && body.entry && body.entry[0].changes[0].value?.messages || [];
    if (!message) return 'OK';
    return this.handleWebhookInternal(body);
  }

  @Post('send-interactive')
  async sendInteractive(@Body() body: SendInteractiveDto) {
    const response = await this.whatsAppMessagingService.sendInteractiveMessage({
      phone: body.to,
      language: body.language || 'en',
      messageKey: body.messageKey as keyof LocalizedMessages,
      buttons: body.buttons
    });
    // Return only the necessary data from the response
    return {
      success: true,
      messageId: response.data?.messages?.[0]?.id,
      timestamp: response.data?.messages?.[0]?.timestamp
    };
  }

  @Get('get-phone-numbers')
  async getPhoneNumbers() {
    return this.wbaMgmtService.getPhoneNumberId();
  }

} 