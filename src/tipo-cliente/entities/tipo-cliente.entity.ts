import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('tipos_cliente')
export class TipoCliente {
  @PrimaryGeneratedColumn()
  id_tipo_cliente: number;

  @Column({ type: 'varchar', length: 30, unique: true })
  nombre: string;

  @Column({ default: true })
  activo: boolean;
}
