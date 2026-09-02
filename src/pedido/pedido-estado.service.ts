import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Pedido } from './entities/pedido.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TelegramService } from '../telegram/telegram.service';
import { KardexService } from '../kardex/kardex.service';
import { IPedidoEstadoService } from './interfaces/pedido.interface';

type EstadoPedido = 'Pendiente' | 'Cortado' | 'Aparado' | 'Solado' | 'Empaque' | 'Terminado';

const ORDEN_ESTADOS: EstadoPedido[] = ['Pendiente', 'Cortado', 'Aparado', 'Solado', 'Empaque', 'Terminado'];

type EtapaConReceta = 'Cortado' | 'Aparado' | 'Solado' | 'Empaque';

type CampoReceta =
  | 'cuero_pies'
  | 'clefa_aparado_litros'
  | 'pasta_solado_litros'
  | 'clefa_solado_litros'
  | 'pvc_solado_litros'
  | 'clefa_empaque_litros'
  | 'esponja_empaque_hojas';

interface RecetaItem {
  nombreInsumo: string;
  campoProducto: CampoReceta;
  buscarInsumo: (repo: Repository<Insumo>) => Promise<Insumo | null>;
}

function buscarPorNombre(repo: Repository<Insumo>, nombre: string): Promise<Insumo | null> {
  return repo
    .createQueryBuilder('i')
    .where('LOWER(TRIM(i.nombre)) = LOWER(:nombre)', { nombre })
    .getOne();
}

// Receta de consumo automático por docena, una por etapa del Kanban (Fase 2/3).
// Cuero/Esponja/PVC se identifican por nombre único (no tienen rol_formula: ese enum
// sigue limitado a 'clefa' | 'pasta'); Clefa/Pasta se identifican por rol_formula.
// PVC se consume en Solado de forma independiente de Pasta/Clefa (Fase 3): no hay
// relación de porcentaje entre los tres, cada uno se valida y descuenta por separado.
const RECETAS: Record<EtapaConReceta, RecetaItem[]> = {
  Cortado: [
    { nombreInsumo: 'Cuero', campoProducto: 'cuero_pies', buscarInsumo: (r) => buscarPorNombre(r, 'Cuero') },
  ],
  Aparado: [
    { nombreInsumo: 'Clefa', campoProducto: 'clefa_aparado_litros', buscarInsumo: (r) => r.findOneBy({ rol_formula: 'clefa' }) },
  ],
  Solado: [
    { nombreInsumo: 'Pasta', campoProducto: 'pasta_solado_litros', buscarInsumo: (r) => r.findOneBy({ rol_formula: 'pasta' }) },
    { nombreInsumo: 'Clefa', campoProducto: 'clefa_solado_litros', buscarInsumo: (r) => r.findOneBy({ rol_formula: 'clefa' }) },
    { nombreInsumo: 'PVC', campoProducto: 'pvc_solado_litros', buscarInsumo: (r) => buscarPorNombre(r, 'PVC') },
  ],
  Empaque: [
    { nombreInsumo: 'Clefa', campoProducto: 'clefa_empaque_litros', buscarInsumo: (r) => r.findOneBy({ rol_formula: 'clefa' }) },
    { nombreInsumo: 'Esponja', campoProducto: 'esponja_empaque_hojas', buscarInsumo: (r) => buscarPorNombre(r, 'Esponja') },
  ],
};

@Injectable()
export class PedidoEstadoService implements IPedidoEstadoService {
  constructor(
    @InjectRepository(Pedido) private readonly pedidoRepo: Repository<Pedido>,
    @InjectRepository(Insumo) private readonly insumoRepo: Repository<Insumo>,
    private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
    private readonly telegramService: TelegramService,
    private readonly kardexService: KardexService,
  ) {}

