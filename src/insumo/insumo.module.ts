import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Insumo } from './entities/insumo.entity';
import { CategoriaInsumo } from '../categoria-insumo/entities/categoria-insumo.entity';
import { InsumoService } from './insumo.service';
import { InsumoController } from './insumo.controller';
import { KardexModule } from '../kardex/kardex.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Insumo, CategoriaInsumo]),
    KardexModule,
    AuditoriaModule,
  ],
  controllers: [InsumoController],
  providers: [InsumoService, CloudinaryService],
  exports: [InsumoService],
})
export class InsumoModule {}
