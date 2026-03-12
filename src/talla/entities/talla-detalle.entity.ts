import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Pedido } from '../../pedido/entities/pedido.entity';
import { Producto } from '../../producto/entities/producto.entity';

export type CategoriaCalzado = 'nino' | 'juvenil' | 'adulto';

@Entity('talla_detalles')
export class TallaDetalle {
  @PrimaryGeneratedColumn()
  id_talla: number;

  @Column({ type: 'enum', enum: ['nino', 'juvenil', 'adulto'] })
  categoria: CategoriaCalzado;

  @Column({ type: 'int' })
  talla: number;

  @Column({ type: 'int' })
  cantidad_pares: number;

  @ManyToOne(() => Pedido, (pedido) => pedido.talles, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'pedido_id' })
  pedido: Pedido | null;

  @ManyToOne(() => Producto, (producto) => producto.talles, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'producto_id' })
  producto: Producto | null;
}
