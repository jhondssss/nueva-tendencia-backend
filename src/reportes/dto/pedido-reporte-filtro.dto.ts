import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import type { CategoriaCalzado } from '../../pedido/entities/pedido.entity';

export class PedidoReporteFiltroDto {
  @IsOptional()
  @IsString()
  cliente?: string;

  @IsOptional()
  @IsString()
  producto?: string;

  @IsOptional()
  @IsIn(['nino', 'juvenil', 'adulto'])
  categoria?: CategoriaCalzado;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
