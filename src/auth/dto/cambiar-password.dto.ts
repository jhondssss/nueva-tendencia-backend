import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CambiarPasswordDto {
  @IsString({ message: 'La contraseña actual debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña actual es requerida' })
  password_actual: string;

  @IsString({ message: 'La contraseña nueva debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña nueva es requerida' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password_nuevo: string;
}
