import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramService } from './telegram.service';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Insumo } from '../insumo/entities/insumo.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Pedido, Insumo])],
  providers: [TelegramService],
  exports:   [TelegramService],
})
export class TelegramModule {}
