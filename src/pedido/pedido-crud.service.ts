import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Pedido } from './entities/pedido.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdatePedidoDto } from './dto/update-pedido.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TallaService } from '../talla/talla.service';
import { IPedidoCrudService } from './interfaces/pedido.interface';

@Injectable()
export class PedidoCrudService implements IPedidoCrudService {
  constructor(
    @InjectRepository(Pedido)   private pedidoRepo:   Repository<Pedido>,
    @InjectRepository(Cliente)  private clienteRepo:  Repository<Cliente>,
    @InjectRepository(Producto) private productoRepo: Repository<Producto>,
    private readonly auditoriaService: AuditoriaService,
    private readonly tallaService: TallaService,
  ) {}

  async create(createPedidoDto: CreatePedidoDto) {
    console.log('📥 DTO recibido:', createPedidoDto);

    const cliente = await this.clienteRepo.findOneBy({ id_cliente: createPedidoDto.clienteId });
    const producto = await this.productoRepo.findOneBy({ id_producto: createPedidoDto.productoId });

    console.log('👤 Cliente encontrado:', cliente);
    console.log('👟 Producto encontrado:', producto);

    if (!cliente) throw new Error('Cliente no encontrado');
    if (!producto) throw new Error('Producto no encontrado');

    const cantidad = createPedidoDto.cantidad ?? 1;
    const unidad   = createPedidoDto.unidad   ?? 'docena';
    const multiplicador = { docena: 12, media_docena: 6, par: 1 } as const;
    const cantidad_pares = cantidad * multiplicador[unidad];

    const fechaStr = createPedidoDto.fecha_entrega; // ej: '2026-03-18'
    const [y, m, d] = fechaStr.split('-').map(Number);
    const fecha = new Date(y, m - 1, d, 12, 0, 0); // mediodía local, evita timezone

    console.log('FECHA STRING:', createPedidoDto.fecha_entrega);
    console.log('FECHA CONSTRUIDA:', fecha.toISOString());
    console.log('FECHA FINAL:', fecha.toISOString().split('T')[0]);

    const pedido = this.pedidoRepo.create({
      total:              createPedidoDto.total,
      fecha_entrega:      fecha.toISOString().split('T')[0],
      estado:             createPedidoDto.estado || 'Pendiente',
      cantidad,
      unidad,
      cantidad_pares,
      categoria:          createPedidoDto.categoria ?? null,
      token_seguimiento:  uuidv4(),
      cliente,
      producto,
    });

    const savedPedido: Pedido = await this.pedidoRepo.save(pedido);
    console.log('✅ Pedido guardado:', savedPedido);

    if (createPedidoDto.tallas_personalizadas && createPedidoDto.categoria) {
      await this.tallaService.actualizarTallasPersonalizadas(
        savedPedido.id_pedido,
        createPedidoDto.categoria,
        createPedidoDto.tallas_personalizadas,
      );
    } else if (createPedidoDto.categoria) {
      await this.tallaService.generarTallasParaPedido(
        savedPedido.id_pedido,
        createPedidoDto.categoria,
        cantidad,
      );
    }

    void this.auditoriaService.registrar({
      accion: 'CREATE',
      modulo: 'pedidos',
      descripcion: `Creó pedido #${savedPedido.id_pedido}`,
    });

    return this.pedidoRepo.findOne({
      where: { id_pedido: savedPedido.id_pedido },
      relations: ['cliente', 'producto', 'talles'],
    });
  }

  findAll(clienteNombre?: string, productoNombre?: string) {
    return this.pedidoRepo.find({
      where: {
        ...(clienteNombre  && { cliente:  { nombre:        Like(`%${clienteNombre}%`)  } }),
        ...(productoNombre && { producto: { nombre_modelo: Like(`%${productoNombre}%`) } }),
      },
      relations: ['cliente', 'producto', 'talles'],
    });
  }

  findOne(id: number) {
    return this.pedidoRepo.findOne({
      where: { id_pedido: id },
      relations: ['cliente', 'producto'],
    });
  }

  async update(id: number, updatePedidoDto: UpdatePedidoDto) {
    console.log('📝 Actualizando pedido:', id, updatePedidoDto);

    const pedido = await this.pedidoRepo.findOne({
      where: { id_pedido: id },
      relations: ['cliente', 'producto'],
    });

    if (!pedido) throw new Error('Pedido no encontrado');

    if (updatePedidoDto.cliente_id) {
      const cliente = await this.clienteRepo.findOneBy({ id_cliente: updatePedidoDto.cliente_id });
      if (!cliente) throw new Error('Cliente no encontrado');
      pedido.cliente = cliente;
    }

    if (updatePedidoDto.producto_id) {
      const producto = await this.productoRepo.findOneBy({ id_producto: updatePedidoDto.producto_id });
      if (!producto) throw new Error('Producto no encontrado');
      pedido.producto = producto;
    }

    if (updatePedidoDto.total !== undefined)  pedido.total         = updatePedidoDto.total;
    if (updatePedidoDto.fecha_entrega)        pedido.fecha_entrega = updatePedidoDto.fecha_entrega;
    if (updatePedidoDto.estado)               pedido.estado        = updatePedidoDto.estado;
    if (updatePedidoDto.cantidad !== undefined) pedido.cantidad    = updatePedidoDto.cantidad;
    if (updatePedidoDto.unidad)               pedido.unidad        = updatePedidoDto.unidad;

    if (updatePedidoDto.cantidad !== undefined || updatePedidoDto.unidad) {
      const multiplicador = { docena: 12, media_docena: 6, par: 1 } as const;
      pedido.cantidad_pares = pedido.cantidad * multiplicador[pedido.unidad];
    }

    const saved = await this.pedidoRepo.save(pedido);

    // ── Tallas: personalizada tiene prioridad sobre regeneración estándar ──
    const categoriaFinal = updatePedidoDto.categoria ?? pedido.categoria;
    if (updatePedidoDto.tallas_personalizadas && categoriaFinal) {
      await this.tallaService.actualizarTallasPersonalizadas(
        id,
        categoriaFinal,
        updatePedidoDto.tallas_personalizadas,
      );
    } else if (updatePedidoDto.categoria) {
      await this.tallaService.generarTallasParaPedido(
        id,
        updatePedidoDto.categoria,
        pedido.cantidad,
      );
    }

    void this.auditoriaService.registrar({
      accion: 'UPDATE',
      modulo: 'pedidos',
      descripcion: `Actualizó pedido #${id}`,
    });

    return saved;
  }

  async remove(id: number) {
    const result = await this.pedidoRepo.delete(id);
    void this.auditoriaService.registrar({
      accion: 'DELETE',
      modulo: 'pedidos',
      descripcion: `Eliminó pedido #${id}`,
    });
    return result;
  }
}
