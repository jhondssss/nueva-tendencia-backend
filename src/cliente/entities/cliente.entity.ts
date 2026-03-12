import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Pedido } from '../../pedido/entities/pedido.entity';

@Entity()
export class Cliente {
  @PrimaryGeneratedColumn()
  id_cliente: number;

  @Column()
  tipo_cliente: string;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  apellido: string;

  @Column({ nullable: true })
  nombre_completo: string;

  @Column({ nullable: true })
  documento_identidad: string;

  @Column()
  correo_electronico: string;

  @Column()
  telefono_principal: string;

  @Column({ nullable: true })
  telefono_alternativo: string;

  @Column()
  direccion_calle: string;

  @Column()
  direccion_colonia: string;

  @Column()
  ciudad: string;

  @Column()
  estado_provincia: string;

  @Column()
  codigo_postal: string;

  @Column()
  pais: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha_registro: Date;

  @Column({ default: true })
  activo: boolean;

  @OneToMany(() => Pedido, (pedido) => pedido.cliente)
  pedidos: Pedido[];
}
