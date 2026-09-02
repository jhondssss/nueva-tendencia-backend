import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pedido } from './entities/pedido.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TelegramService } from '../telegram/telegram.service';
import { IPedidoEstadoService } from './interfaces/pedido.interface';

type EstadoPedido = 'Pendiente' | 'Cortado' | 'Aparado' | 'Solado' | 'Empaque' | 'Terminado';

const ORDEN_ESTADOS: EstadoPedido[] = ['Pendiente', 'Cortado', 'Aparado', 'Solado', 'Empaque', 'Terminado'];

@Injectable()
export class PedidoEstadoService implements IPedidoEstadoService {
  constructor(
    @InjectRepository(Pedido) private readonly pedidoRepo: Repository<Pedido>,
    private readonly auditoriaService: AuditoriaService,
    private readonly telegramService: TelegramService,
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

    await this.pedidoRepo.update(id, { estado: nuevoEstado, fecha_actualizacion: new Date() });

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
}
