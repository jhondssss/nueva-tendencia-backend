import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Not, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Pedido } from './entities/pedido.entity';
import { CalificacionPedido } from './entities/calificacion-pedido.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdatePedidoDto } from './dto/update-pedido.dto';
import { CalificarPedidoDto } from './dto/calificar-pedido.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TallaService } from '../talla/talla.service';
import { TelegramService } from '../telegram/telegram.service';
import { IPedidoCrudService } from './interfaces/pedido.interface';
import { paginate } from '../common/pagination';
import { PARES_POR_UNIDAD } from '../common/constants';

@Injectable()
export class PedidoCrudService implements IPedidoCrudService {
  private readonly logger = new Logger(PedidoCrudService.name);

  constructor(
    @InjectRepository(Pedido)              private pedidoRepo:       Repository<Pedido>,
    @InjectRepository(Cliente)             private clienteRepo:      Repository<Cliente>,
    @InjectRepository(Producto)            private productoRepo:     Repository<Producto>,
    @InjectRepository(CalificacionPedido)  private calificacionRepo: Repository<CalificacionPedido>,
    private readonly auditoriaService: AuditoriaService,
    private readonly tallaService: TallaService,
    private readonly telegramService: TelegramService,
  ) {}

  async create(createPedidoDto: CreatePedidoDto) {
    this.logger.debug(`Creando pedido: cliente=${createPedidoDto.cliente_id} producto=${createPedidoDto.producto_id}`);

    const cliente = await this.clienteRepo.findOneBy({ id_cliente: createPedidoDto.cliente_id });
    const producto = await this.productoRepo.findOneBy({ id_producto: createPedidoDto.producto_id });

    if (!cliente) throw new Error('Cliente no encontrado');
    if (!producto) throw new Error('Producto no encontrado');

    const cantidad = createPedidoDto.cantidad ?? 1;
    const unidad   = createPedidoDto.unidad   ?? 'docena';
    const cantidad_pares = cantidad * PARES_POR_UNIDAD[unidad];

    const fechaStr = createPedidoDto.fecha_entrega; // ej: '2026-03-18'
    const [y, m, d] = fechaStr.split('-').map(Number);
    const fecha = new Date(y, m - 1, d, 12, 0, 0); // mediodía local, evita timezone
    this.logger.debug(`Fecha entrega: ${fechaStr} -> ${fecha.toISOString().split('T')[0]}`);

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
    this.logger.debug(`Pedido #${savedPedido.id_pedido} guardado`);

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

    const caption =
      `🔔 Nuevo pedido #${savedPedido.id_pedido}\n` +
      `Cliente: ${cliente.nombre} ${cliente.apellido ?? ''}\n` +
      `Producto: ${producto.nombre_modelo}\n` +
      `Entrega: ${savedPedido.fecha_entrega}`.trim();
    const seguimientoUrl = `https://nueva-tendencia-frontend.vercel.app/seguimiento/token/${savedPedido.token_seguimiento}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(seguimientoUrl)}`;
    this.telegramService.sendPhoto(qrUrl, caption).catch(() => {});

    const dias = this.calcDiasHastaEntrega(savedPedido.fecha_entrega);
    if (dias <= 3) {
      const etiqueta = dias <= 0 ? 'HOY' : dias === 1 ? 'mañana' : `en ${dias} días`;
      const nombreCliente = [cliente.nombre, cliente.apellido].filter(Boolean).join(' ');
      this.telegramService.sendMessage(
        `⚡ Pedido urgente #${savedPedido.id_pedido} creado\n` +
        `Cliente: ${nombreCliente}\n` +
        `Entrega: ${savedPedido.fecha_entrega} 🔴 (${etiqueta})`,
      ).catch(() => {});
    }

    return this.pedidoRepo.findOne({
      where: { id_pedido: savedPedido.id_pedido },
      relations: ['cliente', 'producto', 'talles'],
    });
  }

