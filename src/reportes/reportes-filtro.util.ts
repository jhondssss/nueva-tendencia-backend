import { Between, FindOptionsWhere, Like, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Pedido } from '../pedido/entities/pedido.entity';
import { KardexMovimiento } from '../kardex/entities/kardex.entity';
import { PedidoReporteFiltroDto } from './dto/pedido-reporte-filtro.dto';
import { KardexReporteFiltroDto } from './dto/kardex-reporte-filtro.dto';

/** Construye el `where` de TypeORM para los reportes de pedidos a partir de un
 * filtro opcional. Mismo patrón (cliente/producto por Like, rango de fechas con
 * Between/MoreThanOrEqual/LessThanOrEqual) que ya usa PedidoCrudService.findAll
 * y findByClienteId, pero sin atarlo a un cliente_id.
 *
 * `campoFecha` decide sobre qué columna cae el rango `desde`/`hasta`:
 * - 'fecha_creacion' (default): cuándo se creó el pedido — usado por el
 *   reporte general de Pedidos, que incluye pedidos en cualquier estado.
 * - 'fecha_entrega': cuándo se entregó — usado por Pedidos Entregados, para
 *   que coincida con el mismo criterio que Ventas y Ganancias. Es columna
 *   `date` (sin hora), así que el rango se arma con los strings ISO tal cual,
 *   sin pasar por Date/hora local. */
export function buildWherePedidos(
  filtro?: PedidoReporteFiltroDto,
  campoFecha: 'fecha_creacion' | 'fecha_entrega' = 'fecha_creacion',
): FindOptionsWhere<Pedido> {
  if (!filtro) return {};
  const { cliente, producto, categoria, desde, hasta } = filtro;

  const rangoFecha = campoFecha === 'fecha_entrega'
    ? (desde && hasta
        ? Between(desde, hasta)
        : desde
          ? MoreThanOrEqual(desde)
          : hasta
            ? LessThanOrEqual(hasta)
            : undefined)
    : (desde && hasta
        ? Between(new Date(`${desde}T00:00:00`), new Date(`${hasta}T23:59:59.999`))
        : desde
          ? MoreThanOrEqual(new Date(`${desde}T00:00:00`))
          : hasta
            ? LessThanOrEqual(new Date(`${hasta}T23:59:59.999`))
            : undefined);

  return {
    ...(cliente  && { cliente:  { nombre:        Like(`%${cliente}%`)  } }),
    ...(producto && { producto: { nombre_modelo: Like(`%${producto}%`) } }),
    ...(categoria && { categoria }),
    ...(rangoFecha && { [campoFecha]: rangoFecha }),
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
