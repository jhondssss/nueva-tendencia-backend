import { CreatePedidoDto } from '../dto/create-pedido.dto';
import { UpdatePedidoDto } from '../dto/update-pedido.dto';

// ISP: interfaces separadas por tipo de operación

export interface IPedidoCrudService {
  create(dto: CreatePedidoDto): Promise<any>;
  findAll(clienteNombre?: string, productoNombre?: string): Promise<any[]>;
  findOne(id: number): Promise<any>;
  update(id: number, dto: UpdatePedidoDto): Promise<any>;
  remove(id: number): Promise<any>;
}

export interface IPedidoEstadoService {
  moverEstado(
    id: number,
    nuevoEstado: 'Pendiente' | 'Aparado' | 'Solado' | 'Empaque' | 'Terminado',
  ): Promise<any>;
  getKanban(): Promise<any>;
}
