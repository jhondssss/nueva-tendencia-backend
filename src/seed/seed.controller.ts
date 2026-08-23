import { Controller, Post, ForbiddenException } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { SeedService } from './seed.service';

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Roles('admin')
  @Post('pedidos')
  async seedPedidos() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Seed no disponible en producción.');
    }
    return this.seedService.seedPedidos();
  }
}
