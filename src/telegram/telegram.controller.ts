import { Controller, Get } from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Get('test-resumen')
  async testResumen(): Promise<{ ok: boolean }> {
    await this.telegramService.sendResumenDiario();
    return { ok: true };
  }
}
