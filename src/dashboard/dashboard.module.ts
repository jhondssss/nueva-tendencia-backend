import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Insumo }   from '../insumo/entities/insumo.entity';
import { KpiService } from './kpi.service';
import { PrediccionService } from './prediccion.service';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Pedido, Producto, Insumo])],
  controllers: [DashboardController],
  providers: [KpiService, PrediccionService, DashboardService],
})
export class DashboardModule {}
