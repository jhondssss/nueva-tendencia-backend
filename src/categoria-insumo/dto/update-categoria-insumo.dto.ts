import { PartialType } from '@nestjs/mapped-types';
import { CreateCategoriaInsumoDto } from './create-categoria-insumo.dto';

export class UpdateCategoriaInsumoDto extends PartialType(CreateCategoriaInsumoDto) {}
