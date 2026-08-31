import { Injectable } from '@nestjs/common';
import { PedidoCrudService } from './pedido-crud.service';
import { PedidoEstadoService } from './pedido-estado.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdatePedidoDto } from './dto/update-pedido.dto';
import { CalificarPedidoDto } from './dto/calificar-pedido.dto';

// Facade Pattern: delega a PedidoCrudService y PedidoEstadoService (SRP + OCP + DIP)
@Injectable()
export class PedidoService {
  constructor(
    private readonly crudService:   PedidoCrudService,
    private readonly estadoService: PedidoEstadoService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  create(dto: CreatePedidoDto) {
    return this.crudService.create(dto);
  }

  findAll(clienteNombre?: string, productoNombre?: string, page?: number, limit?: number) {
    return this.crudService.findAll(clienteNombre, productoNombre, page, limit);
  }

  findOne(id: number) {
    return this.crudService.findOne(id);
  }

  findByClienteId(
    clienteId: number,
    desde?: string,
    hasta?: string,
    estado?: string,
    page?: number,
    limit?: number,
  ) {
    return this.crudService.findByClienteId(clienteId, desde, hasta, estado, page, limit);
  }

  findOneByClienteId(id: number, clienteId: number) {
    return this.crudService.findOneByClienteId(id, clienteId);
  }

  calificarPedido(pedidoId: number, clienteId: number, dto: CalificarPedidoDto) {
    return this.crudService.calificarPedido(pedidoId, clienteId, dto);
  }

  async update(id: number, dto: UpdatePedidoDto, userRole?: string) {
    const { estado, ...resto } = dto;
    const tieneOtrosCambios = Object.keys(resto).length > 0;

    const actualizado = tieneOtrosCambios
      ? await this.crudService.update(id, resto)
      : undefined;

    if (estado) {
      return this.estadoService.moverEstado(id, estado, userRole);
    }

    return actualizado ?? this.crudService.findOne(id);
  }

  remove(id: number) {
    return this.crudService.remove(id);
  }

  // ── Estado / Kanban ────────────────────────────────────────────────────────

  moverPedido(
    id: number,
    nuevoEstado: 'Pendiente' | 'Aparado' | 'Solado' | 'Empaque' | 'Terminado',
    userRole?: string,
  ) {
    return this.estadoService.moverEstado(id, nuevoEstado, userRole);
  }

  getPedidosKanban() {
    return this.estadoService.getKanban();
  }
}
