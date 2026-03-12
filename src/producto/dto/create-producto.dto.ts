import { IsString, IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateProductoDto {
  @IsString() nombre_modelo: string;
  @IsString() marca: string;
  @IsString() tipo_calzado: string;
  @IsString() genero: string;
  @IsString() material_principal: string;
  @IsString() color: string;
  @Transform(({ value }) => Number(value)) @IsNumber() precio_venta: number;
  @Transform(({ value }) => Number(value)) @IsNumber() costo_unidad: number;
  @IsString() descripcion_corta: string;
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true'  || value === true)  return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  activo?: boolean;

  // Campos inventario
  @IsOptional() @Transform(({ value }) => Number(value)) @IsNumber() stock?: number;
  @IsOptional() @IsString() unidad_medida?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsNumber() nivel_minimo?: number;
  imagen_url?: string;
}
