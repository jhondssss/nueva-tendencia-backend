import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsNumber,
  Min,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateInsumoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @Transform(({ value }) => (value === undefined || value === null || value === '' ? value : Number(value)))
  @IsInt()
  categoria_id: number;

  @Transform(({ value }) => (value === undefined || value === null || value === '' ? value : Number(value)))
  @IsInt()
  unidad_medida_id: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? value : Number(value)))
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? value : Number(value)))
  @IsNumber()
  @Min(0)
  nivel_minimo?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? value : Number(value)))
  @IsNumber()
  @Min(0)
  precio_unitario?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsString()
  imagen_url?: string;

  @IsOptional()
  @IsEnum(['clefa', 'pasta', 'cuero', 'esponja', 'pvc'])
  rol_formula?: 'clefa' | 'pasta' | 'cuero' | 'esponja' | 'pvc';
}
