import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PedidoEstadoService } from './pedido-estado.service';
import { Pedido } from './entities/pedido.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TelegramService } from '../telegram/telegram.service';
import { KardexService } from '../kardex/kardex.service';

describe('PedidoEstadoService', () => {
  let service: PedidoEstadoService;

  const mockPedidoRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockInsumoRepo = {
    findOneBy: jest.fn(),
  };

  const mockManager = {
    update: jest.fn().mockResolvedValue(undefined),
  };

  const mockDataSource = {
    transaction: jest.fn((cb: any) => cb(mockManager)),
  };

  const mockAuditoriaService = { registrar: jest.fn().mockResolvedValue(undefined) };
  const mockTelegramService = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendPhoto: jest.fn().mockResolvedValue(undefined),
  };
  const mockKardexService = {
    registrarMovimientoInsumoTx: jest.fn().mockResolvedValue({ id_movimiento: 1 }),
    marcarRevertidoTx: jest.fn().mockResolvedValue(undefined),
    buscarUltimoConsumoAutomaticoNoRevertido: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PedidoEstadoService,
        { provide: getRepositoryToken(Pedido), useValue: mockPedidoRepo },
        { provide: getRepositoryToken(Insumo), useValue: mockInsumoRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
        { provide: TelegramService, useValue: mockTelegramService },
        { provide: KardexService, useValue: mockKardexService },
      ],
    }).compile();

    service = module.get<PedidoEstadoService>(PedidoEstadoService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('moverEstado — máquina de estados', () => {
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

    it('lanza BadRequestException si salta una etapa (Pendiente → Aparado)', async () => {
      mockPedidoRepo.findOne.mockResolvedValue(pedidoPendiente);

      await expect(service.moverEstado(1, 'Aparado')).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el pedido ya está en el estado destino', async () => {
      mockPedidoRepo.findOne.mockResolvedValue(pedidoPendiente);

      await expect(service.moverEstado(1, 'Pendiente')).rejects.toThrow(BadRequestException);
    });

    it('permite retroceder 1 paso a un admin (fuera de Solado)', async () => {
      const pedidoCortado = { ...pedidoPendiente, estado: 'Cortado' };
      mockPedidoRepo.findOne
        .mockResolvedValueOnce(pedidoCortado)
        .mockResolvedValueOnce({ ...pedidoCortado, estado: 'Pendiente' });
      mockPedidoRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.moverEstado(1, 'Pendiente', 'admin');

      expect(mockPedidoRepo.update).toHaveBeenCalledWith(1, {
        estado: 'Pendiente',
        fecha_actualizacion: expect.any(Date),
      });
      expect(result?.estado).toBe('Pendiente');
    });

    it('lanza ForbiddenException si un operario intenta retroceder', async () => {
      const pedidoCortado = { ...pedidoPendiente, estado: 'Cortado' };
      mockPedidoRepo.findOne.mockResolvedValue(pedidoCortado);

      await expect(service.moverEstado(1, 'Pendiente', 'operario')).rejects.toThrow(ForbiddenException);
    });

    it('lanza BadRequestException si retrocede más de un paso', async () => {
      const pedidoSolado = { ...pedidoPendiente, estado: 'Solado' };
      mockPedidoRepo.findOne.mockResolvedValue(pedidoSolado);

      await expect(service.moverEstado(1, 'Pendiente', 'admin')).rejects.toThrow(BadRequestException);
    });
  });

  describe('fórmula de mezcla Clefa/Pasta — consumo al entrar a Solado', () => {
    const pedidoAparado = {
      id_pedido: 5,
      estado: 'Aparado',
      cantidad_pares: 24, // 2 docenas
      cliente: { nombre: 'Cliente B' },
      producto: {
        nombre_modelo: 'Modelo Y',
        porcentaje_clefa: 60,
        porcentaje_pasta: 40,
      },
    };

    it('bloquea el avance si el producto no tiene fórmula configurada', async () => {
      mockPedidoRepo.findOne.mockResolvedValue({
        ...pedidoAparado,
        producto: { ...pedidoAparado.producto, porcentaje_clefa: null, porcentaje_pasta: null },
      });

      await expect(service.moverEstado(5, 'Solado')).rejects.toThrow(BadRequestException);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('bloquea el avance si falta el insumo con rol clefa o pasta', async () => {
      mockPedidoRepo.findOne.mockResolvedValue(pedidoAparado);
      mockInsumoRepo.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce({ id_insumo: 2, stock: 100 });

      await expect(service.moverEstado(5, 'Solado')).rejects.toThrow(BadRequestException);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('bloquea el avance si el stock de Clefa o Pasta es insuficiente', async () => {
      mockPedidoRepo.findOne.mockResolvedValue(pedidoAparado);
      // 2 docenas * 0.5L * 60% = 0.6L Clefa, * 40% = 0.4L Pasta
      mockInsumoRepo.findOneBy
        .mockResolvedValueOnce({ id_insumo: 10, stock: 0.5 }) // clefa: falta 0.1L
        .mockResolvedValueOnce({ id_insumo: 11, stock: 1 });  // pasta: alcanza

      await expect(service.moverEstado(5, 'Solado')).rejects.toThrow(BadRequestException);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('consume Clefa y Pasta y avanza a Solado cuando hay stock suficiente', async () => {
      mockPedidoRepo.findOne
        .mockResolvedValueOnce(pedidoAparado)
        .mockResolvedValueOnce({ ...pedidoAparado, estado: 'Solado' });
      mockInsumoRepo.findOneBy
        .mockResolvedValueOnce({ id_insumo: 10, stock: 5 })
        .mockResolvedValueOnce({ id_insumo: 11, stock: 5 });

      const result = await service.moverEstado(5, 'Solado');

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.update).toHaveBeenCalledWith(Pedido, 5, {
        estado: 'Solado',
        fecha_actualizacion: expect.any(Date),
      });
      expect(mockKardexService.registrarMovimientoInsumoTx).toHaveBeenCalledTimes(2);
      expect(mockKardexService.registrarMovimientoInsumoTx).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({ insumo_id: 10, tipo: 'salida', cantidad: 0.6, origen: 'automatico', pedido_id: 5 }),
      );
      expect(mockKardexService.registrarMovimientoInsumoTx).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({ insumo_id: 11, tipo: 'salida', cantidad: 0.4, origen: 'automatico', pedido_id: 5 }),
      );
      expect(result?.estado).toBe('Solado');
    });
  });

  describe('fórmula de mezcla Clefa/Pasta — reversión al retroceder desde Solado', () => {
    const pedidoSolado = {
      id_pedido: 7,
      estado: 'Solado',
      cantidad_pares: 24,
      cliente: { nombre: 'Cliente C' },
      producto: { nombre_modelo: 'Modelo Z', porcentaje_clefa: 60, porcentaje_pasta: 40 },
    };

    it('revierte el consumo automático encontrado y retrocede a Aparado (admin)', async () => {
      mockPedidoRepo.findOne
        .mockResolvedValueOnce(pedidoSolado)
        .mockResolvedValueOnce({ ...pedidoSolado, estado: 'Aparado' });
      mockInsumoRepo.findOneBy
        .mockResolvedValueOnce({ id_insumo: 10 })
        .mockResolvedValueOnce({ id_insumo: 11 });
      mockKardexService.buscarUltimoConsumoAutomaticoNoRevertido
        .mockResolvedValueOnce({ id_movimiento: 100, cantidad: 0.6 })
        .mockResolvedValueOnce({ id_movimiento: 101, cantidad: 0.4 });

      const result = await service.moverEstado(7, 'Aparado', 'admin');

      expect(mockManager.update).toHaveBeenCalledWith(Pedido, 7, {
        estado: 'Aparado',
        fecha_actualizacion: expect.any(Date),
      });
      expect(mockKardexService.registrarMovimientoInsumoTx).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({ insumo_id: 10, tipo: 'entrada', cantidad: 0.6, origen: 'automatico', pedido_id: 7 }),
      );
      expect(mockKardexService.marcarRevertidoTx).toHaveBeenCalledWith(mockManager, 100);
      expect(mockKardexService.marcarRevertidoTx).toHaveBeenCalledWith(mockManager, 101);
      expect(result?.estado).toBe('Aparado');
    });

    it('retrocede sin fallar si no hay movimiento automático que revertir', async () => {
      mockPedidoRepo.findOne
        .mockResolvedValueOnce(pedidoSolado)
        .mockResolvedValueOnce({ ...pedidoSolado, estado: 'Aparado' });
      mockInsumoRepo.findOneBy
        .mockResolvedValueOnce({ id_insumo: 10 })
        .mockResolvedValueOnce({ id_insumo: 11 });
      mockKardexService.buscarUltimoConsumoAutomaticoNoRevertido.mockResolvedValue(null);

      const result = await service.moverEstado(7, 'Aparado', 'admin');

      expect(mockKardexService.registrarMovimientoInsumoTx).not.toHaveBeenCalled();
      expect(mockKardexService.marcarRevertidoTx).not.toHaveBeenCalled();
      expect(result?.estado).toBe('Aparado');
    });
  });
});
