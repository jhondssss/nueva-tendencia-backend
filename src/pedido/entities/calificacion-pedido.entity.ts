import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Pedido } from './pedido.entity';

@Entity('calificacion_pedido')
export class CalificacionPedido {
  @PrimaryGeneratedColumn()
  id_calificacion: number;

  @OneToOne(() => Pedido, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pedido_id' })
  pedido: Pedido;

  @Column({ type: 'int' })
  puntuacion: number;

  @Column({ type: 'text', nullable: true })
  comentario: string | null;

  @CreateDateColumn()
  fecha_creacion: Date;
}
