import { Injectable, NotFoundException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SolicitudPedido } from './entities/solicitud-pedido.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { CreateSolicitudPedidoDto } from './dto/create-solicitud-pedido.dto';
import { AprobarSolicitudDto } from './dto/aprobar-solicitud.dto';
import { RechazarSolicitudDto } from './dto/rechazar-solicitud.dto';
import { PedidoService } from '../pedido/pedido.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { MailService } from '../mail/mail.service';
import { paginate } from '../common/pagination';

@Injectable()
export class SolicitudPedidoService {
  constructor(
    @InjectRepository(SolicitudPedido)
    private readonly solicitudRepo: Repository<SolicitudPedido>,

    @InjectRepository(Cliente)
    private readonly clienteRepo: Repository<Cliente>,

    @InjectRepository(Producto)
    private readonly productoRepo: Repository<Producto>,

    private readonly pedidoService: PedidoService,
    private readonly auditoriaService: AuditoriaService,
    private readonly mailService: MailService,
  ) {}

  async create(clienteId: number, dto: CreateSolicitudPedidoDto) {
    const cliente = await this.clienteRepo.findOneBy({ id_cliente: clienteId });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const producto = await this.productoRepo.findOneBy({ id_producto: dto.producto_id });
    if (!producto) throw new NotFoundException('Producto no encontrado');

    const cantidad_pares = dto.tallas.reduce((sum, t) => sum + t.cantidad_pares, 0);

    const solicitud = this.solicitudRepo.create({
      cliente,
      producto,
      categoria: dto.categoria,
      cantidad_pares,
      tallas: dto.tallas,
      comentario_cliente: dto.comentario_cliente ?? null,
      fecha_entrega_deseada: dto.fecha_entrega_deseada ?? null,
      estado: 'Pendiente',
    });

    const saved = await this.solicitudRepo.save(solicitud);

    void this.auditoriaService.registrar({
      accion: 'CREATE',
      modulo: 'solicitudes-pedido',
      descripcion: `Cliente ${cliente.nombre} creó solicitud de pedido #${saved.id_solicitud}`,
    });

    return saved;
  }

  findByClienteId(clienteId: number) {
    return this.solicitudRepo.find({
      where: { cliente: { id_cliente: clienteId } },
      order: { fecha_creacion: 'DESC' },
    });
  }

  async findAll(estado?: string, page = 1, limit = 30) {
    const [data, total] = await this.solicitudRepo.findAndCount({
      where: estado ? { estado: estado as SolicitudPedido['estado'] } : {},
      order: { fecha_creacion: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paginate(data, total, page, limit);
  }

  private async findOneOrFail(id: number) {
    const solicitud = await this.solicitudRepo.findOne({ where: { id_solicitud: id } });
    if (!solicitud) throw new NotFoundException(`Solicitud #${id} no encontrada`);
    return solicitud;
  }

  async aprobar(id: number, dto: AprobarSolicitudDto) {
    const solicitud = await this.findOneOrFail(id);
    if (solicitud.estado !== 'Pendiente') {
      throw new ConflictException(`La solicitud #${id} ya fue ${solicitud.estado.toLowerCase()}`);
    }

    const pedido = await this.pedidoService.create({
      cliente_id: solicitud.cliente.id_cliente,
      producto_id: solicitud.producto.id_producto,
      total: dto.total,
      fecha_entrega: dto.fecha_entrega,
      cantidad: solicitud.cantidad_pares,
      unidad: dto.unidad ?? 'par',
      categoria: solicitud.categoria,
      tallas_personalizadas: solicitud.tallas,
    });
    if (!pedido) throw new InternalServerErrorException('No se pudo crear el pedido a partir de la solicitud');

    solicitud.estado = 'Aprobada';
    solicitud.pedido_creado = pedido;
    const saved = await this.solicitudRepo.save(solicitud);

    void this.auditoriaService.registrar({
      accion: 'UPDATE',
      modulo: 'solicitudes-pedido',
      descripcion: `Aprobó solicitud #${id} → generó pedido #${pedido.id_pedido}`,
    });

    this.mailService
      .sendSolicitudAprobadaEmail(solicitud.cliente.correo_electronico, {
        nombreCliente: solicitud.cliente.nombre,
        idSolicitud: solicitud.id_solicitud,
        idPedido: pedido.id_pedido,
        nombreProducto: solicitud.producto.nombre_modelo,
        fechaEntrega: dto.fecha_entrega,
      })
      .catch(() => {});

    return saved;
  }

  async rechazar(id: number, dto: RechazarSolicitudDto) {
    const solicitud = await this.findOneOrFail(id);
    if (solicitud.estado !== 'Pendiente') {
      throw new ConflictException(`La solicitud #${id} ya fue ${solicitud.estado.toLowerCase()}`);
    }

    solicitud.estado = 'Rechazada';
    solicitud.motivo_rechazo = dto.motivo_rechazo;
    const saved = await this.solicitudRepo.save(solicitud);

    void this.auditoriaService.registrar({
      accion: 'UPDATE',
      modulo: 'solicitudes-pedido',
      descripcion: `Rechazó solicitud #${id}: ${dto.motivo_rechazo}`,
    });

    this.mailService
      .sendSolicitudRechazadaEmail(
        solicitud.cliente.correo_electronico,
        solicitud.cliente.nombre,
        solicitud.id_solicitud,
        dto.motivo_rechazo,
      )
      .catch(() => {});

    return saved;
  }
}
