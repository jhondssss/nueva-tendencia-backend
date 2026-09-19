import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdatePerfilDto {
  @IsOptional()
  @IsEmail({}, { message: 'El email no es válido' })
  email?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  nombre?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El apellido no puede estar vacío' })
  apellido?: string;
}
