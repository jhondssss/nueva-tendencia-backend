import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { Pedido } from '../../pedido/entities/pedido.entity';
import { DireccionCliente } from './direccion-cliente.entity';
import { TipoCliente } from '../../tipo-cliente/entities/tipo-cliente.entity';

@Entity()
export class Cliente {
  @PrimaryGeneratedColumn()
  id_cliente: number;

  @ManyToOne(() => TipoCliente, { eager: true })
  @JoinColumn({ name: 'tipo_cliente_id' })
  tipo_cliente: TipoCliente;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  apellido: string;

  @Column({ nullable: true })
  documento_identidad: string;

  @Column()
  correo_electronico: string;

  @Column()
  telefono_principal: string;

  @Column({ nullable: true })
  telefono_alternativo: string;

  @OneToOne(() => DireccionCliente, (d) => d.cliente, { cascade: true })
  direccion: DireccionCliente;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha_registro: Date;

  @Column({ default: true })
  activo: boolean;

  @OneToMany(() => Pedido, (pedido) => pedido.cliente)
  pedidos: Pedido[];
}
