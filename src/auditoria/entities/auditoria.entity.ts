import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('auditoria')
export class Auditoria {
  @PrimaryGeneratedColumn()
  id_auditoria: number;

  @Column()
  accion: string;

  @Column()
  modulo: string;

  @Column()
  descripcion: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @CreateDateColumn()
  fecha: Date;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  usuario: User | null;
}
