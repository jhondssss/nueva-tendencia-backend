import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CalificarPedidoDto {
  @IsInt()
  @Min(1)
  @Max(5)
  puntuacion: number;

  @IsOptional()
  @IsString()
  comentario?: string;
}
