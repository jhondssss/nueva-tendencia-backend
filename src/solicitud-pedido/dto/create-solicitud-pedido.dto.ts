import {
  IsNumber,
  IsOptional,
  IsEnum,
  IsString,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TallaSolicitudDto {
  @IsNumber()
  talla: number;

  @IsNumber()
  @Min(1)
  cantidad_pares: number;
}

export class CreateSolicitudPedidoDto {
  @IsNumber()
  producto_id: number;

  @IsEnum(['nino', 'juvenil', 'adulto'])
  categoria: 'nino' | 'juvenil' | 'adulto';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TallaSolicitudDto)
  tallas: TallaSolicitudDto[];

  @IsOptional()
  @IsString()
  comentario_cliente?: string;

  @IsOptional()
  @IsDateString()
  fecha_entrega_deseada?: string;
}
