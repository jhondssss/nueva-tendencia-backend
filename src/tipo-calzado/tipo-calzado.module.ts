import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TipoCalzado } from './entities/tipo-calzado.entity';
import { TipoCalzadoService } from './tipo-calzado.service';
import { TipoCalzadoController } from './tipo-calzado.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TipoCalzado]),
    AuditoriaModule,
  ],
  controllers: [TipoCalzadoController],
  providers: [TipoCalzadoService],
  exports: [TipoCalzadoService],
})
export class TipoCalzadoModule {}
