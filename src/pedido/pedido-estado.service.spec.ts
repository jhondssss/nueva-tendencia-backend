import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { PedidoEstadoService } from './pedido-estado.service';
import { Pedido } from './entities/pedido.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TelegramService } from '../telegram/telegram.service';

describe('PedidoEstadoService', () => {
  let service: PedidoEstadoService;

  const mockPedidoRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockAuditoriaService = { registrar: jest.fn().mockResolvedValue(undefined) };
  const mockTelegramService = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendPhoto: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PedidoEstadoService,
        { provide: getRepositoryToken(Pedido), useValue: mockPedidoRepo },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
        { provide: TelegramService, useValue: mockTelegramService },
      ],
    }).compile();

    service = module.get<PedidoEstadoService>(PedidoEstadoService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('moverEstado', () => {
    const pedidoPendiente = {
      id_pedido: 1,
      estado: 'Pendiente',
      cliente: { nombre: 'Cliente A' },
      producto: { nombre_modelo: 'Modelo X', imagen_url: undefined },
    };

    it('avanza correctamente al siguiente estado', async () => {
      mockPedidoRepo.findOne
        .mockResolvedValueOnce(pedidoPendiente)
        .mockResolvedValueOnce({ ...pedidoPendiente, estado: 'Cortado' });
      mockPedidoRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.moverEstado(1, 'Cortado');

      expect(mockPedidoRepo.update).toHaveBeenCalledWith(1, {
        estado: 'Cortado',
        fecha_actualizacion: expect.any(Date),
      });
      expect(result?.estado).toBe('Cortado');
    });

    it('lanza BadRequestException si intenta retroceder el estado', async () => {
      const pedidoCortado = { ...pedidoPendiente, estado: 'Cortado' };
      mockPedidoRepo.findOne.mockResolvedValue(pedidoCortado);

      await expect(service.moverEstado(1, 'Pendiente')).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si salta una etapa (Pendiente → Aparado)', async () => {
      mockPedidoRepo.findOne.mockResolvedValue(pedidoPendiente);

      // Saltar Pendiente → Aparado sin pasar por Cortado
      await expect(service.moverEstado(1, 'Aparado')).rejects.toThrow(BadRequestException);
    });
  });
});
