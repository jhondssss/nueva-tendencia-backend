import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Pedido } from './entities/pedido.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TelegramService } from '../telegram/telegram.service';
import { KardexService } from '../kardex/kardex.service';
import { IPedidoEstadoService } from './interfaces/pedido.interface';

type EstadoPedido = 'Pendiente' | 'Cortado' | 'Aparado' | 'Solado' | 'Empaque' | 'Terminado';

const ORDEN_ESTADOS: EstadoPedido[] = ['Pendiente', 'Cortado', 'Aparado', 'Solado', 'Empaque', 'Terminado'];

// Litros base de mezcla por docena de pares, repartidos según el % de cada insumo del producto.
const LITROS_POR_DOCENA = 0.5;

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

    const esConsumoSolado    = pedido.estado === 'Aparado' && nuevoEstado === 'Solado';
    const esReversionSolado  = pedido.estado === 'Solado' && nuevoEstado === 'Aparado';

    if (esConsumoSolado) {
      await this.consumirFormulaMezcla(pedido);
    } else if (esReversionSolado) {
      await this.revertirFormulaMezcla(pedido);
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
  // Fórmula de mezcla Clefa/Pasta — consumo al entrar a Solado
  // ══════════════════════════════════════════════════════════════════════════

  private async consumirFormulaMezcla(pedido: Pedido): Promise<void> {
    const producto = pedido.producto;
    const clefaPct = producto?.porcentaje_clefa;
    const pastaPct = producto?.porcentaje_pasta;

    const sinFormula =
      clefaPct === null || clefaPct === undefined ||
      pastaPct === null || pastaPct === undefined ||
      (Number(clefaPct) === 0 && Number(pastaPct) === 0);

    if (sinFormula) {
      throw new BadRequestException(
        `El producto "${producto?.nombre_modelo ?? pedido.id_pedido}" no tiene fórmula de mezcla configurada ` +
        `(% Clefa/Pasta). Configurala antes de pasar a Solado.`,
      );
    }

    const docenas = pedido.cantidad_pares / 12;
    const litrosClefa = this.round2(docenas * LITROS_POR_DOCENA * Number(clefaPct) / 100);
    const litrosPasta = this.round2(docenas * LITROS_POR_DOCENA * Number(pastaPct) / 100);

    const [insumoClefa, insumoPasta] = await Promise.all([
      this.insumoRepo.findOneBy({ rol_formula: 'clefa' }),
      this.insumoRepo.findOneBy({ rol_formula: 'pasta' }),
    ]);

    const faltantes: string[] = [];
    if (!insumoClefa) faltantes.push('clefa');
    if (!insumoPasta) faltantes.push('pasta');
    if (faltantes.length > 0) {
      throw new BadRequestException(
        `No hay insumo configurado con rol '${faltantes.join("', '")}'. ` +
        `Configuralo en el módulo de Insumos.`,
      );
    }

    const faltaStock: string[] = [];
    if (Number(insumoClefa!.stock) < litrosClefa) {
      faltaStock.push(`${this.round2(litrosClefa - Number(insumoClefa!.stock))}L de Clefa`);
    }
    if (Number(insumoPasta!.stock) < litrosPasta) {
      faltaStock.push(`${this.round2(litrosPasta - Number(insumoPasta!.stock))}L de Pasta`);
    }
    if (faltaStock.length > 0) {
      throw new BadRequestException(
        `Stock insuficiente para pasar a Solado. Falta ${faltaStock.join(' y ')}.`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Pedido, pedido.id_pedido, { estado: 'Solado', fecha_actualizacion: new Date() });

      const motivo = `Consumo automático fórmula mezcla (Solado) - Pedido #${pedido.id_pedido}`;

      await this.kardexService.registrarMovimientoInsumoTx(manager, {
        insumo_id: insumoClefa!.id_insumo,
        tipo: 'salida',
        cantidad: litrosClefa,
        origen: 'automatico',
        pedido_id: pedido.id_pedido,
        motivo,
      });

      await this.kardexService.registrarMovimientoInsumoTx(manager, {
        insumo_id: insumoPasta!.id_insumo,
        tipo: 'salida',
        cantidad: litrosPasta,
        origen: 'automatico',
        pedido_id: pedido.id_pedido,
        motivo,
      });
    });

    void this.auditoriaService.registrar({
      accion: 'SALIDA_AUTO',
      modulo: 'insumos',
      descripcion: `Consumo automático: ${litrosClefa}L Clefa, ${litrosPasta}L Pasta — Pedido #${pedido.id_pedido} (Solado)`,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Fórmula de mezcla Clefa/Pasta — reversión al retroceder desde Solado
  // ══════════════════════════════════════════════════════════════════════════

  private async revertirFormulaMezcla(pedido: Pedido): Promise<void> {
    const [insumoClefa, insumoPasta] = await Promise.all([
      this.insumoRepo.findOneBy({ rol_formula: 'clefa' }),
      this.insumoRepo.findOneBy({ rol_formula: 'pasta' }),
    ]);

    const revertidos: string[] = [];

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Pedido, pedido.id_pedido, { estado: 'Aparado', fecha_actualizacion: new Date() });

      const insumosPorRol: Array<{ nombre: string; insumo: Insumo | null }> = [
        { nombre: 'Clefa', insumo: insumoClefa },
        { nombre: 'Pasta', insumo: insumoPasta },
      ];

      for (const { nombre, insumo } of insumosPorRol) {
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
          motivo: `Reversión automática fórmula mezcla - Pedido #${pedido.id_pedido}`,
        });
        await this.kardexService.marcarRevertidoTx(manager, consumo.id_movimiento);
        revertidos.push(`${consumo.cantidad}L ${nombre}`);
      }
    });

    void this.auditoriaService.registrar({
      accion: 'ENTRADA_AUTO',
      modulo: 'insumos',
      descripcion: revertidos.length > 0
        ? `Reversión automática: ${revertidos.join(', ')} — Pedido #${pedido.id_pedido} (retrocedido a Aparado)`
        : `Retroceso de pedido #${pedido.id_pedido} desde Solado sin movimiento automático que revertir`,
    });
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
