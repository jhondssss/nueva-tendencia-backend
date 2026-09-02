import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cliente } from './entities/cliente.entity';
import { DireccionCliente } from './entities/direccion-cliente.entity';
import { TipoCliente } from '../tipo-cliente/entities/tipo-cliente.entity';
import { SolicitudPedido } from '../solicitud-pedido/entities/solicitud-pedido.entity';
import { ClienteService } from './cliente.service';
import { ClienteController } from './cliente.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { UserModule } from '../user/user.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cliente, DireccionCliente, TipoCliente, SolicitudPedido]),
    AuditoriaModule,
    UserModule,
    MailModule,
  ],
  controllers: [ClienteController],
  providers: [ClienteService],
  exports: [ClienteService],
})
export class ClienteModule {}