  async moverEstado(id: number, nuevoEstado: EstadoPedido, userRole?: string) {
    const pedido = await this.pedidoRepo.findOne({ where: { id_pedido: id }, relations: ['cliente', 'producto'] });

    if (!pedido) throw new BadRequestException(`Pedido #${id} no encontrado`);

    const idxActual = ORDEN_ESTADOS.indexOf(pedido.estado as EstadoPedido);
    const idxNuevo  = ORDEN_ESTADOS.indexOf(nuevoEstado);
    const diff = idxNuevo - idxActual;

    if (diff === 0) {
      throw new BadRequestException(`El pedido #${id} ya está en estado "${pedido.estado}"`);
    }

    if (diff > 1) {
      throw new BadRequestException(
        `Solo se puede avanzar al siguiente estado. ` +
        `Estado actual: "${pedido.estado}" → siguiente: "${ORDEN_ESTADOS[idxActual + 1]}"`,
      );
    }

    if (diff < -1) {
      throw new BadRequestException(
        `No se puede retroceder más de un paso a la vez. ` +
        `Estado actual: "${pedido.estado}" → anterior: "${ORDEN_ESTADOS[idxActual - 1]}"`,
      );
    }

    if (diff === -1 && userRole !== 'admin') {
      throw new ForbiddenException('Solo un administrador puede retroceder el estado de un pedido');
    }

    const recetaAvance = RECETAS[nuevoEstado as EtapaConReceta];
    const recetaRetroceso = RECETAS[pedido.estado as EtapaConReceta];

    if (diff === 1 && recetaAvance) {
      await this.consumirReceta(pedido, nuevoEstado as EtapaConReceta, recetaAvance);
    } else if (diff === -1 && recetaRetroceso) {
      await this.revertirReceta(pedido, pedido.estado as EtapaConReceta, nuevoEstado, recetaRetroceso);
    } else {
      await this.pedidoRepo.update(id, { estado: nuevoEstado, fecha_actualizacion: new Date() });
    }

    if (nuevoEstado === 'Terminado') {
      const caption =
        `✅ Pedido #${id} listo para entregar\n` +
        `Cliente: ${pedido.cliente?.nombre ?? 'N/A'}\n` +
        `Producto: ${pedido.producto?.nombre_modelo ?? 'N/A'}`;
      const imagenUrl: string | undefined = (pedido.producto as any)?.imagen_url;
      if (imagenUrl) {
        this.telegramService.sendPhoto(imagenUrl, caption).catch(() => {});
      } else {
        this.telegramService.sendMessage(caption).catch(() => {});
      }
    }

    void this.auditoriaService.registrar({
      accion: 'MOVER',
      modulo: 'pedidos',
      descripcion: `Movió pedido #${id} a estado ${nuevoEstado}`,
    });

    return this.pedidoRepo.findOne({
      where: { id_pedido: id },
      relations: ['cliente', 'producto'],
    });
  }

