import { Controller, Get, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Roles('admin')
  @Get('test-resumen')
  async testResumen(): Promise<{ ok: boolean; error?: string; stack?: string }> {
    try {
      await this.telegramService.sendResumenDiario();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message, stack: error.stack };
    }
  }

  @Roles('admin')
  @Get('test-semanal')
  async testSemanal(): Promise<{ ok: boolean; error?: string; stack?: string }> {
    try {
      await this.telegramService.sendResumenSemanal();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message, stack: error.stack };
    }
  }

  @Public()
  @Post('webhook')
  async webhook(
    @Body() body: any,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string,
  ): Promise<void> {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expectedSecret || secretToken !== expectedSecret) {
      throw new UnauthorizedException('Token de webhook inválido');
    }
    await this.telegramService.handleWebhook(body);
  }
}
