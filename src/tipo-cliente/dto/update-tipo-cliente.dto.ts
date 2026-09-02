import { PartialType } from '@nestjs/mapped-types';
import { CreateTipoClienteDto } from './create-tipo-cliente.dto';

export class UpdateTipoClienteDto extends PartialType(CreateTipoClienteDto) {}
