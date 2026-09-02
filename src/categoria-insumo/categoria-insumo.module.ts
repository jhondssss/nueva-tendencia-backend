import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriaInsumo } from './entities/categoria-insumo.entity';
import { CategoriaInsumoService } from './categoria-insumo.service';
import { CategoriaInsumoController } from './categoria-insumo.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CategoriaInsumo]),
    AuditoriaModule,
  ],
  controllers: [CategoriaInsumoController],
  providers: [CategoriaInsumoService],
  exports: [CategoriaInsumoService],
})
export class CategoriaInsumoModule {}
