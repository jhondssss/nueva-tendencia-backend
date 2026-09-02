import { IsNumber, IsOptional, IsEnum, IsDateString, IsInt, Min } from 'class-validator';

export class AprobarSolicitudDto {
  @IsNumber()
  total: number;

  @IsDateString()
  fecha_entrega: string;

  @IsOptional()
  @IsEnum(['docena', 'media_docena', 'par'])
  unidad?: 'docena' | 'media_docena' | 'par';

  @IsOptional()
  @IsInt({ message: 'cuero_insumo_id debe ser un ID válido' })
  @Min(1, { message: 'cuero_insumo_id debe ser un ID válido' })
  cuero_insumo_id?: number;
}
