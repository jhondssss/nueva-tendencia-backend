import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEmail,
  IsNotEmpty,
  Matches,
  MinLength,
  IsIn,
} from 'class-validator';

export class CreateClienteDto {
  @IsIn(['persona_natural', 'empresa'], {
    message: 'El tipo debe ser persona_natural o empresa',
  })
  tipo_cliente: string;

  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString()
  nombre: string;

  @IsOptional()
  @IsString()
  apellido?: string;

  @IsOptional()
  @IsString()
  nombre_completo?: string;

  @IsNotEmpty({ message: 'El CI o RUC es obligatorio' })
  @IsString()
  documento_identidad: string;

  @IsNotEmpty({ message: 'El email es obligatorio' })
  @IsEmail({}, { message: 'El email no es válido' })
  correo_electronico: string;

  @IsNotEmpty({ message: 'El teléfono principal es obligatorio' })
  @Matches(/^\d+$/, { message: 'El teléfono debe contener solo números' })
  @MinLength(7, { message: 'El teléfono debe tener al menos 7 dígitos' })
  telefono_principal: string;

  @IsOptional()
  @IsString()
  telefono_alternativo?: string;

  @IsString()
  direccion_calle: string;

  @IsString()
  direccion_colonia: string;

  @IsNotEmpty({ message: 'La ciudad es obligatoria' })
  @IsString()
  ciudad: string;

  @IsString()
  estado_provincia: string;

  @IsString()
  codigo_postal: string;

  @IsNotEmpty({ message: 'El país es obligatorio' })
  @IsString()
  pais: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
