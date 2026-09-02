import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEmail,
  IsNotEmpty,
  Matches,
  MinLength,
  IsInt,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CreateDireccionClienteDto } from './create-direccion-cliente.dto';

export class CreateClienteDto {
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? value : Number(value)))
  @IsInt()
  tipo_cliente_id: number;

  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString()
  nombre: string;

  @IsOptional()
  @IsString()
  apellido?: string;

  @IsOptional()
  @IsString()
  documento_identidad?: string;

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

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateDireccionClienteDto)
  direccion?: CreateDireccionClienteDto;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
