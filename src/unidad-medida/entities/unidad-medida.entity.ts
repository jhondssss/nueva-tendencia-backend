import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('unidades_medida')
export class UnidadMedida {
  @PrimaryGeneratedColumn()
  id_unidad_medida: number;

  @Column({ type: 'varchar', length: 30, unique: true })
  nombre: string;

  @Column({ default: true })
  activo: boolean;
}
