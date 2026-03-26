import { Module } from '@nestjs/common';
import { WhatsappFlowService } from './whatsappflow.service';
import { WhatsappFlowController } from './whatsappflow.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  controllers: [WhatsappFlowController],
  providers: [WhatsappFlowService],
  exports: [WhatsappFlowService],
  imports: [ConfigModule],
})
export class WhatsappFlowModule {} 