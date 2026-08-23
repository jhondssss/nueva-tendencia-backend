import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SolicitudPedidoService } from './solicitud-pedido.service';
import { SolicitudPedidoController } from './solicitud-pedido.controller';
import { SolicitudPedido } from './entities/solicitud-pedido.entity';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { PedidoService } from '../pedido/pedido.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { MailService } from '../mail/mail.service';

describe('SolicitudPedidoService', () => {
  let service: SolicitudPedidoService;

  const mockSolicitudRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
  };
  const mockClienteRepo = { findOneBy: jest.fn() };
  const mockProductoRepo = { findOneBy: jest.fn() };
  const mockPedidoService = { create: jest.fn() };
  const mockAuditoriaService = { registrar: jest.fn().mockResolvedValue(undefined) };
  const mockMailService = { sendMail: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SolicitudPedidoService,
        { provide: getRepositoryToken(SolicitudPedido), useValue: mockSolicitudRepo },
        { provide: getRepositoryToken(Cliente), useValue: mockClienteRepo },
        { provide: getRepositoryToken(Producto), useValue: mockProductoRepo },
        { provide: PedidoService, useValue: mockPedidoService },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<SolicitudPedidoService>(SolicitudPedidoService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    const CLIENTE_A = 1;
    const dto = {
      producto_id: 5,
      categoria: 'adulto' as const,
      tallas: [{ talla: 40, cantidad_pares: 2 }],
      comentario_cliente: 'Urgente',
    };

    it('crea la solicitud asociada al cliente autenticado', async () => {
      const cliente = { id_cliente: CLIENTE_A, nombre: 'Ana' };
      const producto = { id_producto: 5, nombre_modelo: 'Bota X' };
      mockClienteRepo.findOneBy.mockResolvedValue(cliente);
      mockProductoRepo.findOneBy.mockResolvedValue(producto);
      mockSolicitudRepo.create.mockImplementation((data) => data);
      mockSolicitudRepo.save.mockImplementation((data) => Promise.resolve({ id_solicitud: 1, ...data }));

      const result = await service.create(CLIENTE_A, dto);

      expect(mockSolicitudRepo.save).toHaveBeenCalled();
      expect(result.cliente).toBe(cliente);
      expect(result.estado).toBe('Pendiente');
    });

    it('lanza NotFoundException si el cliente no existe', async () => {
      mockClienteRepo.findOneBy.mockResolvedValue(null);

      await expect(service.create(999, dto)).rejects.toThrow(NotFoundException);
      expect(mockSolicitudRepo.save).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el producto no existe', async () => {
      mockClienteRepo.findOneBy.mockResolvedValue({ id_cliente: CLIENTE_A });
      mockProductoRepo.findOneBy.mockResolvedValue(null);

      await expect(service.create(CLIENTE_A, dto)).rejects.toThrow(NotFoundException);
      expect(mockSolicitudRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('aprobar', () => {
    const solicitudPendiente = {
      id_solicitud: 1,
      estado: 'Pendiente',
      cliente: { id_cliente: 1, nombre: 'Ana', correo_electronico: 'ana@test.com' },
      producto: { id_producto: 5, nombre_modelo: 'Bota X' },
      categoria: 'adulto',
      cantidad_pares: 2,
      tallas: [{ talla: 40, cantidad_pares: 2 }],
    };
    const dto = { total: 500, fecha_entrega: '2026-09-01', unidad: 'par' as const };

    it('crea un Pedido real a partir de la solicitud y la marca Aprobada', async () => {
      mockSolicitudRepo.findOne.mockResolvedValue({ ...solicitudPendiente });
      const pedidoCreado = { id_pedido: 77 };
      mockPedidoService.create.mockResolvedValue(pedidoCreado);
      mockSolicitudRepo.save.mockImplementation((data) => Promise.resolve(data));

      const result = await service.aprobar(1, dto);

      expect(mockPedidoService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cliente_id: solicitudPendiente.cliente.id_cliente,
          producto_id: solicitudPendiente.producto.id_producto,
          total: dto.total,
          fecha_entrega: dto.fecha_entrega,
          cantidad: solicitudPendiente.cantidad_pares,
        }),
      );
      expect(result.estado).toBe('Aprobada');
      expect(result.pedido_creado).toBe(pedidoCreado);
    });

    it('rechaza aprobar una solicitud que ya fue procesada', async () => {
      mockSolicitudRepo.findOne.mockResolvedValue({ ...solicitudPendiente, estado: 'Aprobada' });

      await expect(service.aprobar(1, dto)).rejects.toThrow(ConflictException);
      expect(mockPedidoService.create).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si la solicitud no existe', async () => {
      mockSolicitudRepo.findOne.mockResolvedValue(null);

      await expect(service.aprobar(999, dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('rechazar', () => {
    const solicitudPendiente = {
      id_solicitud: 2,
      estado: 'Pendiente',
      cliente: { id_cliente: 1, nombre: 'Ana', correo_electronico: 'ana@test.com' },
      producto: { id_producto: 5, nombre_modelo: 'Bota X' },
    };

    it('registra el motivo y marca la solicitud como Rechazada', async () => {
      mockSolicitudRepo.findOne.mockResolvedValue({ ...solicitudPendiente });
      mockSolicitudRepo.save.mockImplementation((data) => Promise.resolve(data));

      const result = await service.rechazar(2, { motivo_rechazo: 'Producto descontinuado' });

      expect(result.estado).toBe('Rechazada');
      expect(result.motivo_rechazo).toBe('Producto descontinuado');
    });

    it('rechaza (409) volver a resolver una solicitud ya procesada', async () => {
      mockSolicitudRepo.findOne.mockResolvedValue({ ...solicitudPendiente, estado: 'Rechazada' });

      await expect(
        service.rechazar(2, { motivo_rechazo: 'Cualquier motivo' }),
      ).rejects.toThrow(ConflictException);
      expect(mockSolicitudRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('Autorización cruzada — mis-solicitudes', () => {
    it('findByClienteId solo consulta solicitudes filtradas por el cliente dueño de la sesión', async () => {
      const CLIENTE_A = 1;
      mockSolicitudRepo.find.mockResolvedValue([]);

      await service.findByClienteId(CLIENTE_A);

      expect(mockSolicitudRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cliente: { id_cliente: CLIENTE_A } },
        }),
      );
    });

    it('un cliente distinto no recibe las solicitudes de otro cliente', async () => {
      const CLIENTE_A_SOLICITUDES = [{ id_solicitud: 1, cliente: { id_cliente: 1 } }];
      mockSolicitudRepo.find.mockResolvedValue(CLIENTE_A_SOLICITUDES);

      const resultado = await service.findByClienteId(1);

      expect(mockSolicitudRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { cliente: { id_cliente: 1 } } }),
      );
      // ninguna solicitud del cliente 2 puede colarse porque el where la filtra en el propio query
      expect(resultado.every((s: any) => s.cliente.id_cliente === 1)).toBe(true);
    });

    it('el rol "cliente" no está habilitado para aprobar ni rechazar solicitudes ajenas (nivel ruta)', () => {
      const rolesAprobar = Reflect.getMetadata(ROLES_KEY, SolicitudPedidoController.prototype.aprobar);
      const rolesRechazar = Reflect.getMetadata(ROLES_KEY, SolicitudPedidoController.prototype.rechazar);

      expect(rolesAprobar).toEqual(['admin', 'operario']);
      expect(rolesRechazar).toEqual(['admin', 'operario']);
      expect(rolesAprobar).not.toContain('cliente');
      expect(rolesRechazar).not.toContain('cliente');
    });
  });
});
