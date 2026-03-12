import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pedido } from './entities/pedido.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { IPedidoEstadoService } from './interfaces/pedido.interface';

type EstadoPedido = 'Pendiente' | 'Cortado' | 'Aparado' | 'Solado' | 'Empaque' | 'Terminado';

const ORDEN_ESTADOS: EstadoPedido[] = ['Pendiente', 'Cortado', 'Aparado', 'Solado', 'Empaque', 'Terminado'];

@Injectable()
export class PedidoEstadoService implements IPedidoEstadoService {
  constructor(
    @InjectRepository(Pedido) private readonly pedidoRepo: Repository<Pedido>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async moverEstado(id: number, nuevoEstado: EstadoPedido) {
    const pedido = await this.pedidoRepo.findOne({ where: { id_pedido: id } });

    if (!pedido) throw new BadRequestException(`Pedido #${id} no encontrado`);

    const idxActual = ORDEN_ESTADOS.indexOf(pedido.estado as EstadoPedido);
    const idxNuevo  = ORDEN_ESTADOS.indexOf(nuevoEstado);

    if (idxNuevo <= idxActual) {
      throw new BadRequestException(
        `No se puede retroceder el estado. Estado actual: "${pedido.estado}". ` +
        `Solo se puede avanzar al estado "${ORDEN_ESTADOS[idxActual + 1] ?? 'ninguno (ya es Terminado)'}"`,
      );
    }

    if (idxNuevo !== idxActual + 1) {
      throw new BadRequestException(
        `Solo se puede avanzar al siguiente estado. ` +
        `Estado actual: "${pedido.estado}" → siguiente: "${ORDEN_ESTADOS[idxActual + 1]}"`,
      );
    }

    await this.pedidoRepo.update(id, { estado: nuevoEstado });

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
    return {
      Pendiente: pedidos.filter(p => p.estado === 'Pendiente'),
      Cortado:   pedidos.filter(p => p.estado === 'Cortado'),
      Aparado:   pedidos.filter(p => p.estado === 'Aparado'),
      Solado:    pedidos.filter(p => p.estado === 'Solado'),
      Empaque:   pedidos.filter(p => p.estado === 'Empaque'),
      Terminado: pedidos.filter(p => p.estado === 'Terminado'),
    };
  }
}
