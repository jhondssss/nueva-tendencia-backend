import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Insumo }   from '../insumo/entities/insumo.entity';
import { IKpiService } from './interfaces/dashboard.interface';

const ESTADOS = ['Pendiente', 'Cortado', 'Aparado', 'Solado', 'Empaque', 'Terminado'];

@Injectable()
export class KpiService implements IKpiService {
  constructor(
    @InjectRepository(Pedido)   private readonly pedidoRepo:   Repository<Pedido>,
    @InjectRepository(Producto) private readonly productoRepo: Repository<Producto>,
    @InjectRepository(Insumo)   private readonly insumoRepo:   Repository<Insumo>,
  ) {}

  private rangoMesActualBolivia() {
    const ahoraBolivia = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const anio = ahoraBolivia.getUTCFullYear();
    const mes  = ahoraBolivia.getUTCMonth();

    const inicioMes = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
    const lastDay   = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    const finMes    = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    return { inicioMes, finMes };
  }

  private async getEstadoCounts(): Promise<Map<string, number>> {
    const rows = await this.pedidoRepo
      .createQueryBuilder('p')
      .select('p.estado', 'estado')
      .addSelect('COUNT(*)', 'cantidad')
      .groupBy('p.estado')
      .getRawMany();

    return new Map(rows.map(r => [r.estado, Number(r.cantidad)]));
  }

  async getKpis() {
    const { inicioMes, finMes } = this.rangoMesActualBolivia();

    const [
      totalPedidos,
      ventasYProduccion,
      itemsInventario,
      alertasStock,
      alertasInsumos,
    ] = await Promise.all([
      this.pedidoRepo
        .createQueryBuilder('p')
        .where(`(p.fecha_creacion - INTERVAL '4 hours')::date BETWEEN :inicio AND :fin`, {
          inicio: inicioMes,
          fin: finMes,
        })
        .getCount(),
      this.pedidoRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.total), 0)', 'totalVentas')
        .addSelect('COALESCE(SUM(p.cantidad_pares), 0)', 'produccionMensual')
        .where('p.estado = :terminado', { terminado: 'Terminado' })
        .andWhere(`(p.fecha_actualizacion - INTERVAL '4 hours')::date BETWEEN :inicio AND :fin`, {
          inicio: inicioMes,
          fin: finMes,
        })
        .getRawOne(),
      this.productoRepo.count({ where: { activo: true } }),
      this.productoRepo
        .createQueryBuilder('p')
        .where('p.stock <= p.nivel_minimo')
        .getCount(),
      this.insumoRepo
        .createQueryBuilder('i')
        .where('i.activo = true')
        .andWhere('i.stock <= i.nivel_minimo')
        .getCount(),
    ]);

    return {
      totalVentas: Math.round(Number(ventasYProduccion.totalVentas) * 100) / 100,
      totalPedidos,
      itemsInventario,
      alertasStock,
      alertasInsumos,
      produccionMensual: Number(ventasYProduccion.produccionMensual),
    };
  }

  async getOrdersStatus() {
    const counts = await this.getEstadoCounts();
    return ESTADOS.map(estado => ({ estado, cantidad: counts.get(estado) ?? 0 }));
  }

  async getProductionFunnel() {
    const counts = await this.getEstadoCounts();
    return ESTADOS.map(etapa => ({ etapa, cantidad: counts.get(etapa) ?? 0 }));
  }

  async getProximosAEntregar() {
    const hoy     = new Date();
    const en7dias = new Date(hoy);
    en7dias.setDate(hoy.getDate() + 7);

    const hoyStr     = hoy.toISOString().slice(0, 10);
    const en7diasStr = en7dias.toISOString().slice(0, 10);

    const pedidos = await this.pedidoRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.cliente', 'cliente')
      .leftJoinAndSelect('p.producto', 'producto')
      .where('p.estado != :terminado', { terminado: 'Terminado' })
      .andWhere('p.fecha_entrega >= :hoy',     { hoy: hoyStr })
      .andWhere('p.fecha_entrega <= :en7dias', { en7dias: en7diasStr })
      .orderBy('p.fecha_entrega', 'ASC')
      .getMany();

    return pedidos.map(p => ({
      id:             p.id_pedido,
      cliente:        p.cliente?.nombre ?? 'Cliente',
      producto:       p.producto?.nombre_modelo ?? '—',
      fecha_entrega:  p.fecha_entrega,
      estado:         p.estado,
      cantidad_pares: p.cantidad_pares ?? 0,
    }));
  }

  async getRecentActivity() {
    const pedidos = await this.pedidoRepo.find({
      order: { fecha_actualizacion: 'DESC' },
      relations: ['cliente'],
      take: 10,
    });

    return pedidos.map(p => {
      const nombreCliente = p.cliente?.nombre ?? 'Cliente';
      const descripcion   = p.estado === 'Pendiente'
        ? `Pedido #${p.id_pedido} de ${nombreCliente} creado`
        : `Pedido #${p.id_pedido} de ${nombreCliente} → ${p.estado}`;

      return {
        id:          p.id_pedido,
        descripcion,
        cliente:     nombreCliente,
        estado:      p.estado,
        fecha:       p.fecha_actualizacion.toISOString(),
      };
    });
  }
}
