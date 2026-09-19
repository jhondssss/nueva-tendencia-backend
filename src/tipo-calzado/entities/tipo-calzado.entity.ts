import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('tipos_calzado')
export class TipoCalzado {
  @PrimaryGeneratedColumn()
  id_tipo_calzado: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  nombre: string;

  @Column({ default: true })
  activo: boolean;
}
