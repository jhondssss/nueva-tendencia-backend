import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Cliente } from '../../cliente/entities/cliente.entity';
import { Producto } from '../../producto/entities/producto.entity';
import { TallaDetalle } from '../../talla/entities/talla-detalle.entity';

export type UnidadPedido = 'docena' | 'media_docena' | 'par';
export type CategoriaCalzado = 'nino' | 'juvenil' | 'adulto';

@Entity('pedidos')
export class Pedido {
  @PrimaryGeneratedColumn()
  id_pedido: number;

  @ManyToOne(() => Cliente, cliente => cliente.id_cliente, { eager: true })
  cliente: Cliente;

  @ManyToOne(() => Producto, producto => producto.id_producto, { eager: true })
  producto: Producto;

  @Column('decimal', { precision: 10, scale: 2 })
  total: number;

  @Column({ type: 'date' })
  fecha_entrega: string;

  @Column({ default: 'Pendiente' })
  estado: 'Pendiente' | 'Cortado' | 'Aparado' | 'Solado' | 'Empaque' | 'Terminado';

  @Column({ type: 'int', default: 1 })
  cantidad: number;

  @Column({
    type: 'enum',
    enum: ['docena', 'media_docena', 'par'],
    default: 'docena',
  })
  unidad: UnidadPedido;

  @Column({ type: 'int', default: 12 })
  cantidad_pares: number;

  @Column({
    type: 'enum',
    enum: ['nino', 'juvenil', 'adulto'],
    nullable: true,
  })
  categoria: CategoriaCalzado | null;

  @Column({ unique: true, nullable: true })
  token_seguimiento: string;

  @CreateDateColumn()
  fecha_creacion: Date;

  @UpdateDateColumn()
  fecha_actualizacion: Date;

  @OneToMany(() => TallaDetalle, (talla) => talla.pedido)
  talles: TallaDetalle[];
}
