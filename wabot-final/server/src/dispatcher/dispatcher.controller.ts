import { Controller, Post, Body } from '@nestjs/common';
import { DispatcherService } from './dispatcher.service';

@Controller('dispatcher')
export class DispatcherController {
  constructor(private readonly dispatcherService: DispatcherService) {}

  /**
   * POST /dispatcher/register
   * Body: { phone: string, message: string, language?: string }
   */
  @Post('register')
  async registerDispatcher(@Body() body: { phone: string; message: string; language?: string }) {
    const { phone, message, language = 'he' } = body;
    // return this.dispatcherService.handleMessage(phone, message, language);
    return 1;
  }
}

