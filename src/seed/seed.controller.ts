import { Controller, Post, ForbiddenException } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { SeedService } from './seed.service';

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Public()
  @Post('pedidos')
  async seedPedidos() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Seed no disponible en producción.');
    }
    return this.seedService.seedPedidos();
  }
}
