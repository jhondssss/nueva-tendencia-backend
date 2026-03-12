import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Insumo } from '../insumo/entities/insumo.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Pedido, Cliente, Producto, Insumo])],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