  async getKanban() {
    const pedidos = await this.pedidoRepo.find({ relations: ['cliente', 'producto'] });

    const buckets: Record<EstadoPedido, Pedido[]> = {
      Pendiente: [], Cortado: [], Aparado: [], Solado: [], Empaque: [], Terminado: [],
    };
    for (const p of pedidos) {
      buckets[p.estado as EstadoPedido]?.push(p);
    }
    return buckets;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Receta de producción por etapa — consumo automático al avanzar (Fase 2)
  // ══════════════════════════════════════════════════════════════════════════

  private async consumirReceta(pedido: Pedido, etapa: EtapaConReceta, receta: RecetaItem[]): Promise<void> {
    const producto = pedido.producto as Producto | undefined;
    const docenas = pedido.cantidad_pares / 12;

    const faltanConfig: string[] = [];
    const cantidades = new Map<RecetaItem, number>();

    for (const item of receta) {
      const valor = producto?.[item.campoProducto];
      if (valor === null || valor === undefined) {
        faltanConfig.push(item.nombreInsumo);
      } else {
        cantidades.set(item, this.round2(docenas * Number(valor)));
      }
    }

    if (faltanConfig.length > 0) {
      throw new BadRequestException(
        `Este producto no tiene configurada la cantidad de ${faltanConfig.join(', ')} para ${etapa} ` +
        `— configurala en la ficha del producto antes de continuar.`,
      );
    }

    const insumosPorItem = new Map<RecetaItem, Insumo>();
    const faltanInsumo: string[] = [];
    await Promise.all(
      receta.map(async (item) => {
        const insumo = await item.buscarInsumo(this.insumoRepo);
        if (!insumo) {
          faltanInsumo.push(item.nombreInsumo);
        } else {
          insumosPorItem.set(item, insumo);
        }
      }),
    );

    if (faltanInsumo.length > 0) {
      throw new BadRequestException(
        `No hay insumo configurado para '${faltanInsumo.join("', '")}'. Configuralo en el módulo de Insumos.`,
      );
    }

    const faltaStock: string[] = [];
    for (const item of receta) {
      const necesaria = cantidades.get(item)!;
      const insumo = insumosPorItem.get(item)!;
      if (Number(insumo.stock) < necesaria) {
        faltaStock.push(`${this.round2(necesaria - Number(insumo.stock))} de ${item.nombreInsumo}`);
      }
    }
    if (faltaStock.length > 0) {
      throw new BadRequestException(
        `Stock insuficiente para pasar a ${etapa}. Falta ${faltaStock.join(' y ')}.`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Pedido, pedido.id_pedido, { estado: etapa, fecha_actualizacion: new Date() });

      const motivo = `Consumo automático etapa ${etapa} - Pedido #${pedido.id_pedido}`;

      for (const item of receta) {
        const insumo = insumosPorItem.get(item)!;
        await this.kardexService.registrarMovimientoInsumoTx(manager, {
          insumo_id: insumo.id_insumo,
          tipo: 'salida',
          cantidad: cantidades.get(item)!,
          origen: 'automatico',
          pedido_id: pedido.id_pedido,
          motivo,
        });
      }
    });

    const detalle = receta.map((item) => `${cantidades.get(item)} ${item.nombreInsumo}`).join(', ');
    void this.auditoriaService.registrar({
      accion: 'SALIDA_AUTO',
      modulo: 'insumos',
      descripcion: `Consumo automático: ${detalle} — Pedido #${pedido.id_pedido} (${etapa})`,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Receta de producción por etapa — reversión al retroceder (Fase 2)
  // ══════════════════════════════════════════════════════════════════════════

  private async revertirReceta(
    pedido: Pedido,
    etapaQueSeAbandona: EtapaConReceta,
    estadoDestino: EstadoPedido,
    receta: RecetaItem[],
  ): Promise<void> {
    const revertidos: string[] = [];

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Pedido, pedido.id_pedido, { estado: estadoDestino, fecha_actualizacion: new Date() });

      for (const item of receta) {
        const insumo = await item.buscarInsumo(this.insumoRepo);
        if (!insumo) continue;

        const consumo = await this.kardexService.buscarUltimoConsumoAutomaticoNoRevertido(
          manager, pedido.id_pedido, insumo.id_insumo,
        );
        if (!consumo) continue;

        await this.kardexService.registrarMovimientoInsumoTx(manager, {
          insumo_id: insumo.id_insumo,
          tipo: 'entrada',
          cantidad: Number(consumo.cantidad),
          origen: 'automatico',
          pedido_id: pedido.id_pedido,
          motivo: `Reversión automática etapa ${etapaQueSeAbandona} - Pedido #${pedido.id_pedido}`,
        });
        await this.kardexService.marcarRevertidoTx(manager, consumo.id_movimiento);
        revertidos.push(`${consumo.cantidad} ${item.nombreInsumo}`);
      }
    });

    void this.auditoriaService.registrar({
      accion: 'ENTRADA_AUTO',
      modulo: 'insumos',
      descripcion: revertidos.length > 0
        ? `Reversión automática: ${revertidos.join(', ')} — Pedido #${pedido.id_pedido} (retrocedido a ${estadoDestino})`
        : `Retroceso de pedido #${pedido.id_pedido} desde ${etapaQueSeAbandona} sin movimiento automático que revertir`,
    });
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
