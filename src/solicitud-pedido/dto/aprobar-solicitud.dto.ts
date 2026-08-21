import { IsNumber, IsOptional, IsEnum, IsDateString } from 'class-validator';

export class AprobarSolicitudDto {
  @IsNumber()
  total: number;

  @IsDateString()
  fecha_entrega: string;

  @IsOptional()
  @IsEnum(['docena', 'media_docena', 'par'])
  unidad?: 'docena' | 'media_docena' | 'par';
}
