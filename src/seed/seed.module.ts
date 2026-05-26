import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pedido } from '../pedido/entities/pedido.entity';
import { TallaDetalle } from '../talla/entities/talla-detalle.entity';
import { SeedService } from './seed.service';
import { SeedController } from './seed.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Pedido, TallaDetalle])],
  controllers: [SeedController],
  providers: [SeedService],
})
export class SeedModule {}
