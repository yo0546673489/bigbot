import { WhatsappFlowService } from './whatsappflow.service';
import { Controller, Body, Post } from '@nestjs/common';

@Controller('whatsapp-flow')
export class WhatsappFlowController {
  constructor(private readonly whatsappFlowService: WhatsappFlowService) {}

  @Post('create')
  async createFlow(@Body() body: { name: string; categories: string[]; flowJson: any; publish?: boolean }) {
    return this.whatsappFlowService.createFlow(body.name, body.categories, body.flowJson, body.publish);
  }

  @Post('publish')
  async publishFlow(@Body() body: { flowId: string }) {
    // return this.whatsappFlowService.publishFlow(body.flowId);
  }

} 