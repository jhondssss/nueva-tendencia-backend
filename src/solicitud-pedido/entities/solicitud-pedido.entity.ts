import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Cliente } from '../../cliente/entities/cliente.entity';
import { Producto } from '../../producto/entities/producto.entity';
import { Pedido } from '../../pedido/entities/pedido.entity';

export interface TallaSolicitada {
  talla: number;
  cantidad_pares: number;
}

@Entity('solicitud_pedido')
export class SolicitudPedido {
  @PrimaryGeneratedColumn()
  id_solicitud: number;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Cliente;

  @ManyToOne(() => Producto, { eager: true })
  @JoinColumn({ name: 'producto_id' })
  producto: Producto;

  @Column()
  categoria: 'nino' | 'juvenil' | 'adulto';

  @Column({ type: 'int' })
  cantidad_pares: number;

  @Column({ type: 'jsonb' })
  tallas: TallaSolicitada[];

  @Column({ type: 'text', nullable: true })
  comentario_cliente: string | null;

  @Column({ type: 'date', nullable: true })
  fecha_entrega_deseada: string | null;

  @Column({ default: 'Pendiente' })
  estado: 'Pendiente' | 'Aprobada' | 'Rechazada';

  @Column({ type: 'text', nullable: true })
  motivo_rechazo: string | null;

  @ManyToOne(() => Pedido, { eager: true, nullable: true })
  @JoinColumn({ name: 'pedido_id_creado' })
  pedido_creado: Pedido | null;

  @CreateDateColumn()
  fecha_creacion: Date;

  @UpdateDateColumn()
  fecha_actualizacion: Date;
}
