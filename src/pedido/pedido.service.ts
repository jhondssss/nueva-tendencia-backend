import { Injectable } from '@nestjs/common';
import { PedidoCrudService } from './pedido-crud.service';
import { PedidoEstadoService } from './pedido-estado.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdatePedidoDto } from './dto/update-pedido.dto';

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

  findAll(clienteNombre?: string, productoNombre?: string) {
    return this.crudService.findAll(clienteNombre, productoNombre);
  }

  findOne(id: number) {
    return this.crudService.findOne(id);
  }

  update(id: number, dto: UpdatePedidoDto) {
    return this.crudService.update(id, dto);
  }

  remove(id: number) {
    return this.crudService.remove(id);
  }

  // ── Estado / Kanban ────────────────────────────────────────────────────────

  moverPedido(
    id: number,
    nuevoEstado: 'Pendiente' | 'Aparado' | 'Solado' | 'Empaque' | 'Terminado',
  ) {
    return this.estadoService.moverEstado(id, nuevoEstado);
  }

  getPedidosKanban() {
    return this.estadoService.getKanban();
  }
}
