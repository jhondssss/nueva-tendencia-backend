import { Controller, Get } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Public()
  @Get('test-resumen')
  async testResumen(): Promise<{ ok: boolean }> {
    await this.telegramService.sendResumenDiario();
    return { ok: true };
  }
}