  async findAll(clienteNombre?: string, productoNombre?: string, page = 1, limit = 30) {
    const [data, total] = await this.pedidoRepo.findAndCount({
      where: {
        ...(clienteNombre  && { cliente:  { nombre:        Like(`%${clienteNombre}%`)  } }),
        ...(productoNombre && { producto: { nombre_modelo: Like(`%${productoNombre}%`) } }),
      },
      relations: ['cliente', 'producto', 'talles'],
      order: { fecha_creacion: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paginate(data, total, page, limit);
  }

  findOne(id: number) {
    return this.pedidoRepo.findOne({
      where: { id_pedido: id },
      relations: ['cliente', 'producto', 'calificacion'],
    });
  }

  async findByClienteId(
    clienteId: number,
    desde?: string,
    hasta?: string,
    estado?: string,
    page = 1,
    limit = 20,
  ) {
    const rangoFecha =
      desde && hasta
        ? Between(new Date(`${desde}T00:00:00`), new Date(`${hasta}T23:59:59.999`))
        : desde
          ? MoreThanOrEqual(new Date(`${desde}T00:00:00`))
          : hasta
            ? LessThanOrEqual(new Date(`${hasta}T23:59:59.999`))
            : undefined;

    const [data, total] = await this.pedidoRepo.findAndCount({
      where: {
        cliente: { id_cliente: clienteId },
        ...(rangoFecha && { fecha_creacion: rangoFecha }),
        ...(estado && { estado: estado as Pedido['estado'] }),
      },
      relations: ['cliente', 'producto', 'talles'],
      order: { fecha_creacion: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paginate(data, total, page, limit);
  }

  async findOneByClienteId(id: number, clienteId: number) {
    const pedido = await this.pedidoRepo.findOne({
      where: { id_pedido: id, cliente: { id_cliente: clienteId } },
      relations: ['cliente', 'producto', 'talles', 'calificacion'],
    });
    if (!pedido) throw new NotFoundException(`Pedido #${id} no encontrado`);
    return pedido;
  }

  async calificarPedido(pedidoId: number, clienteId: number, dto: CalificarPedidoDto) {
    const pedido = await this.findOneByClienteId(pedidoId, clienteId);

    if (pedido.estado !== 'Terminado') {
      throw new BadRequestException('Solo se puede calificar un pedido en estado "Terminado"');
    }

    if (pedido.calificacion) {
      throw new ConflictException(`El pedido #${pedidoId} ya tiene una calificación registrada`);
    }

    const calificacion = this.calificacionRepo.create({
      pedido,
      puntuacion: dto.puntuacion,
      comentario: dto.comentario ?? null,
    });

    return this.calificacionRepo.save(calificacion);
  }

  async update(id: number, updatePedidoDto: UpdatePedidoDto) {
    this.logger.debug(`Actualizando pedido #${id}`);

    const pedido = await this.pedidoRepo.findOne({
      where: { id_pedido: id },
      relations: ['cliente', 'producto'],
    });

    if (!pedido) throw new Error('Pedido no encontrado');

    // dto.estado se ignora acá a propósito: los cambios de estado pasan por
    // PedidoEstadoService.moverEstado (vía PedidoService.update) para respetar la máquina de estados.
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

    if (updatePedidoDto.total !== undefined)     pedido.total         = updatePedidoDto.total;
    if (updatePedidoDto.fecha_entrega)           pedido.fecha_entrega = updatePedidoDto.fecha_entrega;
    if (updatePedidoDto.cantidad !== undefined)  pedido.cantidad      = updatePedidoDto.cantidad;
    if (updatePedidoDto.unidad)                  pedido.unidad        = updatePedidoDto.unidad;
    if (updatePedidoDto.categoria !== undefined) pedido.categoria     = updatePedidoDto.categoria;

    if (updatePedidoDto.cantidad !== undefined || updatePedidoDto.unidad) {
      pedido.cantidad_pares = pedido.cantidad * PARES_POR_UNIDAD[pedido.unidad];
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

  private calcDiasHastaEntrega(fechaStr: string): number {
    const [y, m, d] = fechaStr.split('-').map(Number);
    const entrega = new Date(y, m - 1, d);
    const hoy = new Date();
    const hoyMidnight = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    return Math.floor((entrega.getTime() - hoyMidnight.getTime()) / (1000 * 60 * 60 * 24));
  }

  // 7am Bolivia (UTC-4) = 11am UTC
  @Cron('0 11 * * *')
  async checkPedidosProximosAVencer(): Promise<void> {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const pedidos = await this.pedidoRepo.find({
      where: { fecha_entrega: tomorrowStr, estado: Not('Terminado') },
      relations: ['cliente'],
    });

    for (const pedido of pedidos) {
      this.telegramService.sendMessage(
        `📅 Pedido #${pedido.id_pedido} vence mañana\nCliente: ${pedido.cliente?.nombre ?? 'N/A'}\nEstado actual: ${pedido.estado}`,
      ).catch(() => {});
    }
  }
}
