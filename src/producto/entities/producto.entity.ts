// src/producto/entities/producto.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

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

  // Fórmula de mezcla para el descuento automático de insumos en Solado.
  // null en ambos = fórmula no configurada. Cuando están seteados, deben sumar 100.
  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  porcentaje_clefa: number | null;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  porcentaje_pasta: number | null;

}