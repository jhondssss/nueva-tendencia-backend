import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateKardexDto {
  /** entrada: suma cantidad al stock actual
   *  salida : resta cantidad al stock actual
   *  ajuste : establece el stock al valor absoluto de cantidad */
  @IsEnum(['entrada', 'salida', 'ajuste'])
  tipo: 'entrada' | 'salida' | 'ajuste';

  @IsInt()
  @Min(0)
  cantidad: number;

  @IsInt()
  producto_id: number;

  @IsOptional()
  @IsString()
  motivo?: string;
}
