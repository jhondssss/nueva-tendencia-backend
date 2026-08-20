import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ default: 'user' })
  role: string;

  @Column({ nullable: true })
  nombre: string;

  @Column({ nullable: true })
  apellido: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reset_token: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reset_token_expires: Date | null;

  @Column({ default: true })
  activo: boolean;

  @Column({ name: 'cliente_id', type: 'int', nullable: true, unique: true })
  clienteId: number | null;

  @Column({ name: 'requiere_cambio_password', default: false })
  requiereCambioPassword: boolean;
}
