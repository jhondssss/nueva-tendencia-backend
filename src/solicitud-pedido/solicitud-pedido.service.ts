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

  findAll(estado?: string) {
    return this.solicitudRepo.find({
      where: estado ? { estado: estado as SolicitudPedido['estado'] } : {},
      order: { fecha_creacion: 'DESC' },
    });
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
      .sendMail({
        to: solicitud.cliente.correo_electronico,
        subject: 'Tu solicitud de pedido fue aprobada — Calzados Nueva Tendencia',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2>¡Tu solicitud fue aprobada!</h2>
            <p>Hola <strong>${solicitud.cliente.nombre}</strong>,</p>
            <p>Tu solicitud de pedido #${solicitud.id_solicitud} fue aprobada y ya generamos tu pedido #${pedido.id_pedido}.</p>
            <p>Producto: <strong>${solicitud.producto.nombre_modelo}</strong></p>
            <p>Fecha de entrega estimada: <strong>${dto.fecha_entrega}</strong></p>
            <p style="margin: 24px 0;">
              <a href="https://nueva-tendencia-frontend.vercel.app/login"
                 style="display: inline-block; padding: 12px 24px; background-color: #4F46E5;
                        color: white; text-decoration: none; border-radius: 6px;">
                Ver mi pedido
              </a>
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 12px;">Calzados Nueva Tendencia</p>
          </div>
        `,
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
      .sendMail({
        to: solicitud.cliente.correo_electronico,
        subject: 'Tu solicitud de pedido fue rechazada — Calzados Nueva Tendencia',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2>Tu solicitud fue rechazada</h2>
            <p>Hola <strong>${solicitud.cliente.nombre}</strong>,</p>
            <p>Lamentablemente tu solicitud de pedido #${solicitud.id_solicitud} fue rechazada.</p>
            <p>Motivo: <strong>${dto.motivo_rechazo}</strong></p>
            <p>Si tenés dudas, podés contactarnos para más información.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 12px;">Calzados Nueva Tendencia</p>
          </div>
        `,
      })
      .catch(() => {});

    return saved;
  }
}
