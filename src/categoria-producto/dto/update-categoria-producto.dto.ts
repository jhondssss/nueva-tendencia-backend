import { PartialType } from '@nestjs/mapped-types';
import { CreateCategoriaProductoDto } from './create-categoria-producto.dto';

export class UpdateCategoriaProductoDto extends PartialType(CreateCategoriaProductoDto) {}
