import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TallaDetalle } from './entities/talla-detalle.entity';
import { TallaService } from './talla.service';

@Module({
  imports: [TypeOrmModule.forFeature([TallaDetalle])],
  providers: [TallaService],
  exports: [TallaService],
})
export class TallaModule {}
