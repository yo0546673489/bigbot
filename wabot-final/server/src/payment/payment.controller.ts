import { Controller, Post, Body, Logger, Get, Param, Put, Delete, Query, Patch } from '@nestjs/common';
import { WbaMgmtService } from '../wabmgmt/wab.service';
import { getLanguageByPhoneNumber } from 'src/common/utils';
import { PaymentService } from './payment.service';
import { PaymentStatus } from './schemas/payment.schema';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { Public } from 'src/auth/public.decorator';

@Controller('payment')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly wabService: WbaMgmtService,
    private readonly paymentService: PaymentService,
  ) {}

  @Public()
  @Post('webhook/credit')
  async handleCreditCardWebhook(@Body() payload: any) {
    const jsonParamsBase64 = payload.jsonParamsBase64;
    const jsonParams = JSON.parse(Buffer.from(jsonParamsBase64, 'base64').toString('utf-8'));
    this.logger.log(JSON.stringify(jsonParams, null, 2));
    
    // Save payment information
    const { payment , driver } = await this.paymentService.create(jsonParams);
    if (payment.status === PaymentStatus.PAID) {
      const language = getLanguageByPhoneNumber(driver.phone);
      await this.wabService.sendWhatsappPaymentSuccess(driver.phone, language);
    }
    return { received: true };
  }

  @Get('subscription/:ownerId/:phone')
  async getActiveSubscription(
    @Param('ownerId') ownerId: string,
    @Param('phone') phone: string,
  ) {
    return this.paymentService.getActiveSubscription(ownerId, phone);
  }

  @Get('history/:ownerId/:phone')
  async getPaymentHistory(
    @Param('ownerId') ownerId: string,
    @Param('phone') phone: string,
  ) {
    return this.paymentService.getPaymentHistory(ownerId, phone);
  }

  @Post('subscription/:ownerId/:phone/cancel')
  async cancelRecurringPayment(
    @Param('ownerId') ownerId: string,
    @Param('phone') phone: string,
  ) {
    return this.paymentService.cancelRecurringPayment(ownerId, phone);
  }

  @Get()
  async getPayments(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('method') method?: string,
    @Query('isRecurring') isRecurring?: string,
    @Query('sortBy') sortBy: string = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    return this.paymentService.getPayments({
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      status,
      method,
      isRecurring,
      sortBy,
      sortOrder,
    });
  }

  @Get(':id')
  async getPayment(@Param('id') id: string) {
    return this.paymentService.getPaymentById(id);
  }

  @Patch(':id')
  async updatePayment(
    @Param('id') id: string,
    @Body() updateData: any,
  ) {
    const { payment, driver } = await this.paymentService.updatePayment(id, updateData);
    if (updateData.status === PaymentStatus.PAID) {
      const language = getLanguageByPhoneNumber(driver.phone);
      await this.wabService.sendWhatsappPaymentSuccess(driver.phone, language);
    }
    return payment;
  }

  @Delete(':id')
  async deletePayment(@Param('id') id: string) {
    return this.paymentService.deletePayment(id);
  }
} 