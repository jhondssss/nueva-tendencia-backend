import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnidadMedida } from './entities/unidad-medida.entity';
import { UnidadMedidaService } from './unidad-medida.service';
import { UnidadMedidaController } from './unidad-medida.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UnidadMedida]),
    AuditoriaModule,
  ],
  controllers: [UnidadMedidaController],
  providers: [UnidadMedidaService],
  exports: [UnidadMedidaService],
})
export class UnidadMedidaModule {}
