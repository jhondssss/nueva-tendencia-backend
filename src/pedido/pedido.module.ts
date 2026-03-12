import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pedido } from './entities/pedido.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { PedidoCrudService } from './pedido-crud.service';
import { PedidoEstadoService } from './pedido-estado.service';
import { PedidoService } from './pedido.service';
import { PedidoController } from './pedido.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { TallaModule } from '../talla/talla.module';

@Module({
  imports: [TypeOrmModule.forFeature([Pedido, Cliente, Producto]), AuditoriaModule, TallaModule],
  controllers: [PedidoController],
  providers: [PedidoCrudService, PedidoEstadoService, PedidoService],
  exports: [PedidoService],
})
export class PedidoModule {}
