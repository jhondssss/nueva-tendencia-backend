import { ApiProperty } from '@nestjs/swagger';
import { CategoriaCalzado } from '../entities/producto.entity';

export class ProductoCatalogoDto {
  @ApiProperty()
  nombre: string;

  @ApiProperty()
  descripcion: string;

  @ApiProperty()
  precio: number;

  @ApiProperty({ nullable: true })
  imagen: string | null;

  @ApiProperty({ nullable: true })
  categoria: CategoriaCalzado | null;

  @ApiProperty()
  disponible: boolean;
}
