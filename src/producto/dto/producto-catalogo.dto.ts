import { ApiProperty } from '@nestjs/swagger';

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
  categoria: string;

  @ApiProperty()
  disponible: boolean;
}
