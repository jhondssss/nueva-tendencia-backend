import { IsEmail, IsOptional } from 'class-validator';

export class DarAccesoDto {
  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  email?: string;
}
