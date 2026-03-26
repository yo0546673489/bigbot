import { v4 as uuidv4 } from 'uuid';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { LocalizedMessages } from '../common/localization/messages';
import { LocalizationService } from '../common/localization/localization.service';
import {
  WHATSAPP_MESSAGE_TYPES,
  INTERACTIVE_TYPES,
  WHATSAPP_API,
} from '../common/constants';
import { formatMessage } from '../common/utils';

export interface WhatsAppConfig {
  whatsappToken: string;
  whatsappBusinessId: string;
  whatsappPhoneNumberId: string;
  whatsappPhoneNumberIdInvitation: string;
  whatsappVerifyToken: string;
}

@Injectable()
export class WhatsAppMessagingService {
  private readonly logger = new Logger(WhatsAppMessagingService.name);
  private readonly api: AxiosInstance;
  private readonly config: WhatsAppConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly localizationService: LocalizationService,
  ) {
    this.config = {
      whatsappToken: this.configService.get<string>('WHATSAPP_TOKEN'),
      whatsappBusinessId: this.configService.get<string>('WHATSAPP_BUSINESS_ID'),
      whatsappPhoneNumberId: this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID'),
      whatsappPhoneNumberIdInvitation: this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID_INVITATION'),
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

  private validateConfig() {
    const missingConfigs = Object.entries(this.config)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missingConfigs.length > 0) {
      this.logger.warn(
        `WhatsApp Business API not configured: ${missingConfigs.join(', ')}. Business API features will be unavailable. Using Go bot (whatsmeow) for messaging.`
      );
    }
  }

  async sendTextMessage({ phone, text }: { phone: string, text: string }): Promise<void> {
    try {
      const response = await this.api.post(
        `/${this.config.whatsappPhoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'text',
          text: {
            body: formatMessage(text),
          },
        },
      );
    } catch (error) {
      this.logger.error('Failed to send text message:', error);
      throw error;
    }
  }

  async sendInteractiveMessage({
    phone,
    language,
    messageKey,
    buttons,
    header,
    optionsTitle,
    footer,
    message,
  }: {
    phone: string;
    language: string;
    messageKey?: keyof LocalizedMessages;
    buttons?: { id: string; title: string; description?: string }[];
    header?: string;
    optionsTitle?: string;
    footer?: string;
    message?: string;
  }) {
    try {
      const msg = this.localizationService.getMessage(messageKey, language) || message;
      if (!msg) {
        throw new Error(`No message found`);
      }

      // Format buttons according to WhatsApp API requirements
      const formattedButtons =
        buttons?.map((button) => ({
          type: 'reply',
          reply: {
            id: button.id,
            title:
              button.title.length > WHATSAPP_API.MAX_BUTTON_TITLE_LENGTH
                ? button.title.substring(0, WHATSAPP_API.MAX_BUTTON_TITLE_LENGTH)
                : button.title,
            description: button?.description,
          },
        })) || [];

      // Ensure we have at least 1 button
      if (formattedButtons.length === 0) {
        throw new Error('Interactive message must have at least 1 button');
      }

      const payload = {
        messaging_product: 'whatsapp',
        to: phone,
        type: WHATSAPP_MESSAGE_TYPES.INTERACTIVE,
        interactive: {
          type:
            formattedButtons.length > 3
              ? INTERACTIVE_TYPES.LIST
              : INTERACTIVE_TYPES.BUTTON,
          header: header
            ? {
              type: WHATSAPP_MESSAGE_TYPES.TEXT,
              text: header,
            }
            : undefined,
          body: {
            text: formatMessage(msg),
          },
          action:
            formattedButtons.length > 3 ? {
              button: optionsTitle || '???',
              sections: [
                {
                  title: 'Options',
                  rows: formattedButtons.map((button) => ({
                    id: button.reply.id,
                    title: button.reply.title,
                    description: button.reply?.description,
                  })),
                },
              ],
            } : {
              buttons: formattedButtons,
            },
          footer: footer ? {
            text: footer,
          } : undefined,
        },
      };
      const response = await this.api.post(
        `/${this.config.whatsappPhoneNumberId}/messages`,
        payload
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to send interactive message to ${phone}: ${error.message}`
      );
      if (error.response?.data) {
        this.logger.error(
          'WhatsApp API error details:',
          JSON.stringify(error.response.data, null, 2)
        );
      }
      return;
    }
  }

  async sendInteractiveWithListButtons({
    phone,
    language,
    messageKey,
    sections,
    header,
    optionsTitle,
    footer,
    message,
  }: {
    phone: string;
    language: string;
    messageKey?: keyof LocalizedMessages;
    sections: { title: string; rows: { id: string; title: string; description?: string }[] }[];
    header?: string;
    optionsTitle?: string;
    footer?: string;
    message?: string;
  }) {
    try {
      const msg = this.localizationService.getMessage(messageKey, language) || message;
      if (!msg) {
        throw new Error(`No message found`);
      }
      const formattedSections = sections.map(section => ({
        title: section.title,
        rows: section.rows.map(row => ({
          id: row.id,
          title: row.title.length > WHATSAPP_API.MAX_SECTION_ROW_TITLE_LENGTH
            ? row.title.substring(0, WHATSAPP_API.MAX_SECTION_ROW_TITLE_LENGTH)
            : row.title,
          description: row.description,
        })),
      }));

      const payload = {
        messaging_product: 'whatsapp',
        to: phone,
        type: WHATSAPP_MESSAGE_TYPES.INTERACTIVE,
        interactive: {
          type: INTERACTIVE_TYPES.LIST,
          header: header ? {
            type: WHATSAPP_MESSAGE_TYPES.TEXT,
            text: header,
          } : undefined,
          body: {
            text: formatMessage(msg),
          },
          action:
          {
            button: optionsTitle || '???',
            sections: formattedSections,
          },
          footer: footer ? {
            text: footer,
          } : undefined,
        },
      };

      const response = await this.api.post(
        `/${this.config.whatsappPhoneNumberId}/messages`,
        payload
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to send interactive with list buttons message to ${phone}: ${error.message}`
      );
      if (error.response?.data) {
        this.logger.error(
          'WhatsApp API error details:',
          JSON.stringify(error.response.data, null, 2)
        );
      }
      return;
    }
  }

  async sendTemplateMessage({
    phone,
    templateName,
    language = 'en_US',
    components = [],
    phoneNumberId = this.config.whatsappPhoneNumberId
  }: {
    phone: string;
    templateName: string;
    language?: string;
    components?: Array<{
      type: string;
      sub_type?: string;
      index?: string;
      parameters?: Array<{
        type: string;
        text?: string;
        image?: { link: string };
        video?: { link: string };
      }>;
    }>;
    phoneNumberId?: string;
  }): Promise<void> {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: language
          },
          components: components
        }
      };

      const response = await this.api.post(
        `/${phoneNumberId}/messages`,
        payload
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to send template message to ${phone}: ${error.message}`
      );
      if (error.response?.data) {
        this.logger.error(
          'WhatsApp API error details:',
          JSON.stringify(error.response.data, null, 2)
        );
      }
    }
  }

  async sendRequestLocationMessage(phone: string, language: string): Promise<void> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      type: 'interactive',
      to: phone,
      interactive: {
        type: 'location_request_message',
        body: {
          text: this.localizationService.getMessage('tapToSendLocationMessage', language)
        },
        action: {
          name: 'send_location'
        }
      }
    };

    const response = await this.api.post(
      `/${this.config.whatsappPhoneNumberId}/messages`,
      payload
    );

    return response.data;
  }

  async sendInteractiveMessageWithVideoHeader({
    phone,
    headerVideo,
    bodyText,
    buttons,
  }: {
    phone: string;
    headerVideo?: string;
    bodyText?: string;
    buttons?: { id: string; title: string }[];
  }): Promise<void> {
    try {

      const formattedButtons =
        buttons?.map((button) => ({
          type: 'reply',
          reply: {
            id: button.id,
            title:
              button.title.length > WHATSAPP_API.MAX_BUTTON_TITLE_LENGTH
                ? button.title.substring(0, WHATSAPP_API.MAX_BUTTON_TITLE_LENGTH)
                : button.title,
          },
        })) || [];

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'interactive',
        interactive: {
          type: INTERACTIVE_TYPES.BUTTON,
          header: headerVideo ? {
            type: 'video',
            video: {
              link: headerVideo,
            }
          } : undefined,
          body: bodyText ? {
            text: bodyText
          } : undefined,
          action: {
            buttons: formattedButtons,
          }
        }
      };

      console.log(JSON.stringify(payload, null, 2));


      const response = await this.api.post(
        `/${this.config.whatsappPhoneNumberId}/messages`,
        payload
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to send flow message:', error);
      throw error;
    }
  }

  async sendVideoMessage({
    phone,
    videoLink,
    caption,
  }: {
    phone: string;
    videoLink: string;
    caption: string;
  }): Promise<void> {
    try {

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'video',
        video: {
          link: videoLink,
          caption: caption
        }
      };

      const response = await this.api.post(
        `/${this.config.whatsappPhoneNumberId}/messages`,
        payload
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to send flow message:', error);
      throw error;
    }
  }


  async sendInteractiveMessageWithImageHeader({
    phone,
    headerImage,
    bodyText,
    buttons,
  }: {
    phone: string;
    headerImage?: string;
    bodyText?: string;
    buttons?: { id: string; title: string }[];
  }): Promise<void> {
    try {

      const formattedButtons =
        buttons?.map((button) => ({
          type: 'reply',
          reply: {
            id: button.id,
            title:
              button.title.length > WHATSAPP_API.MAX_BUTTON_TITLE_LENGTH
                ? button.title.substring(0, WHATSAPP_API.MAX_BUTTON_TITLE_LENGTH)
                : button.title,
          },
        })) || [];

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'interactive',
        interactive: {
          type: INTERACTIVE_TYPES.BUTTON,
          header: headerImage ? {
            type: 'image',
            image: {
              id: headerImage,
            }
          } : undefined,
          body: bodyText ? {
            text: bodyText
          } : undefined,
          action: {
            buttons: formattedButtons,
          }
        }
      };

      const response = await this.api.post(
        `/${this.config.whatsappPhoneNumberId}/messages`,
        payload
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to send flow message:', error);
      throw error;
    }
  }

  // async sendFlowMessage({
  //   phone,
  //   language,
  //   flowName,
  //   flowCta = 'Start',
  //   flowAction = 'navigate',
  //   headerVideo,
  //   bodyText,
  // }: {
  //   phone: string;
  //   language: string;
  //   flowName: string;
  //   flowCta?: string;
  //   flowAction?: string;
  //   headerVideo?: string;
  //   bodyText?: string;
  // }): Promise<void> {
  //   try {
  //     const payload = {
  //       messaging_product: 'whatsapp',
  //       recipient_type: 'individual',
  //       to: phone,
  //       type: 'interactive',
  //       interactive: {
  //         type: 'flow',
  //         header: headerVideo ? {
  //           type: 'video',
  //           video: {
  //             link: headerVideo,
  //           }
  //         } : undefined,
  //         body: bodyText ? {
  //           text: bodyText
  //         } : undefined,
  //         action: {
  //           name: 'flow',
  //           parameters: {
  //             "flow_message_version": "3",
  //             "flow_name": flowName,
  //             "flow_cta": flowCta,
  //             "flow_action": flowAction,
  //             "flow_token": uuidv4(),
  //           }
  //         }
  //       }
  //     };

  //     const response = await this.api.post(
  //       `/${this.config.whatsappPhoneNumberId}/messages`,
  //       payload
  //     );

  //     this.logger.log(`Flow message sent to ${phone}: ${flowName}`);
  //     return response.data;
  //   } catch (error) {
  //     this.logger.error('Failed to send flow message:', error);
  //     throw error;
  //   }
  // }

  async interactiveCallToAction({
    phone,
    headerImage,
    headerText,
    bodyText,
    buttonUrl,
    buttonText = 'Continue',
  }: {
    phone: string;
    headerImage?: string;
    headerText?: string;
    bodyText?: string;
    buttonUrl?: string;
    buttonText?: string;
  }): Promise<void> {
    try {

      const header = headerImage ? {
        type: 'image',
        image: {
          link: headerImage,
        }
      } : headerText ? {
        type: 'text',
        text: headerText,
      } : undefined;

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          header: header,
          body: {
            text: bodyText,
          },
          action: {
            name: 'cta_url',
            parameters: {
              display_text: buttonText,
              url: buttonUrl,
            }
          }
        }
      }

      const response = await this.api.post(
        `/${this.config.whatsappPhoneNumberId}/messages`,
        payload
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to send interactive call to action message:', error);
    }
  }

  async sendFlowMessage({
    to, flowName, screenId, header, body, footer, cta, flow_token, dynamicData,
  }: {
    to: string,
    flowName: string,
    screenId?: string,
    header: string,
    body: string,
    footer?: string,
    cta: string,
    flow_token: string,
    dynamicData?: Record<string, any>
  }) {
    if (!body || !cta || !flow_token || !to || !flowName) {
      this.logger.error('Missing required parameters for sendFlowMessage', {
        body,
        cta,
        flow_token,
        to,
        flowName,
      });
      return;
    }
    
    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
          type: 'flow',
          header: { type: 'text', text: header },
          body: { text: body },
          footer: { text: footer },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_name: flowName,
              flow_cta: cta,
              flow_action: 'navigate',
              flow_token: flow_token,
            },
          },
        },
      } as any;

      if (screenId) {
        payload.interactive.action.parameters.flow_action_payload = {
          screen: screenId,
          ...(dynamicData && { data: dynamicData })
        };
      }

      const res = await this.api.post(`/${this.config.whatsappPhoneNumberId}/messages`, payload);
      return res.data;
    } catch (error) {
      this.logger.error('Error sending flow message', error.response?.data || error.message);
      throw error;
    }
  }

  getConfig(): WhatsAppConfig {
    return this.config;
  }

  getApi(): AxiosInstance {
    return this.api;
  }
} 