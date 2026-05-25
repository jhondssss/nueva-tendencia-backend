import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { Cliente } from './cliente.entity';

@Entity('direccion_cliente')
export class DireccionCliente {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  calle: string;

  @Column({ nullable: true })
  colonia: string;

  @Column({ nullable: true })
  ciudad: string;

  @Column({ nullable: true })
  estado_provincia: string;

  @Column({ nullable: true })
  codigo_postal: string;

  @Column({ nullable: true })
  pais: string;

  @Column({ default: true })
  es_principal: boolean;

  @OneToOne(() => Cliente, (cliente) => cliente.direccion)
  @JoinColumn({ name: 'cliente_id' })
  cliente: Cliente;
}
