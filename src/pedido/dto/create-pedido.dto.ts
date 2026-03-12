import { IsNotEmpty, IsNumber, IsOptional, IsEnum, IsDateString, Min, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class TallaPersonalizadaDto {
  @IsNumber()
  talla: number;

  @IsNumber()
  @Min(0)
  cantidad_pares: number;
}

export class CreatePedidoDto {
  @IsNumber()
  clienteId: number;

  @IsNumber()
  productoId: number;

  @IsNumber()
  total: number;

  @IsDateString()
  fecha_entrega: string;

  @IsOptional()
  @IsEnum(['Pendiente', 'Aparado', 'Solado', 'Empaque', 'Terminado'])
  estado?: 'Pendiente' | 'Aparado' | 'Solado' | 'Empaque' | 'Terminado';

  @IsOptional()
  @IsNumber()
  @Min(1)
  cantidad?: number;

  @IsOptional()
  @IsEnum(['docena', 'media_docena', 'par'])
  unidad?: 'docena' | 'media_docena' | 'par';

  @IsOptional()
  @IsEnum(['nino', 'juvenil', 'adulto'])
  categoria?: 'nino' | 'juvenil' | 'adulto';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TallaPersonalizadaDto)
  tallas_personalizadas?: TallaPersonalizadaDto[];
}