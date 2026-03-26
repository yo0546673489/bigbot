import { Injectable, Logger, OnModuleInit, Inject, forwardRef, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { WbaMgmtConfig } from './wab.config';
import { LocalizedMessages, messages } from '../common/localization/messages';
import { LocalizationService } from '../common/localization/localization.service';
import { RegistrationState, RegistrationStateService, RegistrationStep } from '../drivers/registration-state.service';
import { WhatsAppMessagingService } from '../services/whatsapp-messaging.service';
import {
  BUTTON_IDS,
  WHATSAPP_MESSAGE_TYPES,
  INTERACTIVE_TYPES,
  VALIDATION,
  WHATSAPP_API,
  CATEGORY_BUTTONS_IDS,
  CLOTHING_BUTTONS_IDS,
} from '../common/constants';
import { getLanguageByPhoneNumber, getMainMenuButtons, getOriginAndDestination, getTimePeriod, getTimezone, isInTrial, isNeedToPay } from '../common/utils';
import * as moment from 'moment';
import { Driver, PaymentPackage, DriverDocument } from 'src/drivers/schemas/driver.schema';
import { DriverMessagePrivateService } from 'src/drivers/driver-message-private.service';
import { DriverMessagePrivate, MessageType } from 'src/drivers/schemas/driver-message-private.schema';
import path from 'path';
import { WhatsappFlowService } from 'src/whatsappflow/whatsappflow.service';
import { PaymentMethod, PaymentStatus } from 'src/payment/schemas/payment.schema';
import { Payment } from 'src/payment/schemas/payment.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ElasticsearchService } from 'src/shared/elasticsearch/elasticsearch.service';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis';
import { DriverMessageTrackerService } from 'src/drivers/driver-message-tracker.service';
import { DriverSearchKeywordService } from 'src/drivers/driver-search-keyword.service';
import { Group } from 'src/stations/schemas/station.schema';
import { GroupInfo } from 'src/common/types';

@Injectable()
export class WbaMgmtService implements OnModuleInit {
  private readonly logger = new Logger(WbaMgmtService.name);
  private readonly api: AxiosInstance;
  private readonly config: WbaMgmtConfig;
  private readonly specialRouterName = [
    this.localizationService.getMessage('specialRouterDelivery', 'he'),
    this.localizationService.getMessage('specialRouterDeliveries', 'he')
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly localizationService: LocalizationService,
    private readonly registrationStateService: RegistrationStateService,
    private readonly whatsAppMessagingService: WhatsAppMessagingService,
    private readonly driverMessagePrivateService: DriverMessagePrivateService,
    private readonly whatsappFlowService: WhatsappFlowService,
    private readonly elasticsearchService: ElasticsearchService,
    private readonly driverSearchKeywordService: DriverSearchKeywordService,
    private readonly driverMessageTrackerService: DriverMessageTrackerService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(Driver.name) private driverModel: Model<Driver>,
    @InjectModel(DriverMessagePrivate.name) private driverMessagePrivateModel: Model<DriverMessagePrivate>,
  ) {
    this.config = {
      whatsappToken: this.configService.get<string>('WHATSAPP_TOKEN'),
      whatsappBusinessId: this.configService.get<string>('WHATSAPP_BUSINESS_ID'),
      whatsappPhoneNumberId: this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID'),
      whatsappVerifyToken: this.configService.get<string>('WHATSAPP_VERIFY_TOKEN'),
    };

    // Validate required configuration
    this.validateConfig();

    this.api = axios.create({
      baseURL: WHATSAPP_API.BASE_URL + '/' + WHATSAPP_API.VERSION,
      headers: {
        Authorization: `Bearer ${this.config.whatsappToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async onModuleInit() {
    if (!this.config.whatsappToken) {
      this.logger.warn('WhatsApp Business API token not set - skipping token validation. Using Go bot for messaging.');
      return;
    }
    try {
      await this.validateToken();
      this.logger.log('TravelBot service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize TravelBot service:', error.message);
      throw error;
    }
  }

  private validateConfig() {
    const missingConfigs = Object.entries(this.config)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missingConfigs.length > 0) {
      this.logger.warn(
        `WhatsApp Business API not configured: ${missingConfigs.join(', ')}. Business API features unavailable. Using Go bot (whatsmeow) for messaging.`
      );
    }
  }

  async validateToken() {
    try {
      const response = await axios.get('https://graph.facebook.com/debug_token', {
        params: {
          input_token: this.config.whatsappToken,
          access_token: this.config.whatsappToken,
        },
      });

      const data = response.data.data;
      this.logger.log('Token Info:', {
        app_id: data.app_id,
        type: data.type,
        expires_at: new Date(data.expires_at * 1000).toLocaleString(),
        scopes: data.scopes,
      });

      if (!data.is_valid) {
        throw new Error(`Token is invalid: ${data.error?.message || 'Unknown error'}`);
      }

      const requiredPermissions = ['whatsapp_business_messaging'];
      const missingPermissions = requiredPermissions.filter(p => !data.scopes.includes(p));

      if (missingPermissions.length > 0) {
        throw new Error(`Missing required permissions: ${missingPermissions.join(', ')}`);
      }

      if (data.expires_at && data.expires_at * 1000 < Date.now()) {
        throw new Error(`Token expired at ${new Date(data.expires_at * 1000).toLocaleString()}`);
      }

      return data;
    } catch (error) {
      if (error.response?.data) {
        this.logger.error('Token validation failed:', error.response.data);
        throw new Error(`Token validation failed: ${error.response.data.error?.message || 'Unknown error'}`);
      }
      throw error;
    }
  }

  async getUserProfile() {
    try {
      const response = await this.api.get('/me?fields=id,name');
      this.logger.log('User Profile:', response.data);
      return response.data;
    } catch (error) {
      this.logger.error('Error getting user profile:', error.response?.data || error.message);
      throw error;
    }
  }

  async getPhoneNumberId() {
    try {
      const accountsResponse = await this.api.get('/me/accounts');
      this.logger.log('Accounts response:', accountsResponse.data);

      if (!accountsResponse.data.data || accountsResponse.data.data.length === 0) {
        throw new Error('No accounts found');
      }

      const account = accountsResponse.data.data.find(
        a => a.id === this.config.whatsappBusinessId
      );

      if (!account) {
        throw new Error('Business account not found');
      }

      const accessToken = account.access_token;
      this.logger.log('Got access token for business account');

      const accountApi = axios.create({
        baseURL: 'https://graph.facebook.com/v22.0',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const response = await accountApi.get(`/${this.config.whatsappBusinessId}/phone_numbers`);
      this.logger.log('Phone numbers response:', response.data);

      if (response.data.data && response.data.data.length > 0) {
        const phoneNumberId = response.data.data[0].id;
        this.logger.log('Phone Number ID:', phoneNumberId);
        return phoneNumberId;
      } else {
        throw new Error('No phone numbers found for this WhatsApp Business Account');
      }
    } catch (error) {
      this.logger.error('Error getting phone number ID:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendRegistrationMenu(phone: string, language: string) {
    const buttons = [
      {
        id: BUTTON_IDS.MENU.REGISTER,
        title: this.localizationService.getMessage('register', language),
      }
    ];

    await this.whatsAppMessagingService.sendInteractiveMessage({
      phone,
      language,
      messageKey: 'notRegistered' as keyof LocalizedMessages,
      buttons
    });
  }

  async sendMainMenu(phone: string, name: string, language: string) {
    const obj = getMainMenuButtons(language, this.localizationService);
    const timePeriod = getTimePeriod(language, this.localizationService);
    const msg = `${timePeriod}!\n🔵 ${name} |\n\n${this.localizationService.getMessage('menuPerformActionsMessage', language)}\n${this.localizationService.getMessage('keyWordSignAppName', language)}`;
    await this.whatsAppMessagingService.sendInteractiveWithListButtons({
      phone,
      language,
      message: msg,
      sections: obj.sections,
      optionsTitle: obj.optionsTitle,
    });
  }

  async sendTextMessage({ phone, text }: { phone: string, text: string }): Promise<void> {
    return this.whatsAppMessagingService.sendTextMessage({ phone, text });
  }

  private validateName(name: string): boolean {
    return name.length >= VALIDATION.NAME.MIN_LENGTH && VALIDATION.NAME.REGEX.test(name);
  }

  private validateClothing(type: string): boolean {
    const clothingRegex = /^(clothingHarediBlackAndWhite|clothingHaredi|clothingReligious|clothingElegant|clothingHasimHasid|clothingDriver|clothingHasimDriver)$/;
    if (!clothingRegex.test(type)) {
      return false;
    }
    return true;
  }

  private validateCategory(category: string): boolean {
    const categoryRegex = /^(categoryStationWagon|category4Seats|categoryMini|categorySpaciousMini|category8Seats|category9Seats|category10SeatsOrMore)$/;
    if (!categoryRegex.test(category)) {
      return false;
    }
    return true;
  }

  private validateDOB(dob: string): boolean {
    // Check format DD/MM/YYYY
    const dobRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
    if (!dobRegex.test(dob)) {
      return false;
    }

    // Parse date
    const [day, month, year] = dob.split('/').map(Number);
    const date = new Date(year, month - 1, day);

    // Validate date is valid (e.g., not 31/02/2024)
    if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
      return false;
    }

    // Validate age (must be at least 18 years old)
    const today = new Date();
    const age = today.getFullYear() - year -
      (today.getMonth() < month - 1 ||
        (today.getMonth() === month - 1 && today.getDate() < day) ? 1 : 0);

    return age >= 18;
  }

  private async handleRegistrationStep(phone: string, message: string, language: string = 'en'): Promise<void> {
    const state = await this.registrationStateService.getStateAsync(phone);
    if (!state) {
      this.logger.error(`No registration state found for ${phone}`);
      return;
    }

    this.logger.log(`Handling registration step ${state.currentStep} for ${phone}`);

    switch (state.currentStep) {
      case RegistrationStep.NAME:
        if (!this.validateName(message)) {
          await this.sendTextMessage({ phone, text: this.localizationService.getMessage('invalid_name', language) });
          return;
        }
        await this.registrationStateService.updateStateAsync(phone, RegistrationStep.DOB, { name: message });
        await this.sendDobOptions(phone, language);
        break;

      case RegistrationStep.DOB:
        if (!this.validateDOB(message)) {
          await this.sendTextMessage({ phone, text: this.localizationService.getMessage('invalid_dob', language) });
          return;
        }
        await this.registrationStateService.updateStateAsync(phone, RegistrationStep.CATEGORY, { dob: message });
        await this.sendCategoryOptions(phone, language);
        break;

      case RegistrationStep.CATEGORY:
        if (!this.validateCategory(message)) {
          await this.sendCategoryOptions(phone, language);
          return;
        }

        await this.registrationStateService.updateStateAsync(phone, RegistrationStep.VEHICLE, { category: message });
        await this.sendVehicleTypeOptions(phone, language);
        break;

      case RegistrationStep.VEHICLE:
        if (!message) {
          await this.sendVehicleTypeOptions(phone, language);
          return;
        }
        await this.registrationStateService.updateStateAsync(phone, RegistrationStep.CLOTHING, { vehicle: message });
        await this.sendClothingOptions(phone, language);
        break;

      case RegistrationStep.CLOTHING:
        if (!this.validateClothing(message)) {
          await this.sendClothingOptions(phone, language);
          return;
        }

        await this.registrationStateService.updateStateAsync(phone, RegistrationStep.COMPLETED, { clothing: message });
        await this.sendVerificationMessage(phone, language);
        await this.sendSupportMessage(phone, language);
        await this.completeRegistration(phone, language);
        break;

      default:
        this.logger.error(`Unknown registration step: ${state.currentStep}`);
        await this.sendTextMessage({ phone, text: this.localizationService.getMessage('registration_error', language) });
        break;
    }
  }

  private async sendVerificationMessage(phone: string, language: string): Promise<void> {
    const state = await this.registrationStateService.getStateAsync(phone);
    if (!state) {
      this.logger.error(`No registration state found for ${phone}`);
      return;
    }

    const verificationMessage = this.localizationService.getMessage('registrationStepVerification', language);
    const clothing = this.localizationService.getMessage(state.data.clothing as keyof LocalizedMessages, language);
    const category = this.localizationService.getMessage(state.data.category as keyof LocalizedMessages, language);
    const age = moment().diff(moment(state.data.dob, 'DD/MM/YYYY'), 'years');

    const verificationText = `
    ${this.localizationService.getMessage('registrationComplete', language)}
    
1️⃣ ${this.localizationService.getMessage('name', language)}: ${state.data.name}
2️⃣ ${this.localizationService.getMessage('age', language)}: ${age}
3️⃣ ${this.localizationService.getMessage('category', language)}: ${category}
4️⃣ ${this.localizationService.getMessage('vehicle', language)}: ${state.data.vehicle}
5️⃣ ${this.localizationService.getMessage('dressed', language)}: ${clothing}

${verificationMessage}
`;
    await this.sendTextMessage({ phone, text: verificationText, });
  }

  async cancelRegistration(phone: string, language: string): Promise<void> {
    this.registrationStateService.cancelRegistration(phone);
    await this.sendTextMessage({ phone, text: this.localizationService.getMessage('registration_cancelled', language) });
  }

  private async sendVehicleTypeOptions(phone: string, language: string = 'en'): Promise<void> {
    const buttons = [{ id: 'cancelAndReturn', title: this.localizationService.getMessage('cancelAndReturn', language) }];
    await this.whatsAppMessagingService.sendInteractiveMessage({
      phone,
      language,
      messageKey: 'registrationStepVehicle' as keyof LocalizedMessages,
      buttons,
      header: this.localizationService.getMessage('registrationStep', language)
    });
  }
  private async sendDobOptions(phone: string, language: string = 'en'): Promise<void> {
    const buttons = [{ id: 'cancelAndReturn', title: this.localizationService.getMessage('cancelAndReturn', language) }];
    await this.whatsAppMessagingService.sendInteractiveMessage({
      phone,
      language,
      messageKey: 'registrationStepDob' as keyof LocalizedMessages,
      buttons,
      header: this.localizationService.getMessage('registrationStep', language)
    });
  }

  async sendCategoryOptions(phone: string, language: string = 'en'): Promise<void> {
    const buttons = CATEGORY_BUTTONS_IDS.map(id => ({
      id,
      title: this.localizationService.getMessage(id, language),
      description: this.localizationService.getMessage(`${id}Description`, language)
    }));

    await this.whatsAppMessagingService.sendInteractiveMessage({
      phone,
      language,
      messageKey: 'registrationStepCategory' as keyof LocalizedMessages,
      buttons,
      header: this.localizationService.getMessage('goSelectCategory', language),
      optionsTitle: this.localizationService.getMessage('goSelectCategory', language),
      footer: this.localizationService.getMessage('registrationStepCategoryOptionsFooter', language)
    });
  }

  private async sendClothingOptions(phone: string, language: string = 'en'): Promise<void> {
    const buttons = CLOTHING_BUTTONS_IDS.map(id => ({
      id,
      title: this.localizationService.getMessage(id, language),
    }));

    await this.whatsAppMessagingService.sendInteractiveMessage({
      phone,
      language,
      messageKey: 'registrationStepClothing' as keyof LocalizedMessages,
      buttons,
      optionsTitle: this.localizationService.getMessage('goSelectClothing', language),
      footer: this.localizationService.getMessage('registrationStepClothingOptionsFooter', language)
    });
  }

  private async notifyAdminNewRegistration(driver: any): Promise<void> {
    const adminPhone = this.configService.get('ADMIN_PHONE2');
    if (!adminPhone) {
      this.logger.warn('Admin phone number not configured');
      return;
    }
    const language = getLanguageByPhoneNumber(adminPhone);

    const clothing = this.localizationService.getMessage(driver.clothing as keyof LocalizedMessages, language);
    const category = this.localizationService.getMessage(driver.category as keyof LocalizedMessages, language);

    const message = `
      ${this.localizationService.getMessage('newDriverRegistration', language)} 
      👉 ${driver.phone}
      
1️⃣ ${this.localizationService.getMessage('name', language)}: ${driver.name}
2️⃣ ${this.localizationService.getMessage('dressed', language)}: ${clothing}
3️⃣ ${this.localizationService.getMessage('category', language)}: ${category}
4️⃣ ${this.localizationService.getMessage('vehicle', language)}: ${driver.vehicle}
    `;

    await this.sendTextMessage({ phone: adminPhone, text: message });
    this.logger.log(`Sent new driver registration notification to admin: ${adminPhone}`);
  }

  async sendWelcomeMessage(phone: string, language: string): Promise<void> {
    await this.sendTextMessage({ phone, text: this.localizationService.getMessage('welcome', language) });
  }

  async startRegistration(phone: string, language: string): Promise<void> {
    this.registrationStateService.startRegistration(phone);
    await this.registrationStateService.updateStateAsync(phone, RegistrationStep.NAME, { language });
    const buttons = [{ id: 'cancelAndReturn', title: this.localizationService.getMessage('cancelAndReturn', language) }];
    await this.whatsAppMessagingService.sendInteractiveMessage({
      phone,
      language,
      messageKey: 'registrationStepName' as keyof LocalizedMessages,
      buttons,
      header: this.localizationService.getMessage('registrationStep', language)
    });
  }

  private async completeRegistration(phone: string, language: string): Promise<void> {
    try {
      const driver = await this.registrationStateService.completeRegistration(phone);
      await this.notifyAdminNewRegistration(driver);
    } catch (error) {
      this.logger.error('Failed to complete registration:', error);
      await this.sendTextMessage({ phone, text: this.localizationService.getMessage('registration_error', language) });
    }
  }

  private async sendSupportMessage(phone: string, language: string): Promise<void> {
    await this.whatsAppMessagingService.interactiveCallToAction({
      phone,
      bodyText: this.localizationService.getMessage('supportAppMessage', language),
      buttonUrl: 'https://api.whatsapp.com/send?phone=972537276221',
      buttonText: this.localizationService.getMessage('supportAppButton', language),
    });
    await this.whatsAppMessagingService.sendVideoMessage({
      phone,
      videoLink: 'https://bot.pro-digital.org/media/video2.mp4',
      caption: `סירטון הדרכה`
    });
  }

  async sendSupportHumanMessage(phone: string, language: string): Promise<void> {
    await this.whatsAppMessagingService.interactiveCallToAction({
      phone,
      bodyText: this.localizationService.getMessage('supportHumanMessage', language),
      buttonUrl: 'https://api.whatsapp.com/send?phone=972537276221',
      buttonText: this.localizationService.getMessage('supportHumanButton', language),
    });
  }

  async sendDriverContinueMessage(phone: string, language: string, isPremium: boolean): Promise<void> {
    if (isPremium) {
      // Message 1
      const msg = `${this.localizationService.getMessage('driverPremiumMessage', language)}
${this.localizationService.getMessage('keyWordSignAppName', language)}`
      await this.whatsAppMessagingService.sendTextMessage({
        phone,
        text: msg,
      });

      // Message 2
      await this.whatsAppMessagingService.sendInteractiveMessage({
        phone,
        language,
        message: this.localizationService.getMessage('driverContinueMessage', language),
        buttons: [
          {
            id: 'driverConnectWhatsappButton',
            title: this.localizationService.getMessage('driverConnectWhatsappButton', language)
          }
        ]
      });
      await this.elasticsearchService.logMessage(phone, msg, WbaMgmtService.name, { isRegular: false });
      return
    }

    // Message 1
    const msg = `${this.localizationService.getMessage('driverRegularMessage', language)}

${this.localizationService.getMessage('keyWordSignAppName', language)}`

    await this.whatsAppMessagingService.sendTextMessage({
      phone,
      text: msg,
    });
    await this.elasticsearchService.logMessage(phone, msg, WbaMgmtService.name, { isRegular: true });

    // Message 2
    const msgConnected = `${this.localizationService.getMessage('driverRegularMessageConnected', language)}

${this.localizationService.getMessage('keyWordSignAppName', language)}`

    await this.whatsAppMessagingService.sendTextMessage({
      phone,
      text: msgConnected,
    });
    await this.elasticsearchService.logMessage(phone, msgConnected, WbaMgmtService.name, { isRegular: true });
  }

  async sendHowBotWorksMessage(phone: string, language: string): Promise<void> {
    await this.whatsAppMessagingService.sendInteractiveMessageWithVideoHeader({
      phone,
      headerVideo: 'https://bot.pro-digital.org/media/video2.mp4',
      bodyText: this.localizationService.getMessage('goWatchVideoHowBotWorks', language),
      buttons: [
        {
          id: 'sendMainMenu',
          title: this.localizationService.getMessage('menuPerformActions', language)
        }
      ]
    });
  }

  async sendAlreadyRegisteredMessage(phone: string, language: string): Promise<void> {
    await this.sendTextMessage({ phone, text: this.localizationService.getMessage('driver_already_registered', language) });
  }

  async sendWhatsappNotConnectedMessage(phone: string, language: string): Promise<void> {
    await this.whatsAppMessagingService.sendInteractiveMessage({
      phone,
      language,
      messageKey: 'driverConnectWhatsappMessageNotConnected' as keyof LocalizedMessages,
      buttons: [{ id: 'driverConnectWhatsappMessageNow', title: this.localizationService.getMessage('driverConnectWhatsappMessageNow', language) }]
    });
  }

  async sendWhatsappConnectInstruction(phone: string, language: string): Promise<void> {
    await this.sendTextMessage({
      phone,
      text: `${this.localizationService.getMessage('driverConnectWhatsappConnectInstruction', language)}`
    });
  }

  async sendWhatsappConnectPairingCode(phone: string, pairingCode: string): Promise<void> {
    await this.sendTextMessage({
      phone,
      text: `${pairingCode}`
    });
  }

  async sendWhatsappButtonsExplanation(phone: string, language: string): Promise<void> {
    await this.whatsAppMessagingService.sendInteractiveMessage({
      phone,
      language,
      messageKey: 'driverConnectWhatsappButtonsExplanation' as keyof LocalizedMessages,
      buttons: [
        {
          id: 'driverConnectWhatsappConfirmation',
          title: this.localizationService.getMessage('driverConnectWhatsappConfirmation', language)
        },
        {
          id: 'driverConnectWhatsappExplanationAndroid',
          title: this.localizationService.getMessage('driverConnectWhatsappExplanationAndroid', language)
        },
        // {
        //   id: 'driverConnectWhatsappExplanationIos',
        //   title: this.localizationService.getMessage('driverConnectWhatsappExplanationIos', language)
        // }
      ]
    });
  }

  async sendWhatsappExplanationAndroid(phone: string, language: string): Promise<void> {
    await this.whatsAppMessagingService.sendVideoMessage({
      phone,
      videoLink: 'https://bot.pro-digital.org/media/howToUse.mp4',
      caption: this.localizationService.getMessage('goWatchVideoHowBotWorks', language)
    });
  }

  async sendWhatsappExplanationIos(phone: string): Promise<void> {
    await this.sendTextMessage({ phone, text: 'https://www.youtube.com/watch?v=2PzIAa3M8rM' });
  }

  async sendErrorTooManyAttempts(phone: string, language: string): Promise<void> {
    await this.sendTextMessage({ phone, text: this.localizationService.getMessage('driverConnectWhatsappMessageErrorTooManyAttempts', language) });
  }

  async sendWhatsappConnectedMessage(phone: string, language: string): Promise<void> {
    const driver = await this.driverModel.findOneAndUpdate({ phone }, { paymentPackage: PaymentPackage.PREMIUM }, {}).lean().exec();
    if (!driver) return;
    
    const msg = `${this.localizationService.getMessage('driverConnectWhatsappMessageConnected', language)}`;
    await this.whatsAppMessagingService.sendInteractiveMessage({
      phone,
      language,
      message: msg,
      optionsTitle: this.localizationService.getMessage('goWatchVideoHowBotWorks', language),
      buttons: [
        {
          id: 'goWatchVideoHowBotWorks',
          title: this.localizationService.getMessage('goWatchVideoHowBotWorks', language)
        },
      ]
    });
    await this.redisClient.set(`driver:${driver.phone}`, JSON.stringify(driver));
    await this.elasticsearchService.logMessage(driver.phone, msg, WbaMgmtService.name);
  }

  async handleRegistrationMessages(phone: string, value: string, language: string): Promise<RegistrationState | null> {
    const state = await this.registrationStateService.getStateAsync(phone);
    if (state) {
      await this.handleRegistrationStep(phone, value, language);
      return state;
    }

    return null;
  }

  async initPayment(phone: string, paymentMethod: PaymentMethod): Promise<void> {
    const driver = await this.getDriverForUpdate(phone);
    if (!driver) return;
    
    await this.paymentModel.findOneAndUpdate({
      clientPhone: phone,
      status: PaymentStatus.PENDING,
    }, {
      method: paymentMethod,
      clientName: driver.name,
    }, {
      new: true,
      upsert: true
    }).exec();
  }

  async getPaymentState(phone: string): Promise<Payment | null> {
    return this.paymentModel.findOne({
      clientPhone: phone,
      $or: [
        { method: PaymentMethod.PAY_BOX },
        { method: PaymentMethod.BANK_TRANSFER }
      ],
      status: PaymentStatus.PENDING,
    }).exec();
  }

  async cancelPayment(clientPhone: string): Promise<void> {
    await this.paymentModel.deleteOne({
      clientPhone: clientPhone,
      status: PaymentStatus.PENDING,
    }).exec();
  }

  async handlePaymentMessages(phone: string, state: Payment, imageId: string): Promise<Payment | null> {
    const language = getLanguageByPhoneNumber(this.configService.get('ADMIN_PHONE'));
    switch (state.method) {
      case PaymentMethod.PAY_BOX:
        await this.whatsAppMessagingService.sendInteractiveMessageWithImageHeader({
          phone: this.configService.get('ADMIN_PHONE'),
          headerImage: imageId,
          bodyText: phone,
          buttons: [
            {
              id: `adminApprovePayment_${phone}_${PaymentMethod.PAY_BOX}`,
              title: this.localizationService.getMessage('approvePayment', language)
            }
          ]
        });
        break;
      case PaymentMethod.BANK_TRANSFER:
        await this.whatsAppMessagingService.sendInteractiveMessageWithImageHeader({
          phone: this.configService.get('ADMIN_PHONE'),
          headerImage: imageId,
          bodyText: phone,
          buttons: [
            {
              id: `adminApprovePayment_${phone}_${PaymentMethod.BANK_TRANSFER}`,
              title: this.localizationService.getMessage('approvePayment', language)
            }
          ]
        });
        break;
    }

    return state;
  }

  async sendWhatsappCreditCard(phone: string, language: string, paymentPackage: PaymentPackage): Promise<void> {
    let buttonUrl = 'https://payments.payplus.co.il/l/7b0f6aa5-9444-467e-b2c9-0678e493ba64';
    if (paymentPackage === PaymentPackage.PREMIUM) {
      buttonUrl = 'https://payments.payplus.co.il/l/c5946dfa-2c1e-4082-ad9c-2abae34cf508';
    }
    await this.whatsAppMessagingService.interactiveCallToAction({
      phone,
      bodyText: this.localizationService.getMessage('driverPaymentCreditCardDescription', language),
      buttonUrl,
      buttonText: this.localizationService.getMessage('paymentButton', language),
    });
  }

  async sendWhatsappBit(phone: string, language: string, paymentPackage: PaymentPackage): Promise<void> {
    let buttonUrl = 'https://payments.payplus.co.il/l/7b0f6aa5-9444-467e-b2c9-0678e493ba64';
    if (paymentPackage === PaymentPackage.PREMIUM) {
      buttonUrl = 'https://payments.payplus.co.il/l/c5946dfa-2c1e-4082-ad9c-2abae34cf508';
    }
    await this.whatsAppMessagingService.interactiveCallToAction({
      phone,
      bodyText: this.localizationService.getMessage('driverPaymentBitMessage', language),
      buttonUrl,
      buttonText: this.localizationService.getMessage('paymentButton', language),
    });
  }

  async sendWhatsappPayBox(phone: string, language: string, paymentPackage: PaymentPackage): Promise<void> {
    const msg = this.localizationService.getMessage('driverPaymentPayBoxMessage', language);
    await this.whatsAppMessagingService.interactiveCallToAction({
      phone,
      bodyText: msg.replace('{total}', paymentPackage === PaymentPackage.PREMIUM ? '49' : '29'),
      buttonUrl: 'https://links.payboxapp.com/77Wz5PHrpWb',
      buttonText: this.localizationService.getMessage('paymentButton', language),
    });
    await this.sendPaymentConfirmationImageWaiting(phone, language);
  }

  async sendPaymentConfirmationImageWaiting(phone: string, language: string): Promise<void> {
    await this.whatsAppMessagingService.sendInteractiveMessage({
      phone,
      language,
      messageKey: 'paymentConfirmationImageWaiting' as keyof LocalizedMessages,
      buttons: [
        {
          id: 'cancelAndReturnPayment',
          title: this.localizationService.getMessage('cancelAndReturn', language)
        }
      ]
    });
  }

  async sendWhatsappBankTransfer(phone: string, language: string, paymentPackage: PaymentPackage): Promise<void> {
    const msg = this.localizationService.getMessage('driverPaymentBankTransferMessage', language);
    await this.whatsAppMessagingService.sendInteractiveMessage({
      phone,
      language,
      message: msg.replace('{total}', paymentPackage === PaymentPackage.PREMIUM ? '49' : '29'),
      buttons: [
        {
          id: 'cancelAndReturnPayment',
          title: this.localizationService.getMessage('cancelAndReturn', language)
        }
      ]
    });
  }

  async manualApprovePayment(clientPhone: string, method: PaymentMethod): Promise<void> {
    const language = getLanguageByPhoneNumber(clientPhone);
    const timezone = getTimezone(language);
    const driver = await this.driverModel.findOneAndUpdate({
      phone: clientPhone,
    }, {
      billingEndAt: moment.tz(timezone).add(1, 'month').valueOf()
    }, {
      new: true,
    }).lean().exec();

    if (!driver) {
      this.logger.error(`Driver not found for phone: ${clientPhone}`);
      return;
    }
    await this.redisClient.set(`driver:${driver.phone}`, JSON.stringify(driver));

    await this.paymentModel.findOneAndUpdate({
      clientPhone: clientPhone,
      method,
    }, {
      status: PaymentStatus.PAID,
      endDate: moment.tz(timezone).add(1, 'month').toDate(),
      nextPaymentDate: moment.tz(timezone).add(1, 'month').valueOf(),
      isRecurring: false,
      startDate: moment.tz(timezone).toDate(),
      paymentMethod: method,
      sum: '49',
      productName: 'Bigbot',
      ownerId: driver._id.toString(),
    }, {
      new: true,
    }).exec();

    await this.sendWhatsappPaymentSuccess(clientPhone, language);
  }

  async sendWhatsappPaymentSuccess(phone: string, language: string): Promise<void> {
    await this.sendTextMessage({ phone, text: this.localizationService.getMessage('driverPaymentSuccess', language) });
  }

  async sendWhatsappFindingRides(phone: string, text: string, language: string, sameDriverSearchCount: number): Promise<void> {
    const msg = `${this.localizationService.getMessage('keyWordSearchFreeFrom', language)} *${this.localizationService.getMessage('keyWordSearchFrom', language)}${text}*
${this.localizationService.getMessage('keyWordSearchSearching', language)} ${text}

${this.localizationService.getMessage('keyWordSearchFreeLooking', language)}

${this.localizationService.getMessage('keyWordSearchFreeWithYou', language)} ${this.localizationService.getMessage('keyWordSearchFrom', language)}${text}: ${sameDriverSearchCount}

${this.localizationService.getMessage('keyWordSignAppName', language)}`;

    const obj = getMainMenuButtons(language, this.localizationService);
    await this.whatsAppMessagingService.sendInteractiveWithListButtons({
      phone,
      message: msg,
      sections: obj.sections,
      language: language,
      optionsTitle: obj.optionsTitle,
    });
    this.elasticsearchService.logMessage(phone, msg, WbaMgmtService.name);
  }

  async sendWhatsappSearchEnded(phone: string, language: string): Promise<void> {
    const msg = `${this.localizationService.getMessage('driverSearchEnded', language)}
${this.localizationService.getMessage('keyWordSignAppName', language)}`;
    const obj = getMainMenuButtons(language, this.localizationService);
    await this.whatsAppMessagingService.sendInteractiveWithListButtons({
      phone,
      message: msg,
      sections: obj.sections,
      language: language,
      optionsTitle: obj.optionsTitle,
    });
  }

  async getAreaFromLocation(latitude: number, longitude: number, language: string): Promise<string> {
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${latitude}+${longitude}&key=${this.configService.get('OPENCAGE_API_KEY')}&language=${language}`;
    const response = await axios.get(url);
    const city = response.data?.results?.[0]?.components?.city || response.data?.results?.[0]?.components?._normalized_city;
    if (!city) {
      this.logger.warn('No city found in location:', { latitude, longitude });
      return '';
    }
    return `${this.localizationService.getMessage('driverSearchKeywordPrefix', language)}${city}`;
  }

  async sendWhatsappLocationRidesMessage(phone: string, language: string): Promise<void> {
    await this.sendTextMessage({
      phone,
      text: this.localizationService.getMessage('menuLocationRidesMessage', language)
    });
  }

  async sendWhatsappRemoveGroupContent(phone: string, language: string): Promise<void> {
    await this.sendTextMessage({
      phone,
      text: this.localizationService.getMessage('settingsRemoveGroupContentMessage', language)
    });
  }

  async sendWhatsappSummarySearches(phone: string, summary: string): Promise<void> {
    await this.sendTextMessage({
      phone,
      text: summary
    });
  }

  async sendWhatsappFilterWordsMessages(phone: string, category: string, language: string): Promise<void> {
    const buttons = CATEGORY_BUTTONS_IDS.map(id => ({
      id: `filterWords_${id}`,
      isActive: category === id,
      title: this.localizationService.getMessage(id, language),
      description: this.localizationService.getMessage(`${id}Description`, language)
    }));
    const msg = `${this.localizationService.getMessage('vehicleDesignatedForAcceptingTrips', language)}
${buttons.filter(c => c.isActive).map(c => `• ${c.title}`).join('\n')}\n
${this.localizationService.getMessage('vehicleDesignatedNotToAcceptTrips', language)}
${buttons.filter(c => !c.isActive).map(c => `• ~${c.title}~`).join('\n')}
`;
    await this.whatsAppMessagingService.sendInteractiveMessage({
      phone,
      language,
      message: msg,
      buttons,
      header: this.localizationService.getMessage('goSelectCategory', language),
      optionsTitle: this.localizationService.getMessage('goSelectCategory', language),
      footer: this.localizationService.getMessage('registrationStepCategoryOptionsFooter', language)
    });
  }

  async sendWhatsappFilterCarType(
    phone: string,
    categoryFilters: { key: string, value: string }[],
    categoryInactive: { key: string, value: string }[],
    flowJson: { header: string, body: string, cta: string, flow_token: string },
    language: string,
  ): Promise<void> {
    const msg = `${this.localizationService.getMessage('vehicleDefinedForAcceptingTrips', language)}
${categoryFilters.map(c => `• ${c.value}`).join('\n')}\n
${categoryInactive.length > 0 ? this.localizationService.getMessage('vehicleDefinedNotToAcceptTrips', language) : ''}
${categoryInactive.length > 0 ? categoryInactive.map(c => `• ~${c.value}~`).join('\n') : ''}
`;
    const flowName = language === 'en' ? 'driver_filters_words_en' : 'driver_filters_words_he';
    await this.whatsappFlowService.sendFlowMessage({
      to: phone,
      flowName,
      header: this.localizationService.getMessage('vehicleDefinedForAcceptingTripsButton', language),
      body: msg,
      cta: this.localizationService.getMessage('vehicleDefinedForAcceptingTripsButton', language),
      flow_token: flowJson.flow_token,
    });
  }

  async sendSecretMenu(driver: Driver, language: string): Promise<void> {
    const timePeriod = getTimePeriod(language);
    const msg = `${timePeriod}!\n🔵 ${driver.name} \n\n${this.localizationService.getMessage('secretMenuWelcome', language)}`;
    await this.driverMessagePrivateService.update(driver.phone, { isActive: true, message: 'initial', type: MessageType.ROUTER });
    await this.driverMessagePrivateService.updateMany(driver.phone, { isActive: true });
    await this.whatsAppMessagingService.sendInteractiveWithListButtons({
      phone: driver.phone,
      language,
      message: msg,
      sections: [
        {
          title: this.localizationService.getMessage('secretMenuOptionsButton', language),
          rows: [
            {
              id: 'secretMenuAutomaticDestination',
              title: this.localizationService.getMessage('secretMenuAutomaticDestination', language)
            },
            {
              id: 'secretMenuEditMessageToPrivate',
              title: this.localizationService.getMessage('secretMenuEditMessageToPrivate', language)
            },
            {
              id: 'secretMenuCancelAutomation',
              title: this.localizationService.getMessage('secretMenuCancelAutomation', language)
            }
          ]
        }
      ],
      optionsTitle: this.localizationService.getMessage('secretMenuOptionsButton', language)
    });
  }

  async sendSecretMenuAutomaticDestination(phone: string, language: string): Promise<void> {
    await this.sendTextMessage({
      phone,
      text: this.localizationService.getMessage('secretMenuAutomaticDestinationDescription', language)
    });
  }

  async sendSecretMenuEditMessageToPrivate(phone: string, language: string): Promise<void> {
    await this.driverMessagePrivateService.update(phone, { type: MessageType.CUSTOM, isActive: true, message: MessageType.CUSTOM });
    await this.sendTextMessage({
      phone,
      text: this.localizationService.getMessage('secretMenuEditMessageToPrivateDescription', language)
    });
  }

  async sendSecretMenuCancelAutomation(phone: string, language: string): Promise<void> {
    await this.driverMessagePrivateService.deleteMany(phone);
    await this.sendTextMessage({
      phone,
      text: this.localizationService.getMessage('secretMenuCancelAutomationDescription', language)
    });
  }

  async sendWhatsappPaymentRequest(driver: Driver | DriverDocument, language: string, isFreeTrial: boolean): Promise<void> {
    const driverForUpdate = await this.getDriverForUpdate(driver.phone);
    if (!driverForUpdate) return;
    
    if (isFreeTrial) {
      driverForUpdate.isActive = false;
      await driverForUpdate.save();
      await this.redisClient.set(`driver:${driver.phone}`, JSON.stringify(driverForUpdate));
    }

    let messageKey = '' as keyof LocalizedMessages;
    if (driver.paymentPackage === PaymentPackage.PREMIUM) {
      messageKey = 'driverPremiumFreeTrialEnded';
    } else {
      messageKey = 'driverRegularFreeTrialEnded';
    }
    if (!isFreeTrial) {
      messageKey = driver.paymentPackage === PaymentPackage.PREMIUM ? 'paymentExpiredMessage' : 'paymentExpiredMessageRegular';
    }
    const optionTitle = isFreeTrial ? this.localizationService.getMessage('goSelectPayment', language) : this.localizationService.getMessage('paymentExpiredButton', language);

    const msg = this.localizationService.getMessage(messageKey, language);
    await this.whatsAppMessagingService.sendInteractiveWithListButtons({
      phone: driver.phone,
      language,
      message: msg,
      optionsTitle: optionTitle,
      sections: [
        {
          title: optionTitle,
          rows: [
            {
              id: `driverPaymentCreditCard_${driver.paymentPackage}`,
              title: this.localizationService.getMessage('driverPaymentCreditCard', language),
              // description: this.localizationService.getMessage('driverPaymentCreditCardDescription', language)
            },
            {
              id: `driverPaymentBit_${driver.paymentPackage}`,
              title: this.localizationService.getMessage('driverPaymentBit', language),
              // description: this.localizationService.getMessage('driverPaymentBitDescription', language)
            },
            {
              id: `driverPaymentPayBox_${driver.paymentPackage}`,
              title: this.localizationService.getMessage('driverPaymentPayBox', language),
              // description: this.localizationService.getMessage('driverPaymentPayBoxDescription', language)
            },
            {
              id: `driverPaymentBankTransfer_${driver.paymentPackage}`,
              title: this.localizationService.getMessage('driverPaymentBankTransfer', language),
              // description: this.localizationService.getMessage('driverPaymentBankTransferDescription', language)
            }
          ]
        }
      ]
    });

    this.elasticsearchService.logMessage(driver.phone, msg, WbaMgmtService.name);
  }

  /**
 * destination: SG_HN
 * @param destination: SG_HN
 * @returns: Sai Gon_Ha Noi
 */
  private async getFullNameFromShortNameDestination(destination: string) {
    const parts = destination.split('_');
    const mapped: string[] = [];
    for (const part of parts) {
      mapped.push(await this.getFullNameFromShortName(part));
    }
    return mapped.join('_');
  }

  private async getFullNameFromShortName(shortName: string) {
    const lowerDestination = shortName.toLowerCase();
    try {
      const val = await this.redisClient.hget('wa:areas:shortcuts', lowerDestination);
      return val || shortName;
    } catch {
      return shortName;
    }
  }

  async sendSummarySearches(phone: string, language: string) {
    const historySearch = await this.driverSearchKeywordService.getDriverSearchHistory(phone);
    const summary = historySearch.map(search => search.keyword.split('_').join(` ${this.localizationService.getMessage('keyWordSearchTo', language)} `))
      .join('\n');
    await this.sendWhatsappSummarySearches(phone, summary);
  }

  async handlePrivateMessage(phone: string, text: string, searchKeywordPrefix: string, language: string) {
    const customMessage = await this.driverMessagePrivateModel.findOne({ phone, type: MessageType.CUSTOM, message: MessageType.CUSTOM }).exec();
    if (customMessage) {
      await this.driverMessagePrivateModel.updateOne({ phone, type: MessageType.CUSTOM }, { message: text, isActive: true }).exec();
      await this.whatsAppMessagingService.sendTextMessage({
        phone,
        text: this.localizationService.getMessage('secretMenuEditMessageToPrivateSuccess', language)
      });
      return;
    }
    const linesRaw = text.split('\n');
    const lines = await Promise.all(
      linesRaw.map(async line => this.specialRouterName.some(name => line === name) ? line.trim() :
        await getOriginAndDestination(line.replace(searchKeywordPrefix.trim(), '').trim(), this.redisClient))
    );
    let originAndDestination = '';
    for (const line of lines) {
      if (!line) {
        continue;
      }
      const cities = line.split('_');
      if (cities.length !== 2 && !this.specialRouterName.some(name => line === name)) {
        continue;
      }
      await this.driverMessagePrivateModel.findOneAndUpdate(
        { phone, message: line },
        { isActive: true, phone, message: line },
        { new: true, upsert: true }
      ).exec();
      originAndDestination += cities.length === 2 ? `${cities[0]} → ${cities[1]}\n` : `${line}\n`;
    }
    if (!originAndDestination) {
      return;
    }

    const msg = `${this.localizationService.getMessage('secretMenuAutomaticDestinationMessage', language)}`.replace('{originAndDestination}', originAndDestination);
    await this.whatsAppMessagingService.sendTextMessage({
      phone,
      text: msg,
    });
  }

  private async getDriverFromCache(phone: string): Promise<{ driver: DriverDocument | null; fromCache: boolean }> {
    try {
      // Try to get from Redis cache first
      const driverCache = await this.redisClient.get(`driver:${phone}`);
      if (driverCache) {
        const cachedDriver = JSON.parse(driverCache);
        return { driver: cachedDriver, fromCache: true };
      }

      // Fall back to database if not in cache
      const driver = await this.driverModel.findOne({ phone });
      if (driver) {
        // Cache the driver for future use
        await this.redisClient.set(`driver:${phone}`, JSON.stringify(driver), 'EX', 3600); // Cache for 1 hour
      }
      return { driver, fromCache: false };
    } catch (error) {
      this.logger.error(`Error getting driver from cache for ${phone}:`, error);
      // Fall back to database on error
      const driver = await this.driverModel.findOne({ phone });
      return { driver, fromCache: false };
    }
  }

  private async getDriverForUpdate(phone: string): Promise<DriverDocument | null> {
    const { driver, fromCache } = await this.getDriverFromCache(phone);
    if (!driver) return null;
    
    // If driver came from cache, we need to get the fresh model for updates
    if (fromCache) {
      return await this.driverModel.findOne({ phone });
    }
    return driver;
  }

  async handleMessage(phone: string, text: string, language: string) {
    const { driver, fromCache } = await this.getDriverFromCache(phone);
    if (!driver) {
      return;
    }

    if (!isInTrial(driver)) {
      await this.sendWhatsappPaymentRequest(driver, language, true);
      return;
    }

    if (isNeedToPay(driver)) {
      await this.sendWhatsappPaymentRequest(driver, language, false);
      return;
    }

    const searchKeywordBusy = `${this.localizationService.getMessage('driverSearchKeywordBusy', language)}`;
    if (text === searchKeywordBusy || text.toLowerCase() === searchKeywordBusy.toLowerCase()) {
      // If driver came from cache, we need to get the fresh model for saving
      let driverToUpdate = driver;
      if (fromCache) {
        driverToUpdate = await this.driverModel.findOne({ phone });
        if (!driverToUpdate) return;
      }
      
      driverToUpdate.isBusy = true;
      const updatedDriver = await driverToUpdate.save();
      await this.driverSearchKeywordService.removeAllSearchByPhone(phone);
      await this.sendWhatsappSearchEnded(phone, language);
      await this.driverMessagePrivateModel.deleteMany({ phone, type: MessageType.ROUTER }).exec();
      await this.redisClient.set(`driver:${phone}`, JSON.stringify(updatedDriver));
      const privateMessageKeys = await this.redisClient.keys(`privateMessage:${phone}:*`);
      const trackedMessageKeys = await this.redisClient.keys(`trackedMessage:${phone}:*`);
      const driverSearchHistoryKeys = await this.redisClient.keys(`driverSearchHistory:${phone}:*`);
      if (privateMessageKeys.length > 0) {
        await this.redisClient.del(...privateMessageKeys);
      }
      if (trackedMessageKeys.length > 0) {
        await this.redisClient.del(...trackedMessageKeys);
      }
      if (driverSearchHistoryKeys.length > 0) {
        await this.redisClient.del(...driverSearchHistoryKeys);
      }
      return;
    }

    const searchKeywordPrefix = `${this.localizationService.getMessage('driverSearchKeywordPrefix', language)}`;
    const searchKeywordLocation = `${searchKeywordPrefix}${this.localizationService.getMessage('keyWordSearchLocation', language)}`;
    if (text === searchKeywordLocation || text.toLowerCase() === searchKeywordLocation.toLowerCase()) {
      await this.whatsAppMessagingService.sendRequestLocationMessage(phone, language);
      return;
    }
    const privateMessage = await this.driverMessagePrivateModel.findOne({ phone, isActive: true, message: 'initial', type: MessageType.ROUTER });
    if (privateMessage) {
      if (driver.isBusy) {
        // If driver came from cache, we need to get the fresh model for saving
        let driverToUpdate = driver;
        if (fromCache) {
          driverToUpdate = await this.driverModel.findOne({ phone });
          if (!driverToUpdate) return;
        }
        
        driverToUpdate.isBusy = false;
        const updatedDriver = await driverToUpdate.save();
        await this.redisClient.set(`driver:${phone}`, JSON.stringify(updatedDriver));
      }
      await this.handlePrivateMessage(phone, text, searchKeywordPrefix, language);
      return;
    }
    let driverSearchKeyword = '';
    if (text.startsWith(searchKeywordPrefix) || text.startsWith(searchKeywordPrefix.toLowerCase())) {
      driverSearchKeyword = await getOriginAndDestination(text.replace(searchKeywordPrefix.trim(), '').trim(), this.redisClient);
    }
    this.logger.debug(`Driver search keyword: ${phone} -> ${driverSearchKeyword}`);

    if (!driverSearchKeyword) {
      return;
    }

    if (driver.isBusy) {
      // If driver came from cache, we need to get the fresh model for saving
      let driverToUpdate = driver;
      if (fromCache) {
        driverToUpdate = await this.driverModel.findOne({ phone });
        if (!driverToUpdate) return;
      }
      
      driverToUpdate.isBusy = false;
      const updatedDriver = await driverToUpdate.save();
      await this.redisClient.set(`driver:${phone}`, JSON.stringify(updatedDriver));
    }

    this.logger.log(`Searching for: ${driverSearchKeyword}, language: ${language}`);
    await this.driverSearchKeywordService.trackSearch(phone, driverSearchKeyword);
    // Refresh Redis cache after tracking search
    const updatedTrackSearchKeyword = await this.driverSearchKeywordService.getDriverSearchHistory(phone);
    await this.redisClient.set(`driverSearchHistory:${phone}`, JSON.stringify(updatedTrackSearchKeyword));

    const sameDriverSearchCount = await this.driverSearchKeywordService.getDriversSearchHistoryCount(driverSearchKeyword);
    const fullName = await this.getFullNameFromShortNameDestination(driverSearchKeyword);
    await this.sendWhatsappFindingRides(phone, fullName.split('_').join(`${this.localizationService.getMessage('keyWordSearchTo', language)}`), language, sameDriverSearchCount);

    return;
  }

  getFilterGroups(groups: GroupInfo[], groupIds: string[]): GroupInfo[] {
    const filterGroups = [] as GroupInfo[];
    for (const groupId of groupIds) {
      try {
        const group = groups.find(g => g.jid === groupId);
        if (group) {
          filterGroups.push(group);
        }
      } catch (err) {
        this.logger.warn(`Failed to get metadata for ${groupId}: ${err?.message || err}`);
      }
    }
    return filterGroups;
  } 

} 