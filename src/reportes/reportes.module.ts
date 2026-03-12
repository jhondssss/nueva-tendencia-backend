import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { KardexMovimiento } from '../kardex/entities/kardex.entity';
import { Auditoria } from '../auditoria/entities/auditoria.entity';
import { PdfService } from './pdf.service';
import { ExcelService } from './excel.service';
import { DiarioService } from './diario.service';
import { ReportesService } from './reportes.service';
import { ReportesController } from './reportes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Pedido, Cliente, Producto,
      Insumo, KardexMovimiento, Auditoria,
    ]),
  ],
  controllers: [ReportesController],
  providers: [PdfService, ExcelService, DiarioService, ReportesService],
})
export class ReportesModule {}
