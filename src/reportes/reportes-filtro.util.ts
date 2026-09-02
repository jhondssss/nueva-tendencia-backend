import { Between, FindOptionsWhere, Like, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Pedido } from '../pedido/entities/pedido.entity';
import { KardexMovimiento } from '../kardex/entities/kardex.entity';
import { PedidoReporteFiltroDto } from './dto/pedido-reporte-filtro.dto';
import { KardexReporteFiltroDto } from './dto/kardex-reporte-filtro.dto';

/** Construye el `where` de TypeORM para los reportes de pedidos a partir de un
 * filtro opcional. Mismo patrón (cliente/producto por Like, rango de fechas con
 * Between/MoreThanOrEqual/LessThanOrEqual) que ya usa PedidoCrudService.findAll
 * y findByClienteId, pero sin atarlo a un cliente_id. */
export function buildWherePedidos(filtro?: PedidoReporteFiltroDto): FindOptionsWhere<Pedido> {
  if (!filtro) return {};
  const { cliente, producto, categoria, desde, hasta } = filtro;

  const rangoFecha =
    desde && hasta
      ? Between(new Date(`${desde}T00:00:00`), new Date(`${hasta}T23:59:59.999`))
      : desde
        ? MoreThanOrEqual(new Date(`${desde}T00:00:00`))
        : hasta
          ? LessThanOrEqual(new Date(`${hasta}T23:59:59.999`))
          : undefined;

  return {
    ...(cliente  && { cliente:  { nombre:        Like(`%${cliente}%`)  } }),
    ...(producto && { producto: { nombre_modelo: Like(`%${producto}%`) } }),
    ...(categoria && { categoria }),
    ...(rangoFecha && { fecha_creacion: rangoFecha }),
  };
}

/** Construye el `where` de TypeORM para el reporte de Kardex de insumos.
 * Fija tipo_registro:'insumo' — el reporte no incluye movimientos de producto,
 * ya que insumo_id/categoria_insumo_id solo tienen sentido para insumos. */
export function buildWhereKardex(filtro?: KardexReporteFiltroDto): FindOptionsWhere<KardexMovimiento> {
  const { insumo_id, tipo, origen, categoria_insumo_id, desde, hasta } = filtro ?? {};

  const rangoFecha =
    desde && hasta
      ? Between(new Date(`${desde}T00:00:00`), new Date(`${hasta}T23:59:59.999`))
      : desde
        ? MoreThanOrEqual(new Date(`${desde}T00:00:00`))
        : hasta
          ? LessThanOrEqual(new Date(`${hasta}T23:59:59.999`))
          : undefined;

  return {
    tipo_registro: 'insumo',
    ...(insumo_id && { insumo: { id_insumo: insumo_id } }),
    ...(tipo && { tipo }),
    ...(origen && { origen }),
    ...(categoria_insumo_id && {
      insumo: { ...(insumo_id ? { id_insumo: insumo_id } : {}), categoria: { id_categoria_insumo: categoria_insumo_id } },
    }),
    ...(rangoFecha && { fecha: rangoFecha }),
  };
}
