import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('generos')
export class Genero {
  @PrimaryGeneratedColumn()
  id_genero: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  nombre: string;

  @Column({ default: true })
  activo: boolean;
}
