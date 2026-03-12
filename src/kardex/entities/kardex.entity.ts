import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Producto } from '../../producto/entities/producto.entity';
import { Insumo } from '../../insumo/entities/insumo.entity';
import { User } from '../../user/entities/user.entity';

export type TipoMovimiento  = 'entrada' | 'salida' | 'ajuste';
export type TipoRegistro    = 'producto' | 'insumo';

@Entity('kardex_movimientos')
export class KardexMovimiento {
  @PrimaryGeneratedColumn()
  id_movimiento: number;

  @Column({ type: 'enum', enum: ['producto', 'insumo'], default: 'producto' })
  tipo_registro: TipoRegistro;

  @Column({ type: 'enum', enum: ['entrada', 'salida', 'ajuste'] })
  tipo: TipoMovimiento;

  /** entrada/salida → unidades movidas  |  ajuste → nuevo stock absoluto */
  @Column('decimal', { precision: 10, scale: 2 })
  cantidad: number;

  @Column('decimal', { precision: 10, scale: 2, name: 'stock_anterior' })
  stock_anterior: number;

  @Column('decimal', { precision: 10, scale: 2, name: 'stock_nuevo' })
  stock_nuevo: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  motivo: string | null;

  @CreateDateColumn()
  fecha: Date;

  @ManyToOne(() => Producto, { nullable: true, eager: false, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'producto_id' })
  producto: Producto | null;

  @ManyToOne(() => Insumo, { nullable: true, eager: false, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'insumo_id' })
  insumo: Insumo | null;

  @ManyToOne(() => User, { nullable: true, eager: false, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: User | null;
}
