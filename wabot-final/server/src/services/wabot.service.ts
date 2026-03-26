import { v4 as uuidv4 } from 'uuid';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { LocalizedMessages } from '../common/localization/messages';
import { LocalizationService } from '../common/localization/localization.service';
import { GroupInfo } from 'src/common/types';

export interface WabotConfig {
  wabotUrl?: string;
}

@Injectable()
export class WabotService {
  private readonly logger = new Logger(WabotService.name);
  private readonly api: AxiosInstance;
  private readonly config: WabotConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly localizationService: LocalizationService,
  ) {
    this.config = {
      wabotUrl: this.configService.get<string>('WABOT_URL'),
    };

    this.api = axios.create({
      baseURL: this.config.wabotUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async getStatus(): Promise<{ phone: string; isHealthy: boolean; }[]> {
    const response = await this.api.get<{ phone: string; isHealthy: boolean; }[]>(`/status`);
    return response.data;
  }

  async getPairingCode(phone: string): Promise<string> {
    // If phone starts with '0', replace it with '972'
    let formattedPhone = phone;
    if (phone.startsWith('0')) {
      formattedPhone = '972' + phone.slice(1);
    }
    const response = await this.api.post<{ code: string }>(`/pair`, { phone: formattedPhone });
    this.logger.log(`getPairingCode response`, { phone, formattedPhone, data: response.data });
    return response.data?.code || '';
  }

  async getGroups(phone: string): Promise<GroupInfo[]> {
    const response = await this.api.get<GroupInfo[]>(`/groups?phone=${phone}`);
    return response.data;
  }

  async replyToGroup(phone: string, groupId: string, messageId: string, text: string) {
    const response = await this.api.post<{ success: boolean }>(`/reply-to-group`, { phone, groupId, messageId, text });
    return response.data;
  }

  async replyPrivateFromGroup(phone: string, phoneNumber: string, groupId: string, messageId: string, text: string) {
    const response = await this.api.post<{ success: boolean }>(`/reply-private-from-group`, { phone, phoneNumber, groupId, messageId, text });
    return response.data;
  }

  async sendPrivateMessage(phone: string, phoneNumber: string, message: string) {
    const response = await this.api.post<{ success: boolean }>(`/send-private-message`, { phone, phoneNumber, message });
    return response.data;
  }

  async sendMessageToGroup(phone: string, groupId: string, message: string) {
    try {
      let formattedPhone = phone;
      if (phone.startsWith('0')) {
        formattedPhone = '972' + phone.slice(1);
      }
      const response = await this.api.post<{ success: boolean }>(`/send-message-to-group`, { phone: formattedPhone, groupId, message });
      return response.data;
    } catch (error: any) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      this.logger.error(`sendMessageToGroup failed`, { phone, groupId, status, data });
      throw error;
    }
  }

} 