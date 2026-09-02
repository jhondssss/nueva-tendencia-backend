import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional } from 'class-validator';
import type { OrigenMovimiento, TipoMovimiento } from '../../kardex/entities/kardex.entity';

export class KardexReporteFiltroDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  insumo_id?: number;

  @IsOptional()
  @IsIn(['entrada', 'salida', 'ajuste'])
  tipo?: TipoMovimiento;

  @IsOptional()
  @IsIn(['manual', 'automatico'])
  origen?: OrigenMovimiento;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoria_insumo_id?: number;
}
