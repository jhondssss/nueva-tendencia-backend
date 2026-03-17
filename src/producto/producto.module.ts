import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Producto } from './entities/producto.entity';
import { ProductoService } from './producto.service';
import { ProductoController } from './producto.controller';
import { KardexModule } from '../kardex/kardex.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Producto]),
    KardexModule,
    AuditoriaModule,
  ],
  controllers: [ProductoController],
  providers: [ProductoService, CloudinaryService],
  exports: [ProductoService, TypeOrmModule],
})
export class ProductoModule {}
