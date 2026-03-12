import { IsString, IsBoolean, IsOptional, IsEmail } from 'class-validator';

export class CreateClienteDto {
  @IsString() tipo_cliente: string;
  @IsString() nombre: string;
  @IsOptional() @IsString() apellido?: string;
  @IsOptional() @IsString() nombre_completo?: string;
  @IsOptional() @IsString() documento_identidad?: string;
  @IsEmail() correo_electronico: string;
  @IsString() telefono_principal: string;
  @IsOptional() @IsString() telefono_alternativo?: string;
  @IsString() direccion_calle: string;
  @IsString() direccion_colonia: string;
  @IsString() ciudad: string;
  @IsString() estado_provincia: string;
  @IsString() codigo_postal: string;
  @IsString() pais: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}
