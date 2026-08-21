import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SolicitudPedido } from './entities/solicitud-pedido.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { SolicitudPedidoService } from './solicitud-pedido.service';
import { SolicitudPedidoController } from './solicitud-pedido.controller';
import { PedidoModule } from '../pedido/pedido.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SolicitudPedido, Cliente, Producto]),
    PedidoModule,
    AuditoriaModule,
    MailModule,
  ],
  controllers: [SolicitudPedidoController],
  providers: [SolicitudPedidoService],
  exports: [SolicitudPedidoService],
})
export class SolicitudPedidoModule {}
