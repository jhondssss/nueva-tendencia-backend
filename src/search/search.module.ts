import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Pedido } from '../pedido/entities/pedido.entity';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Cliente, Producto, Pedido])],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
