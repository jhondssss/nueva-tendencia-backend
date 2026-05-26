import { Controller, Get, Post, Body } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Public()
  @Get('test-resumen')
  async testResumen(): Promise<{ ok: boolean; error?: string; stack?: string }> {
    try {
      await this.telegramService.sendResumenDiario();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message, stack: error.stack };
    }
  }

  @Public()
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
  async webhook(@Body() body: any): Promise<void> {
    await this.telegramService.handleWebhook(body);
  }
}
