import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Insumo } from './entities/insumo.entity';
import { InsumoService } from './insumo.service';
import { InsumoController } from './insumo.controller';
import { KardexModule } from '../kardex/kardex.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Insumo]),
    KardexModule,
    AuditoriaModule,
  ],
  controllers: [InsumoController],
  providers: [InsumoService],
  exports: [InsumoService],
})
export class InsumoModule {}
