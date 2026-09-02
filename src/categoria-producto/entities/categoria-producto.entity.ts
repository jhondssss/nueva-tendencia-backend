import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('categorias_producto')
export class CategoriaProducto {
  @PrimaryGeneratedColumn()
  id_categoria_producto: number;

  @Column({ type: 'varchar', length: 30, unique: true })
  nombre: string;

  @Column({ default: true })
  activo: boolean;
}
