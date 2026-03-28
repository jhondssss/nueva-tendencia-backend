import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Insumo } from '../insumo/entities/insumo.entity';

@Global()
@Module({
  imports:     [TypeOrmModule.forFeature([Pedido, Insumo])],
  controllers: [TelegramController],
  providers:   [TelegramService],
  exports:     [TelegramService],
})
export class TelegramModule {}
