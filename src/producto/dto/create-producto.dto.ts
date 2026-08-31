import {
  IsString, IsNumber, IsOptional, IsBoolean,
  IsNotEmpty, Min, Max, IsEnum,
} from 'class-validator';
import { Transform } from 'class-transformer';
import type { CategoriaCalzado } from '../entities/producto.entity';
import { PorcentajesMezclaValidos } from '../validators/porcentajes-mezcla.validator';

export class CreateProductoDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del modelo es obligatorio' })
  nombre_modelo: string;

  @IsString()
  @IsNotEmpty({ message: 'La marca es obligatoria' })
  marca: string;

  @IsString()
  @IsNotEmpty({ message: 'El tipo de calzado es obligatorio' })
  tipo_calzado: string;

  @IsString()
  @IsNotEmpty({ message: 'El género es obligatorio' })
  genero: string;

  @IsString()
  @IsNotEmpty({ message: 'El material principal es obligatorio' })
  material_principal: string;

  @IsString()
  @IsNotEmpty({ message: 'El color es obligatorio' })
  color: string;

  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: 'El precio de venta debe ser un número' })
  @Min(0.01, { message: 'El precio debe ser mayor a 0' })
  precio_venta: number;

  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: 'El costo por unidad debe ser un número' })
  @Min(0.01, { message: 'El costo debe ser mayor a 0' })
  costo_unidad: number;

  @IsString()
  @IsNotEmpty({ message: 'La descripción corta es obligatoria' })
  descripcion_corta: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true'  || value === true)  return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: 'El stock debe ser un número' })
  @Min(0, { message: 'El stock no puede ser negativo' })
  stock?: number;

  @IsOptional()
  @IsString()
  unidad_medida?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: 'El nivel mínimo debe ser un número' })
  @Min(0, { message: 'El nivel mínimo no puede ser negativo' })
  nivel_minimo?: number;

  imagen_url?: string;

  @IsOptional()
  @IsEnum(['nino', 'juvenil', 'adulto'])
  categoria?: CategoriaCalzado;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? value : Number(value)))
  @IsNumber({}, { message: 'El porcentaje de Clefa debe ser un número' })
  @Min(0, { message: 'El porcentaje de Clefa no puede ser negativo' })
  @Max(100, { message: 'El porcentaje de Clefa no puede superar 100' })
  @PorcentajesMezclaValidos({ message: 'porcentaje_clefa y porcentaje_pasta deben venir ambos y sumar exactamente 100' })
  porcentaje_clefa?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? value : Number(value)))
  @IsNumber({}, { message: 'El porcentaje de Pasta debe ser un número' })
  @Min(0, { message: 'El porcentaje de Pasta no puede ser negativo' })
  @Max(100, { message: 'El porcentaje de Pasta no puede superar 100' })
  porcentaje_pasta?: number;
}
