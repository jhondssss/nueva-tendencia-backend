import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KardexMovimiento } from './entities/kardex.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { KardexService } from './kardex.service';
import { KardexController } from './kardex.controller';

@Module({
  imports: [TypeOrmModule.forFeature([KardexMovimiento, Producto, Insumo])],
  controllers: [KardexController],
  providers: [KardexService],
  exports: [KardexService],
})
export class KardexModule {}
