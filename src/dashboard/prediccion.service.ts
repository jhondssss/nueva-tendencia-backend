import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

    const pedidos = await this.pedidoRepo.find({ relations: ['producto'] });

    const pedidosFiltrados = pedidos.filter(p =>
      p.estado === 'Terminado' &&
      String(p.fecha_entrega) >= inicioMes &&
      String(p.fecha_entrega) <= finMes,
    );

    const resumen: Record<string, {
      nombre: string;
      mes: string;
      cantidad: number;
      cantidad_pares: number;
      total: number;
    }> = {};

    pedidosFiltrados.forEach(p => {
      const partes   = String(p.fecha_entrega).split('-');
      const fecha    = new Date(
        Number(partes[0]),
        Number(partes[1]) - 1,
        Number(partes[2]),
      );
      const mesLabel = fecha.toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });
      const key      = `${p.producto?.id_producto}-${mesLabel}`;

      if (!resumen[key]) {
        resumen[key] = {
          nombre:         p.producto?.nombre_modelo ?? 'Desconocido',
          mes:            mesLabel,
          cantidad:       0,
          cantidad_pares: 0,
          total:          0,
        };
      }
      resumen[key].cantidad        += 1;
      resumen[key].cantidad_pares  += p.cantidad_pares ?? 0;
      resumen[key].total           += Number(p.total);
    });

    return Object.values(resumen)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);
  }

  async getVentasPorMes() {
    const pedidos = await this.pedidoRepo.find({ where: { estado: 'Terminado' } });
    const resumen: Record<string, number> = {};

    pedidos.forEach(p => {
      const [year, month] = String(p.fecha_entrega).split('-');
      const key = `${year}-${month}`;
      resumen[key] = (resumen[key] || 0) + Math.round(Number(p.total ?? 0) * 100) / 100;
    });

    return Object.entries(resumen)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, total]) => ({ mes, total: Math.round(total * 100) / 100 }));
  }

  async getPrediccionStock() {
    const productos = await this.productoRepo.find();
    const pedidos   = await this.pedidoRepo.find({ relations: ['producto'] });

    return productos.map(p => {
      const pedidosProducto = pedidos.filter(ped => ped.producto?.id_producto === p.id_producto);
      const demandaMensual  = pedidosProducto.length / 3;
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
