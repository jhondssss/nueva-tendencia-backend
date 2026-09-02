import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TipoCliente } from './entities/tipo-cliente.entity';
import { TipoClienteService } from './tipo-cliente.service';
import { TipoClienteController } from './tipo-cliente.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TipoCliente]),
    AuditoriaModule,
  ],
  controllers: [TipoClienteController],
  providers: [TipoClienteService],
  exports: [TipoClienteService],
})
export class TipoClienteModule {}
