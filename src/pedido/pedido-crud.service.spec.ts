import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PedidoCrudService } from './pedido-crud.service';
import { Pedido } from './entities/pedido.entity';
import { CalificacionPedido } from './entities/calificacion-pedido.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TallaService } from '../talla/talla.service';
import { TelegramService } from '../telegram/telegram.service';

describe('PedidoCrudService', () => {
  let service: PedidoCrudService;

  const mockPedidoRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findAndCount: jest.fn(),
    delete: jest.fn(),
  };
  const mockClienteRepo = { findOneBy: jest.fn() };
  const mockProductoRepo = { findOneBy: jest.fn() };
  const mockCalificacionRepo = { create: jest.fn(), save: jest.fn() };
  const mockAuditoriaService = { registrar: jest.fn().mockResolvedValue(undefined) };
  const mockTallaService = {};
  const mockTelegramService = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendPhoto: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PedidoCrudService,
        { provide: getRepositoryToken(Pedido), useValue: mockPedidoRepo },
        { provide: getRepositoryToken(Cliente), useValue: mockClienteRepo },
        { provide: getRepositoryToken(Producto), useValue: mockProductoRepo },
        { provide: getRepositoryToken(CalificacionPedido), useValue: mockCalificacionRepo },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
        { provide: TallaService, useValue: mockTallaService },
        { provide: TelegramService, useValue: mockTelegramService },
      ],
    }).compile();

    service = module.get<PedidoCrudService>(PedidoCrudService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('calificarPedido — reglas de negocio', () => {
    const CLIENTE_A = 10;

    it('rechaza calificar un pedido que no está en estado Terminado', async () => {
      mockPedidoRepo.findOne.mockResolvedValue({
        id_pedido: 1,
        estado: 'Aparado',
        cliente: { id_cliente: CLIENTE_A },
        calificacion: null,
      });

      await expect(
        service.calificarPedido(1, CLIENTE_A, { puntuacion: 5 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockCalificacionRepo.save).not.toHaveBeenCalled();
    });

    it('rechaza duplicar una calificación ya existente', async () => {
      mockPedidoRepo.findOne.mockResolvedValue({
        id_pedido: 1,
        estado: 'Terminado',
        cliente: { id_cliente: CLIENTE_A },
        calificacion: { id_calificacion: 99, puntuacion: 4 },
      });

      await expect(
        service.calificarPedido(1, CLIENTE_A, { puntuacion: 5 }),
      ).rejects.toThrow(ConflictException);
      expect(mockCalificacionRepo.save).not.toHaveBeenCalled();
    });

    it('permite calificar un pedido Terminado sin calificación previa', async () => {
      const pedido = {
        id_pedido: 1,
        estado: 'Terminado',
        cliente: { id_cliente: CLIENTE_A },
        calificacion: null,
      };
      mockPedidoRepo.findOne.mockResolvedValue(pedido);
      mockCalificacionRepo.create.mockReturnValue({ pedido, puntuacion: 5, comentario: 'Excelente' });
      mockCalificacionRepo.save.mockResolvedValue({
        id_calificacion: 1,
        pedido,
        puntuacion: 5,
        comentario: 'Excelente',
      });

      const result = await service.calificarPedido(1, CLIENTE_A, {
        puntuacion: 5,
        comentario: 'Excelente',
      });

      expect(mockCalificacionRepo.save).toHaveBeenCalled();
      expect(result.puntuacion).toBe(5);
    });

    it('no permite calificar un pedido que pertenece a otro cliente (filtro de propiedad)', async () => {
      const CLIENTE_B = 20;
      // El repo aplica el filtro cliente+id en la query; si el pedido es de otro cliente, no lo encuentra.
      mockPedidoRepo.findOne.mockResolvedValue(null);

      await expect(
        service.calificarPedido(1, CLIENTE_B, { puntuacion: 5 }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPedidoRepo.findOne).toHaveBeenCalledWith({
        where: { id_pedido: 1, cliente: { id_cliente: CLIENTE_B } },
        relations: ['cliente', 'producto', 'talles', 'calificacion'],
      });
      expect(mockCalificacionRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('lanza NotFoundException si el pedido no existe y no intenta borrar', async () => {
      mockPedidoRepo.findOneBy.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(mockPedidoRepo.delete).not.toHaveBeenCalled();
      expect(mockAuditoriaService.registrar).not.toHaveBeenCalled();
    });

    it('borra el pedido existente y registra auditoría', async () => {
      mockPedidoRepo.findOneBy.mockResolvedValue({ id_pedido: 1 });
      mockPedidoRepo.delete.mockResolvedValue({ raw: [], affected: 1 });

      const result = await service.remove(1);

      expect(mockPedidoRepo.delete).toHaveBeenCalledWith(1);
      expect(mockAuditoriaService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'DELETE', modulo: 'pedidos' }),
      );
      expect(result).toEqual({ raw: [], affected: 1 });
    });
  });

  describe('Autorización cruzada — mis-pedidos', () => {
    it('findByClienteId solo consulta pedidos filtrados por el cliente dueño de la sesión', async () => {
      const CLIENTE_A = 10;
      mockPedidoRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findByClienteId(CLIENTE_A);

      expect(mockPedidoRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ cliente: { id_cliente: CLIENTE_A } }),
        }),
      );
      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20, totalPages: 1 });
    });

    it('findOneByClienteId no expone el detalle de un pedido de otro cliente', async () => {
      const CLIENTE_A = 10;
      const PEDIDO_DE_CLIENTE_B = 55;
      mockPedidoRepo.findOne.mockResolvedValue(null);

      await expect(service.findOneByClienteId(PEDIDO_DE_CLIENTE_B, CLIENTE_A)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPedidoRepo.findOne).toHaveBeenCalledWith({
        where: { id_pedido: PEDIDO_DE_CLIENTE_B, cliente: { id_cliente: CLIENTE_A } },
        relations: ['cliente', 'producto', 'talles', 'calificacion'],
      });
    });

    it('findOneByClienteId devuelve el pedido cuando sí pertenece al cliente', async () => {
      const CLIENTE_A = 10;
      const pedido = { id_pedido: 1, cliente: { id_cliente: CLIENTE_A } };
      mockPedidoRepo.findOne.mockResolvedValue(pedido);

      const result = await service.findOneByClienteId(1, CLIENTE_A);

      expect(result).toBe(pedido);
    });
  });
});
