import { PartialType } from '@nestjs/mapped-types';
import { CreateTipoCalzadoDto } from './create-tipo-calzado.dto';

export class UpdateTipoCalzadoDto extends PartialType(CreateTipoCalzadoDto) {}
