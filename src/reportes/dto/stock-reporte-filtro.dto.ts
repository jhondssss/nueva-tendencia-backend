import { IsIn, IsOptional } from 'class-validator';
import type { CategoriaCalzado } from '../../pedido/entities/pedido.entity';

export class StockReporteFiltroDto {
  @IsOptional()
  @IsIn(['nino', 'juvenil', 'adulto'])
  categoria?: CategoriaCalzado;
}
