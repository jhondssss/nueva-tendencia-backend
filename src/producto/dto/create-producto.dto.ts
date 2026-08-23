import {
  IsString, IsNumber, IsOptional, IsBoolean,
  IsNotEmpty, Min, IsEnum,
} from 'class-validator';
import { Transform } from 'class-transformer';
import type { CategoriaCalzado } from '../entities/producto.entity';

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
}
