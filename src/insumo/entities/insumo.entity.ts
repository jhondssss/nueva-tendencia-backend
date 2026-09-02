import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CategoriaInsumo = 'adhesivo' | 'material' | 'herramienta' | 'quimico' | 'otro';
export type UnidadInsumo   = 'litro' | 'kilo' | 'metro' | 'unidad' | 'galon' | 'pie' | 'hoja';
export type RolFormula     = 'clefa' | 'pasta';

@Entity('insumos')
export class Insumo {
  @PrimaryGeneratedColumn()
  id_insumo: number;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descripcion: string | null;

  @Column({
    type: 'enum',
    enum: ['adhesivo', 'material', 'herramienta', 'quimico', 'otro'],
  })
  categoria: CategoriaInsumo;

  @Column({
    type: 'enum',
    enum: ['litro', 'kilo', 'metro', 'unidad', 'galon', 'pie', 'hoja'],
  })
  unidad_medida: UnidadInsumo;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  stock: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  nivel_minimo: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  precio_unitario: number;

  @Column({ default: true })
  activo: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  imagen_url: string | null;

  // Identifica de forma robusta (no por nombre) qué insumo cumple cada rol
  // en la fórmula de mezcla Clefa/Pasta. A lo sumo un insumo por rol.
  @Column({ type: 'enum', enum: ['clefa', 'pasta'], nullable: true })
  rol_formula: RolFormula | null;

  @CreateDateColumn()
  fecha_creacion: Date;

  @UpdateDateColumn()
  fecha_actualizacion: Date;
}
