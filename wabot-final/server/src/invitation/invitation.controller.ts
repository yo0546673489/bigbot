import { Controller, Post, Body, Logger, Get, Param, Put, Delete, Query, Patch } from '@nestjs/common';
import { WbaMgmtService } from '../wabmgmt/wab.service';
import { getLanguageByPhoneNumber } from 'src/common/utils';
import { InvitationService } from './invitation.service';
import { InvitationStatus } from './schemas/invitation.schema';
import { LocalizationService } from 'src/common/localization/localization.service';
import { WhatsAppMessagingService } from 'src/services/whatsapp-messaging.service';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Res } from '@nestjs/common';
import { Response } from 'express';
import * as XLSX from 'xlsx';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('invitations')
@UseGuards(JwtAuthGuard)
@Controller('invitations')
export class InvitationController implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InvitationController.name);
  private inviteQueue: Queue;
  private worker: Worker;

  constructor(
    private readonly wabService: WbaMgmtService,
    private readonly configService: ConfigService,
    private readonly invitationService: InvitationService,
    private readonly localizationService: LocalizationService,
    private readonly whatsAppMessagingService: WhatsAppMessagingService,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
  ) {
    this.inviteQueue = new Queue('inviteQueue', { connection: this.redisClient });
  }

  onModuleInit() {
    this.logger.log('InvitationController onModuleInit');
    // setTimeout(async () => {
    //   const videoPath = path.resolve('./public/video1.mp4');
    //   const buffer = await fs.readFile(videoPath);
    //   this.whatsappService.sendPrivateVideoMessage('84975868449', '84347914184', buffer);
    // }, 5 * 1000);

    this.worker = new Worker('inviteQueue', async job => {
      const { senderPhone, recipientPhone, message, language } = job.data;
      try {
        if (job.name === 'sendInitialMessage') {
          // await this.whatsappService.sendPrivateMessage(senderPhone, recipientPhone, message);
          await this.whatsAppMessagingService.sendTemplateMessage({
            phone: recipientPhone,
            templateName: 'q',
            language: 'en',
            phoneNumberId: this.configService.get('WHATSAPP_PHONE_NUMBER_ID_INVITATION')
          });
        }

        if (job.name === 'sendFollowupMessage') {
          // this.logger.log(`Sending followup message to ${recipientPhone}`);
          // const localizedMsg = this.localizationService.getMessage('inviteMessage', language);
          // await this.whatsappService.sendPrivateMessage(senderPhone, recipientPhone, localizedMsg);
          // const videoPath = path.resolve('./public/video1.mp4');
          // const buffer = await fs.readFile(videoPath);
          // await this.whatsappService.sendPrivateVideoMessage(senderPhone, recipientPhone, buffer);
          // await this.whatsappService.sendPrivateMessage(senderPhone, recipientPhone, 'https://wa.me/972535922334?text=רישום');
          await this.whatsAppMessagingService.sendTemplateMessage({
            phone: recipientPhone,
            templateName: 'qq',
            language: 'en',
            phoneNumberId: this.configService.get('WHATSAPP_PHONE_NUMBER_ID_INVITATION'),
            components: [{
              type: "header",
              parameters: [{
                type: "video",
                video: {
                  link: 'https://bot.pro-digital.org/media/video2.mp4'
                }
              }]
            }]
          });
          await this.invitationService.updateDriverInvite(recipientPhone, { status: InvitationStatus.INVITED });
        }
      } catch (err) {
        this.logger.error(`❌ Job ${job.id} failed:`, err);
        throw err; // to allow retries
      }
    },
      { connection: this.redisClient.duplicate() }
    );

    this.worker.on('completed', job => {
      this.logger.log(`✅ Job ${job.id} (${job.name}) completed for ${job.data.recipientPhone}`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`❌ Job ${job?.id} (${job?.name}) failed: ${err?.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker.close();
    await this.inviteQueue.close();
  }

  async processNumber(payload: { phones: string[] }, senderPhone: string, language: string) {
    for (const phone of payload.phones) {
      await this.inviteQueue.add(
        'sendInitialMessage',
        {
          senderPhone,
          recipientPhone: phone,
          message: 'מה קורה',
          language,
        },
        {
          removeOnComplete: true,
          removeOnFail: true,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
      await this.inviteQueue.add(
        'sendFollowupMessage',
        {
          // Delay 1 second
          delay: 1000,
          senderPhone,
          recipientPhone: phone,
          language,
        },
        {
          removeOnComplete: true,
          removeOnFail: true,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
    }
  }

  @Post()
  async createInvitation(@Body() payload: { phones: string[] }) {
    const senderPhone = this.configService.get('INVITATION_PHONE');
    const language = getLanguageByPhoneNumber(senderPhone);
    await this.invitationService.createInvitations(payload.phones);
    this.processNumber(payload, senderPhone, language);
    return { ok: true }
  }

  @Get()
  async getInvitations(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('status') status?: InvitationStatus,
    @Query('sortBy') sortBy: string = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    return this.invitationService.getInvitations({
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      status,
      sortBy,
      sortOrder,
    });
  }

  @Get(':phone/invite')
  async sendMessage(@Param('phone') phone: string) {
    const invitation = await this.invitationService.updateDriverInvite(phone, { status: InvitationStatus.INVITED });
    return invitation;
  }

  @Delete(':phone')
  async deleteInvitation(@Param('phone') phone: string) {
    return this.invitationService.deleteInvitation(phone);
  }

  @Get('export/all')
  async exportAllInvitations(@Res() res: Response) {
    try {
      const invitations = await this.invitationService.findAll();

      const rows = [['Phone', 'Status', 'Created At', 'Updated At']];
      for (const inv of invitations) {
        const createdAt = inv['createdAt'] ? new Date(inv['createdAt']).toISOString() : '';
        const updatedAt = inv['updatedAt'] ? new Date(inv['updatedAt']).toISOString() : '';
        rows.push([inv['phone'] || '', inv['status'] || '', createdAt, updatedAt]);
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 20 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Invitations');
      const formattedDate = new Date().toISOString().split('T')[0];
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', compression: true });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="invitations_${formattedDate}.xlsx"`);
      return res.send(excelBuffer);
    } catch (error) {
      this.logger.error('Failed to export invitations', error);
      return res.status(500).json({ message: 'Failed to export invitations', error: error?.message });
    }
  }

  @Get('export/csv')
  async exportAllInvitationsCsv(@Res() res: Response) {
    try {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="invitations_${new Date().toISOString().split('T')[0]}.csv"`);
      // Write header
      res.write('\uFEFF'); // BOM for Excel UTF-8
      res.write('Phone,Status,Created At,Updated At\n');

      const cursor = this.invitationService.streamAll({ batchSize: 2000 });
      for await (const invRaw of cursor) {
        const inv: any = invRaw as any;
        const createdAt = inv?.createdAt ? new Date(inv.createdAt).toISOString() : '';
        const updatedAt = inv?.updatedAt ? new Date(inv.updatedAt).toISOString() : '';
        const line = `${inv?.phone || ''},${inv?.status || ''},${createdAt},${updatedAt}\n`;
        if (!res.write(line)) {
          await new Promise<void>(resolve => res.once('drain', () => resolve()));
        }
      }
      return res.end();
    } catch (error) {
      this.logger.error('Failed to export invitations CSV', error);
      try { res.end(); } catch { }
    }
  }
} 