import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { KardexMovimiento } from '../kardex/entities/kardex.entity';
import { Auditoria } from '../auditoria/entities/auditoria.entity';
import { IReporteDiario, ResumenDiario } from './interfaces/reporte.interface';

@Injectable()
export class DiarioService implements IReporteDiario {
  constructor(
    @InjectRepository(Pedido)           private pedidoRepo:    Repository<Pedido>,
    @InjectRepository(Producto)         private productoRepo:  Repository<Producto>,
    @InjectRepository(Insumo)           private insumoRepo:    Repository<Insumo>,
    @InjectRepository(KardexMovimiento) private kardexRepo:    Repository<KardexMovimiento>,
    @InjectRepository(Auditoria)        private auditoriaRepo: Repository<Auditoria>,
  ) {}

  async getResumenDiario(): Promise<ResumenDiario> {
    // Fecha local Bolivia (UTC-4): evita que el reporte cambie de día a las 20:00 h si el servidor corre en UTC
    const ahora  = new Date();
    const local  = new Date(ahora.getTime() + (-4 * 60) * 60000);
    const fecha  = local.toISOString().slice(0, 10); // 'YYYY-MM-DD' en hora boliviana
    const start  = new Date(`${fecha}T00:00:00.000`);
    const end    = new Date(`${fecha}T23:59:59.999`);

    console.log('FECHA HOY:', fecha);
    console.log('START:', start.toISOString());
    console.log('END:', end.toISOString());

    // ── Pedidos ──────────────────────────────────────────────────────────────

    const pedidosCreados = await this.pedidoRepo.find({
      where: { fecha_creacion: Between(start, end) },
      relations: ['cliente', 'producto'],
    });
    console.log('PEDIDOS CREADOS HOY:', pedidosCreados.length);

    const pedidosMovidos = await this.pedidoRepo.find({
      where: { fecha_actualizacion: Between(start, end) },
      relations: ['cliente', 'producto'],
    });
    console.log('PEDIDOS MOVIDOS HOY:', pedidosMovidos.length);

    const pedidosTerminados = await this.pedidoRepo.find({
      where: { estado: 'Terminado', fecha_actualizacion: Between(start, end) },
      relations: ['cliente', 'producto'],
    });

    const ventasDia = pedidosTerminados.reduce((sum, p) => sum + Number(p.total), 0);

    // ── Kardex ───────────────────────────────────────────────────────────────

    const movimientosKardex = await this.kardexRepo.find({
      where: { fecha: Between(start, end) },
      relations: ['producto', 'insumo'],
      order: { fecha: 'ASC' },
    });

    // ── Auditoría ────────────────────────────────────────────────────────────

    const accionesAuditoria = await this.auditoriaRepo.find({
      where: { fecha: Between(start, end) },
      relations: ['usuario'],
      order: { fecha: 'ASC' },
    });

    // ── Alertas de stock ─────────────────────────────────────────────────────

    const alertasStock = await this.productoRepo
      .createQueryBuilder('p')
      .where('p.stock <= p.nivel_minimo')
      .getMany();

    const alertasInsumos = await this.insumoRepo
      .createQueryBuilder('i')
      .where('i.stock <= i.nivel_minimo')
      .getMany();

    console.log('ALERTAS PRODUCTOS:', JSON.stringify(alertasStock));
    console.log('ALERTAS INSUMOS:', JSON.stringify(alertasInsumos));
    console.log('LOG ACTIVIDAD:', JSON.stringify(accionesAuditoria));

    // ── Resumen ejecutivo ─────────────────────────────────────────────────────

    return {
      fecha,
      pedidosCreados,
      pedidosMovidos,
      pedidosTerminados,
      ventasDia,
      movimientosKardex,
      accionesAuditoria,
      alertasStock,
      alertasInsumos,
      resumen: {
        totalPedidosCreados:     pedidosCreados.length,
        totalPedidosMovidos:     pedidosMovidos.length,
        totalVentasDia:          ventasDia,
        totalMovimientosKardex:  movimientosKardex.length,
        totalAlertasCriticas:    alertasStock.length + alertasInsumos.length,
      },
    };
  }
}
