import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
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

  @IsEnum(['adhesivo', 'material', 'herramienta', 'quimico', 'otro'])
  categoria: 'adhesivo' | 'material' | 'herramienta' | 'quimico' | 'otro';

  @IsEnum(['litro', 'kilo', 'metro', 'unidad', 'galon', 'pie', 'hoja'])
  unidad_medida: 'litro' | 'kilo' | 'metro' | 'unidad' | 'galon' | 'pie' | 'hoja';

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
