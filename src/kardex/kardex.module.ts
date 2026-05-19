import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KardexMovimiento } from './entities/kardex.entity';
import { KardexService } from './kardex.service';
import { KardexController } from './kardex.controller';

@Module({
  imports: [TypeOrmModule.forFeature([KardexMovimiento])],
  controllers: [KardexController],
  providers: [KardexService],
  exports: [KardexService],
})
export class KardexModule {}
