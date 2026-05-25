import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateDireccionClienteDto {
  @IsOptional()
  @IsString()
  calle?: string;

  @IsOptional()
  @IsString()
  colonia?: string;

  @IsOptional()
  @IsString()
  ciudad?: string;

  @IsOptional()
  @IsString()
  estado_provincia?: string;

  @IsOptional()
  @IsString()
  codigo_postal?: string;

  @IsOptional()
  @IsString()
  pais?: string;

  @IsOptional()
  @IsBoolean()
  es_principal?: boolean;
}
