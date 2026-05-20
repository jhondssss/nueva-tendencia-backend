import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { AssistantModule } from '../assistant/assistant.module';

@Global()
@Module({
  imports:     [TypeOrmModule.forFeature([Pedido, Insumo]), AssistantModule],
  controllers: [TelegramController],
  providers:   [TelegramService],
  exports:     [TelegramService],
})
export class TelegramModule {}
