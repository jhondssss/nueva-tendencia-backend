import { CreatePedidoDto } from '../dto/create-pedido.dto';
import { UpdatePedidoDto } from '../dto/update-pedido.dto';
import { CalificarPedidoDto } from '../dto/calificar-pedido.dto';

// ISP: interfaces separadas por tipo de operación

export interface IPedidoCrudService {
  create(dto: CreatePedidoDto): Promise<any>;
  findAll(clienteNombre?: string, productoNombre?: string, page?: number, limit?: number): Promise<any>;
  findOne(id: number): Promise<any>;
  findByClienteId(clienteId: number, desde?: string, hasta?: string, estado?: string): Promise<any[]>;
  findOneByClienteId(id: number, clienteId: number): Promise<any>;
  update(id: number, dto: UpdatePedidoDto): Promise<any>;
  remove(id: number): Promise<any>;
  calificarPedido(pedidoId: number, clienteId: number, dto: CalificarPedidoDto): Promise<any>;
}

export interface IPedidoEstadoService {
  moverEstado(
    id: number,
    nuevoEstado: 'Pendiente' | 'Aparado' | 'Solado' | 'Empaque' | 'Terminado',
  ): Promise<any>;
  getKanban(): Promise<any>;
}
