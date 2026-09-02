// src/producto/entities/producto.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CategoriaProducto } from '../../categoria-producto/entities/categoria-producto.entity';

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

  @ManyToOne(() => CategoriaProducto, { eager: true, nullable: true })
  @JoinColumn({ name: 'categoria_producto_id' })
  categoria: CategoriaProducto | null;

  // Cantidad fija por docena de pares, consumida automáticamente en cada
  // etapa del Kanban (Fase 2). null = etapa no configurada para este producto.
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  cuero_pies: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  clefa_aparado_litros: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  pasta_solado_litros: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  clefa_solado_litros: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  pvc_solado_litros: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  clefa_empaque_litros: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  esponja_empaque_hojas: number | null;
}