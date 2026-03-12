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

  @IsEnum(['litro', 'kilo', 'metro', 'unidad', 'galon'])
  unidad_medida: 'litro' | 'kilo' | 'metro' | 'unidad' | 'galon';

  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  nivel_minimo?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precio_unitario?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsString()
  imagen_url?: string;
}
