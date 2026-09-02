import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateTipoClienteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  nombre: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
