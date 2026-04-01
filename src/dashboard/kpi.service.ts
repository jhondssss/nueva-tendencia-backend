import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Producto } from '../producto/entities/producto.entity';
import { IKpiService } from './interfaces/dashboard.interface';

@Injectable()
export class KpiService implements IKpiService {
  constructor(
    @InjectRepository(Pedido)   private readonly pedidoRepo:   Repository<Pedido>,
    @InjectRepository(Producto) private readonly productoRepo: Repository<Producto>,
  ) {}

  async getKpis() {
    const ahora        = new Date();
    const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const anio         = ahora.getFullYear();
    const mes          = ahora.getMonth();

    const inicioMes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-01`;
    const finMes    = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).toISOString().split('T')[0];

    const [pedidos, productos, totalPedidos, itemsInventario] = await Promise.all([
      this.pedidoRepo.find(),
      this.productoRepo.find(),
      this.pedidoRepo
        .createQueryBuilder('p')
        .where('p.fecha_entrega >= :inicio', { inicio: inicioMes })
        .andWhere('p.fecha_entrega <= :fin',  { fin: finMes })
        .getCount(),
      this.productoRepo.count({ where: { activo: true } }),
    ]);

    console.log('QUERY INICIO MES:', inicioMes);
    console.log('TOTAL PEDIDOS RESULTADO:', totalPedidos);

    const muestra = await this.pedidoRepo
      .createQueryBuilder('p')
      .select(['p.id_pedido', 'p.fecha_creacion'])
      .orderBy('p.id_pedido', 'ASC')
      .limit(5)
      .getRawMany();
    console.log('MUESTRA FECHAS:', JSON.stringify(muestra));

    const pedidosTerminados = pedidos.filter(p =>
      p.estado === 'Terminado' &&
      String(p.fecha_entrega).slice(0, 10) >= inicioMes &&
      String(p.fecha_entrega).slice(0, 10) <= finMes
    );
    const totalVentas = Math.round(
      pedidosTerminados.reduce((acc, p) => acc + Number(p.total), 0) * 100
    ) / 100;
    const alertasStock = productos.filter(p => p.stock <= 5).length;
    const produccionMensual = pedidos
      .filter(p => {
        const fe = String(p.fecha_entrega).slice(0, 10);
        return p.estado === 'Terminado' && fe >= inicioMes && fe <= finMes;
      })
      .reduce((acc, p) => acc + (p.cantidad_pares ?? 0), 0);

    return { totalVentas, totalPedidos, itemsInventario, alertasStock, produccionMensual };
  }

  async getOrdersStatus() {
    const pedidos = await this.pedidoRepo.find();
    const estados = ['Pendiente', 'Cortado', 'Aparado', 'Solado', 'Empaque', 'Terminado'];

    return estados.map(estado => ({
      estado,
      cantidad: pedidos.filter(p => p.estado === estado).length,
    }));
  }

  async getProductionFunnel() {
    const pedidos = await this.pedidoRepo.find();
    const etapas  = ['Pendiente', 'Cortado', 'Aparado', 'Solado', 'Empaque', 'Terminado'];

    return etapas.map(etapa => ({
      etapa,
      cantidad: pedidos.filter(p => p.estado === etapa).length,
    }));
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

    console.log('PROXIMOS:', JSON.stringify(pedidos.map(p => ({
      id: p.id_pedido,
      cliente: p.cliente?.nombre,
      producto: p.producto?.nombre_modelo
    }))));

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
