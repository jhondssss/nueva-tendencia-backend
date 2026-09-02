import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('categorias_insumo')
export class CategoriaInsumo {
  @PrimaryGeneratedColumn()
  id_categoria_insumo: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  nombre: string;

  @Column({ default: true })
  activo: boolean;
}
