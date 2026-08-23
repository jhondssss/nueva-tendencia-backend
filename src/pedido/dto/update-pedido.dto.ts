import { PartialType } from '@nestjs/mapped-types';
import { CreatePedidoDto } from './create-pedido.dto';
import { IsNumber, IsOptional, IsEnum, IsDateString } from 'class-validator';

export class UpdatePedidoDto extends PartialType(CreatePedidoDto) {
  @IsOptional()
  @IsNumber()
  cliente_id?: number;  // ← CAMBIADO

  @IsOptional()
  @IsNumber()
  producto_id?: number;  // ← CAMBIADO

  @IsOptional()
  @IsNumber()
  total?: number;

  @IsOptional()
  @IsDateString()
  fecha_entrega?: string;

  @IsOptional()
  @IsEnum(['Pendiente', 'Cortado', 'Aparado', 'Solado', 'Empaque', 'Terminado'])
  estado?: 'Pendiente' | 'Cortado' | 'Aparado' | 'Solado' | 'Empaque' | 'Terminado';
}