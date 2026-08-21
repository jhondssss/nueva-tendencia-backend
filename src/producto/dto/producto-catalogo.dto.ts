import { ApiProperty } from '@nestjs/swagger';
import type { CategoriaCalzado } from '../entities/producto.entity';

export class ProductoCatalogoDto {
  @ApiProperty()
  id_producto: number;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  descripcion: string;

  @ApiProperty()
  precio: number;

  @ApiProperty({ nullable: true })
  imagen: string | null;

  @ApiProperty()
  categoria: CategoriaCalzado;

  @ApiProperty()
  disponible: boolean;
}
