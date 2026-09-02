import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriaProducto } from './entities/categoria-producto.entity';
import { CategoriaProductoService } from './categoria-producto.service';
import { CategoriaProductoController } from './categoria-producto.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CategoriaProducto]),
    AuditoriaModule,
  ],
  controllers: [CategoriaProductoController],
  providers: [CategoriaProductoService],
  exports: [CategoriaProductoService],
})
export class CategoriaProductoModule {}
