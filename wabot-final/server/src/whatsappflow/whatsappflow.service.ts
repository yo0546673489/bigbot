import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import * as FormData from 'form-data';
import * as DRIVER_FILTERS_WORDS_EN from '../../wa-flows/driver_filters_words_en.json';
import * as DRIVER_FILTERS_WORDS_HE from '../../wa-flows/driver_filters_words_he.json';


@Injectable()
export class WhatsappFlowService {
  private readonly logger = new Logger(WhatsappFlowService.name);
  private readonly api: AxiosInstance;
  private readonly accessToken: string;
  private readonly wabaId: string;
  private readonly phoneNumberId: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.accessToken = this.configService.get<string>('WHATSAPP_TOKEN');
    this.wabaId = this.configService.get<string>('WHATSAPP_BUSINESS_ID');
    this.phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    this.baseUrl = 'https://graph.facebook.com/v22.0';
    this.api = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async init() {
    const flows = await this.getFlows();
    const files = await this.readFilesNames();
    for (const file of files) {
      const existFlow = flows.find(flow => flow.name === file.name);
      if (existFlow) {
        await this.uploadFlowJson(existFlow.id, file.data.data);
        await this.publishFlow(existFlow.id);
        this.logger.log(`Updated flow ${file.name} with id ${existFlow.id}`);
        continue;
      }
      const flow = await this.createFlow(file.name, ['OTHER'], file.data.data, true);
      this.logger.log(`Created flow ${file.name} with id ${flow.id}`);
    }
    // await this.sendFlowMessageFilterCars('84975868449', 'he');
  }

  async readFilesNames() {
  const folderPath = path.join(process.cwd(), 'wa-flows');
  try {
    const files = await fs.readdir(folderPath);
    const results: { name: string; filename: string; data: any }[] = [];

    for (const file of files) {
      const fullPath = path.join(folderPath, file);
      const stat = await fs.stat(fullPath);
      if (stat.isFile() && file.endsWith('.json')) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const jsonData = JSON.parse(content);
          results.push({
            name: path.basename(file, '.json'),
            filename: file,
            data: jsonData,
          });
        } catch (err) {
          console.warn(`Failed to parse ${file}:`, err.message);
        }
      }
    }

    return results;
  } catch (error) {
    console.error('Error reading folder:', error);
    return [];
  }
}

  /**
   * Create a new WhatsApp Flow
   */
  async createFlow(name: string, categories: string[], flowJson: object, publish = false) {
    try {
      const res = await this.api.post(`/${this.wabaId}/flows`, {
        name,
        categories,
        flow_json: JSON.stringify(flowJson),
        publish,
      });
      return res.data;
    } catch (error) {
      this.logger.error('Error creating flow', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Upload Flow JSON asset to an existing Flow
   */
  async uploadFlowJson(flowId: string, flowJson: object) {
    try {
      const formData = new FormData();
      formData.append('file', Buffer.from(JSON.stringify(flowJson)), {
        filename: 'flow.json',
        contentType: 'application/json',
      });
      formData.append('name', 'flow.json');
      formData.append('asset_type', 'FLOW_JSON');
      const res = await axios.post(
        `${this.baseUrl}/${flowId}/assets`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            ...formData.getHeaders(),
          },
        }
      );
      return res.data;
    } catch (error) {
      // this.logger.error('Error uploading flow JSON', error.response?.data || error.message);
    }
  }

  /**
   * Send a Flow message to a user
   */
  async sendFlowMessageFilterCars(phone: string, language: string) {
    const flowName = language === 'en' ? 'driver_filters_words_en' : 'driver_filters_words_he';
    const flowFile = path.join(process.cwd(), 'wa-flows', flowName + '.json');
    const flowJson = JSON.parse(await fs.readFile(flowFile, 'utf-8'));
    await this.sendFlowMessage({
      to: phone,
      flowName,
      header: flowJson.header,
      body: flowJson.body,
      cta: flowJson.cta,
      flow_token: flowJson.flow_token,
    });
  }

  /**
   * Send a Flow message to a user
   */
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

      const res = await this.api.post(`/${this.phoneNumberId}/messages`, payload);
      return res.data;
    } catch (error) {
      this.logger.error('Error sending flow message', error.response?.data || error.message);
      throw error;
    }
  }

  async publishFlow(flowId: string) {
    const res = await this.api.post(`/${flowId}/publish`);
    return res.data;
  }

  async getFlows() {
    const res = await this.api.get(`/${this.wabaId}/flows`);
    return res.data.data;
  }

  /**
   * 
   * @param flowId curl '{BASE-URL}/{FLOW-ID}?fields=id,name,categories,preview,status,validation_errors,json_version,data_api_version,endpoint_uri,whatsapp_business_account,application,health_status' \
--header 'Authorization: Bearer {ACCESS-TOKEN}'
   * @returns 
   */
  async getFlow(flowId: string) {
    const res = await this.api.get(`/${flowId}?fields=id,name,categories,preview,status,validation_errors,json_version,data_api_version,endpoint_uri,whatsapp_business_account,application,health_status`);
    return res.data;
  }

  async deleteFlow(flowId: string) {
    const res = await this.api.delete(`/${flowId}`);
    return res.data;
  }

} 