import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Producto } from '../producto/entities/producto.entity';
import { IPrediccionService } from './interfaces/dashboard.interface';

@Injectable()
export class PrediccionService implements IPrediccionService {
  constructor(
    @InjectRepository(Pedido)   private readonly pedidoRepo:   Repository<Pedido>,
    @InjectRepository(Producto) private readonly productoRepo: Repository<Producto>,
  ) {}

  async getTopProductos() {
    const ahora        = new Date();
    const ahoraBolivia = new Date(ahora.getTime() - 4 * 60 * 60 * 1000);
    const anio         = ahoraBolivia.getUTCFullYear();
    const mes          = ahoraBolivia.getUTCMonth(); // 0-indexed

    const inicioMes = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
    const lastDay   = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    const finMes    = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const mesLabel  = new Date(anio, mes, 1).toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });

    const rows = await this.pedidoRepo
      .createQueryBuilder('p')
      .leftJoin('p.producto', 'producto')
      .select('producto.id_producto', 'id_producto')
      .addSelect('producto.nombre_modelo', 'nombre')
      .addSelect('COUNT(*)', 'cantidad')
      .addSelect('COALESCE(SUM(p.cantidad_pares), 0)', 'cantidad_pares')
      .addSelect('COALESCE(SUM(p.total), 0)', 'total')
      .where('p.estado = :terminado', { terminado: 'Terminado' })
      .andWhere('p.fecha_entrega BETWEEN :inicio AND :fin', { inicio: inicioMes, fin: finMes })
      .groupBy('producto.id_producto')
      .addGroupBy('producto.nombre_modelo')
      .orderBy('cantidad', 'DESC')
      .limit(10)
      .getRawMany();

    return rows.map(r => ({
      nombre:         r.nombre ?? 'Desconocido',
      mes:            mesLabel,
      cantidad:       Number(r.cantidad),
      cantidad_pares: Number(r.cantidad_pares),
      total:          Math.round(Number(r.total) * 100) / 100,
    }));
  }

  async getVentasPorMes() {
    const rows = await this.pedidoRepo
      .createQueryBuilder('p')
      .select(`TO_CHAR(p.fecha_entrega, 'YYYY-MM')`, 'mes')
      .addSelect('COALESCE(SUM(p.total), 0)', 'total')
      .where('p.estado = :terminado', { terminado: 'Terminado' })
      .groupBy(`TO_CHAR(p.fecha_entrega, 'YYYY-MM')`)
      .orderBy('mes', 'ASC')
      .getRawMany();

    return rows.map(r => ({
      mes:   r.mes,
      total: Math.round(Number(r.total) * 100) / 100,
    }));
  }

  async getPrediccionStock() {
    const MESES_VENTANA = 3;
    const fechaLimite = new Date();
    fechaLimite.setMonth(fechaLimite.getMonth() - MESES_VENTANA);

    const productos = await this.productoRepo.find();
    const pedidos   = await this.pedidoRepo.find({
      relations: ['producto'],
      where: { fecha_creacion: MoreThanOrEqual(fechaLimite) },
    });

    return productos.map(p => {
      const pedidosProducto = pedidos.filter(ped => ped.producto?.id_producto === p.id_producto);
      const demandaMensual  = pedidosProducto.length / MESES_VENTANA;
      const semanasRestantes = demandaMensual > 0
        ? Math.round((p.stock / demandaMensual) * 4 * 10) / 10
        : null;

      return {
        id:               p.id_producto,
        nombre:           p.nombre_modelo,
        stock:            p.stock,
        nivel_minimo:     p.nivel_minimo,
        demanda_mensual:  Math.round(demandaMensual * 10) / 10,
        semanas_restantes: semanasRestantes,
        alerta:           p.stock <= p.nivel_minimo,
      };
    });
  }
}
