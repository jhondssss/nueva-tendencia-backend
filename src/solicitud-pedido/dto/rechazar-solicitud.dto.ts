import { IsNotEmpty, IsString } from 'class-validator';

export class RechazarSolicitudDto {
  @IsString()
  @IsNotEmpty()
  motivo_rechazo: string;
}
