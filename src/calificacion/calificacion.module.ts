import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalificacionPedido } from '../pedido/entities/calificacion-pedido.entity';
import { CalificacionController } from './calificacion.controller';
import { CalificacionService } from './calificacion.service';

@Module({
  imports: [TypeOrmModule.forFeature([CalificacionPedido])],
  controllers: [CalificacionController],
  providers: [CalificacionService],
})
export class CalificacionModule {}
