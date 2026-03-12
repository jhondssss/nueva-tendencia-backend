// src/producto/entities/producto.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { TallaDetalle } from '../../talla/entities/talla-detalle.entity';

export type CategoriaCalzado = 'nino' | 'juvenil' | 'adulto';

@Entity('productos')
export class Producto {
  @PrimaryGeneratedColumn()
  id_producto: number;

  @Column()
  nombre_modelo: string;

  @Column()
  marca: string;

  @Column()
  tipo_calzado: string;

  @Column()
  genero: string;

  @Column()
  material_principal: string;

  @Column()
  color: string;

  @Column('decimal', { precision: 10, scale: 2 })
  precio_venta: number;

  @Column('decimal', { precision: 10, scale: 2 })
  costo_unidad: number;

  @Column('text')
  descripcion_corta: string;

  @Column({ default: true })
  activo: boolean;

  @Column('int', { default: 0 })
  stock: number;

  @Column({ default: 'unidades' })
  unidad_medida: string;

  @Column('int', { default: 0 })
  nivel_minimo: number;

  // ✅ NUEVO CAMPO PARA IMAGEN
  @Column({ nullable: true })
  imagen_url: string;

  @Column({
    type: 'enum',
    enum: ['nino', 'juvenil', 'adulto'],
    nullable: true,
  })
  categoria: CategoriaCalzado | null;

  @OneToMany(() => TallaDetalle, (talla) => talla.producto)
  talles: TallaDetalle[];
}