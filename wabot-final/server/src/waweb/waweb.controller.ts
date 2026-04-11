import { Controller, Get, Post, Body, Param, Delete, Query } from '@nestjs/common';
import { WhatsappServiceMgn } from './whatsappMgn.service';

@Controller('waweb')
export class WawebController {
  constructor(private readonly whatsappServiceMgn: WhatsappServiceMgn) { }

  @Get('whatsapp-status')
  async getWhatsappStatus() {
    return await this.whatsappServiceMgn.getConnectionStatus();
  }

  @Post('whatsapp-status/:phone')
  async postWhatsappStatus(@Body('event') event: string, @Param('phone') phone: string) {
    return await this.whatsappServiceMgn.postConnectionStatus(event, phone);
  }

  @Post('send-pairing-code')
  async sendPairingCode(@Body('phone') phone: string) {
    if (!phone) {
      return { success: false, message: 'Phone is required' };
    }
    try {
      await this.whatsappServiceMgn.sendPairingCodeToPhone(phone);
      return { success: true };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  @Post('pairing-code')
  async getPairingCode(@Body('phone') phone: string) {
    if (!phone) {
      return { success: false, message: 'Phone is required' };
    }
    try {
      const code = await this.whatsappServiceMgn.getPairingCodeForUI(phone);
      if (!code) {
        return { success: false, message: 'Failed to get pairing code from bot' };
      }
      return { success: true, code };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  @Post('disconnect')
  async disconnect(@Body('phone') phone: string) {
    return { success: true };
  }

  @Post(':phone/private-message')
  async handlePrivateMessage(@Body() payload: any, @Param('phone') phone: string) {
    try {
      await this.whatsappServiceMgn.handlePrivateMessageFromDriver(phone, payload);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  @Post(':phone/message')
  async handleMessage(@Body() payload: any, @Param('phone') phone: string) {
    try {
      // Queue message for processing to handle high volume
      this.whatsappServiceMgn.queueMessageForProcessing(phone, payload);
      
      // Return immediately without waiting for processing
      return { success: true, message: 'Message queued for processing' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  @Post('group')
  async handleGroup(@Body() payload: any) {
    try {
      this.whatsappServiceMgn.handleGroup(payload);
      return { success: true, message: 'Group processed successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  @Post('group-created')
  async handleGroupCreated(@Body() payload: any) {
    try {
      this.whatsappServiceMgn.handleGroupCreated(payload);
      return { success: true, message: 'Group created successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /** Proxy to Go bot — returns WhatsApp profile picture URL for a phone number */
  @Get('profile-picture')
  async getProfilePicture(@Query('phone') phone: string) {
    if (!phone) return { url: '' };
    try {
      const url = await this.whatsappServiceMgn.getProfilePictureUrl(phone);
      return { url };
    } catch {
      return { url: '' };
    }
  }

} 