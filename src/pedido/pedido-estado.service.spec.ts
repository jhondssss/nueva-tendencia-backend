import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

  // createQueryBuilder mock para buscarPorNombre (Cuero/Esponja) — cada test
  // setea qb.getOne a lo que necesite vía mockInsumoQueryBuilderResult.
  let queryBuilderResult: Insumo | null = null;
  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(() => Promise.resolve(queryBuilderResult)),
  };
  const mockInsumoRepo = {
    findOneBy: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  const mockManager = { update: jest.fn().mockResolvedValue(undefined) };
  const mockDataSource = {
    transaction: jest.fn((cb: (manager: any) => Promise<any>) => cb(mockManager)),
  };

  const mockAuditoriaService = { registrar: jest.fn().mockResolvedValue(undefined) };
  const mockTelegramService = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendPhoto: jest.fn().mockResolvedValue(undefined),
  };
  const mockKardexService = {
    registrarMovimientoInsumoTx: jest.fn(),
    buscarUltimoConsumoAutomaticoNoRevertido: jest.fn(),
    marcarRevertidoTx: jest.fn().mockResolvedValue(undefined),
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

  afterEach(() => {
    jest.clearAllMocks();
    queryBuilderResult = null;
  });

  describe('moverEstado — máquina de estados', () => {
    const pedidoPendiente = {
      id_pedido: 1,
      estado: 'Pendiente',
      cliente: { nombre: 'Cliente A' },
      producto: { nombre_modelo: 'Modelo X', imagen_url: undefined },
    };

    it('avanza sin receta (Empaque → Terminado)', async () => {
      const pedidoEmpaque = { ...pedidoPendiente, estado: 'Empaque' };
      mockPedidoRepo.findOne
        .mockResolvedValueOnce(pedidoEmpaque)
        .mockResolvedValueOnce({ ...pedidoEmpaque, estado: 'Terminado' });
      mockPedidoRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.moverEstado(1, 'Terminado');

      expect(mockPedidoRepo.update).toHaveBeenCalledWith(1, {
        estado: 'Terminado',
        fecha_actualizacion: expect.any(Date),
      });
      expect(result?.estado).toBe('Terminado');
    });

    it('lanza BadRequestException si salta una etapa (Pendiente → Aparado)', async () => {
      mockPedidoRepo.findOne.mockResolvedValue(pedidoPendiente);

      await expect(service.moverEstado(1, 'Aparado')).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el pedido ya está en el estado destino', async () => {
      mockPedidoRepo.findOne.mockResolvedValue(pedidoPendiente);

      await expect(service.moverEstado(1, 'Pendiente')).rejects.toThrow(BadRequestException);
    });

    it('permite retroceder 1 paso a un admin sin receta (Terminado → Empaque)', async () => {
      const pedidoTerminado = { ...pedidoPendiente, estado: 'Terminado' };
      mockPedidoRepo.findOne
        .mockResolvedValueOnce(pedidoTerminado)
        .mockResolvedValueOnce({ ...pedidoTerminado, estado: 'Empaque' });
      mockPedidoRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.moverEstado(1, 'Empaque', 'admin');

      expect(mockPedidoRepo.update).toHaveBeenCalledWith(1, {
        estado: 'Empaque',
        fecha_actualizacion: expect.any(Date),
      });
      expect(result?.estado).toBe('Empaque');
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

  describe('moverEstado — consumo automático de insumos por etapa (Fase 2)', () => {
    const insumoCuero = { id_insumo: 10, nombre: 'Cuero', stock: 200 } as Insumo;
    const insumoClefa = { id_insumo: 11, nombre: 'Clefa', rol_formula: 'clefa', stock: 50 } as Insumo;
    const insumoPasta = { id_insumo: 12, nombre: 'Pasta', rol_formula: 'pasta', stock: 50 } as Insumo;
    const insumoPvc = { id_insumo: 13, nombre: 'PVC', stock: 50 } as Insumo;

    function pedidoEnEstado(estado: string, extra: Partial<{ cantidad_pares: number; cuero_pies: number | null; pasta_solado_litros: number | null; clefa_solado_litros: number | null; pvc_solado_litros: number | null }> = {}) {
      return {
        id_pedido: 5,
        estado,
        cantidad_pares: extra.cantidad_pares ?? 24, // 2 docenas
        cliente: { nombre: 'Cliente A' },
        producto: {
          nombre_modelo: 'Modelo X',
          imagen_url: undefined,
          cuero_pies: 'cuero_pies' in extra ? extra.cuero_pies : 3,
          pasta_solado_litros: 'pasta_solado_litros' in extra ? extra.pasta_solado_litros : 0.5,
          clefa_solado_litros: 'clefa_solado_litros' in extra ? extra.clefa_solado_litros : 0.3,
          pvc_solado_litros: 'pvc_solado_litros' in extra ? extra.pvc_solado_litros : 0.4,
        },
      };
    }

    // Solado combina 2 insumos por rol_formula (Pasta/Clefa vía findOneBy) y 1 por
    // nombre (PVC vía createQueryBuilder, igual que Cuero/Esponja). Este helper
    // arma ambos mocks a la vez para los tests de Solado.
    function mockInsumosSolado(overrides: Partial<{ pasta: Insumo; clefa: Insumo; pvc: Insumo }> = {}) {
      const pasta = overrides.pasta ?? insumoPasta;
      const clefa = overrides.clefa ?? insumoClefa;
      const pvc = overrides.pvc ?? insumoPvc;
      mockInsumoRepo.findOneBy.mockImplementation(({ rol_formula }: { rol_formula: string }) =>
        Promise.resolve(rol_formula === 'clefa' ? clefa : pasta),
      );
      queryBuilderResult = pvc; // buscarPorNombre('PVC')
    }

    it('avanza a Cortado (1 insumo) y descuenta Cuero vía kardex automático', async () => {
      const pedido = pedidoEnEstado('Pendiente');
      mockPedidoRepo.findOne
        .mockResolvedValueOnce(pedido)
        .mockResolvedValueOnce({ ...pedido, estado: 'Cortado' });
      queryBuilderResult = insumoCuero; // buscarPorNombre('Cuero')
      mockKardexService.registrarMovimientoInsumoTx.mockResolvedValue({ id_movimiento: 100 });

      const result = await service.moverEstado(5, 'Cortado');

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.update).toHaveBeenCalledWith(Pedido, 5, {
        estado: 'Cortado',
        fecha_actualizacion: expect.any(Date),
      });
      expect(mockKardexService.registrarMovimientoInsumoTx).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({
          insumo_id: insumoCuero.id_insumo,
          tipo: 'salida',
          cantidad: 6, // 2 docenas * 3 pies
          origen: 'automatico',
          pedido_id: 5,
        }),
      );
      expect(mockPedidoRepo.update).not.toHaveBeenCalled();
      expect(result?.estado).toBe('Cortado');
    });

    it('bloquea el avance a Cortado si no alcanza el stock de Cuero', async () => {
      const pedido = pedidoEnEstado('Pendiente');
      mockPedidoRepo.findOne.mockResolvedValue(pedido);
      queryBuilderResult = { ...insumoCuero, stock: 2 } as Insumo; // necesita 6, hay 2

      await expect(service.moverEstado(5, 'Cortado')).rejects.toThrow(BadRequestException);
      await expect(service.moverEstado(5, 'Cortado')).rejects.toThrow(/Falta 4 de Cuero/);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('bloquea el avance a Cortado si el producto no tiene cuero_pies configurado', async () => {
      const pedido = pedidoEnEstado('Pendiente', { cuero_pies: null });
      mockPedidoRepo.findOne.mockResolvedValue(pedido);

      await expect(service.moverEstado(5, 'Cortado')).rejects.toThrow(
        /no tiene configurada la cantidad de Cuero para Cortado/,
      );
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(mockInsumoRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('avanza a Solado (3 insumos) y descuenta Pasta, Clefa y PVC de forma independiente', async () => {
      const pedido = pedidoEnEstado('Aparado');
      mockPedidoRepo.findOne
        .mockResolvedValueOnce(pedido)
        .mockResolvedValueOnce({ ...pedido, estado: 'Solado' });
      mockInsumosSolado();
      mockKardexService.registrarMovimientoInsumoTx.mockResolvedValue({ id_movimiento: 101 });

      await service.moverEstado(5, 'Solado');

      expect(mockKardexService.registrarMovimientoInsumoTx).toHaveBeenCalledTimes(3);
      expect(mockKardexService.registrarMovimientoInsumoTx).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({ insumo_id: insumoPasta.id_insumo, cantidad: 1 }), // 2 docenas * 0.5
      );
      expect(mockKardexService.registrarMovimientoInsumoTx).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({ insumo_id: insumoClefa.id_insumo, cantidad: 0.6 }), // 2 docenas * 0.3
      );
      expect(mockKardexService.registrarMovimientoInsumoTx).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({ insumo_id: insumoPvc.id_insumo, cantidad: 0.8 }), // 2 docenas * 0.4
      );
    });

    it('bloquea el avance a Solado si falta stock de uno de los tres insumos', async () => {
      const pedido = pedidoEnEstado('Aparado');
      mockPedidoRepo.findOne.mockResolvedValue(pedido);
      mockInsumosSolado({ pasta: { ...insumoPasta, stock: 0.2 } });

      await expect(service.moverEstado(5, 'Solado')).rejects.toThrow(/Falta 0.8 de Pasta/);
    });

    it('bloquea el avance a Solado si falta stock de PVC', async () => {
      const pedido = pedidoEnEstado('Aparado');
      mockPedidoRepo.findOne.mockResolvedValue(pedido);
      mockInsumosSolado({ pvc: { ...insumoPvc, stock: 0.1 } });

      await expect(service.moverEstado(5, 'Solado')).rejects.toThrow(/Falta 0.7 de PVC/);
    });

    it('bloquea el avance a Solado si el producto no tiene pvc_solado_litros configurado', async () => {
      const pedido = pedidoEnEstado('Aparado', { pvc_solado_litros: null });
      mockPedidoRepo.findOne.mockResolvedValue(pedido);

      await expect(service.moverEstado(5, 'Solado')).rejects.toThrow(
        /no tiene configurada la cantidad de PVC para Solado/,
      );
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('retrocede desde Cortado y revierte el consumo automático de Cuero', async () => {
      const pedido = pedidoEnEstado('Cortado');
      mockPedidoRepo.findOne
        .mockResolvedValueOnce(pedido)
        .mockResolvedValueOnce({ ...pedido, estado: 'Pendiente' });
      queryBuilderResult = insumoCuero;
      mockKardexService.buscarUltimoConsumoAutomaticoNoRevertido.mockResolvedValue({
        id_movimiento: 100,
        cantidad: 6,
      });
      mockKardexService.registrarMovimientoInsumoTx.mockResolvedValue({ id_movimiento: 200 });

      await service.moverEstado(5, 'Pendiente', 'admin');

      expect(mockManager.update).toHaveBeenCalledWith(Pedido, 5, {
        estado: 'Pendiente',
        fecha_actualizacion: expect.any(Date),
      });
      expect(mockKardexService.registrarMovimientoInsumoTx).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({ insumo_id: insumoCuero.id_insumo, tipo: 'entrada', cantidad: 6 }),
      );
      expect(mockKardexService.marcarRevertidoTx).toHaveBeenCalledWith(mockManager, 100);
    });

    it('retrocede desde Solado y revierte los tres consumos (Pasta, Clefa y PVC)', async () => {
      const pedido = pedidoEnEstado('Solado');
      mockPedidoRepo.findOne
        .mockResolvedValueOnce(pedido)
        .mockResolvedValueOnce({ ...pedido, estado: 'Aparado' });
      mockInsumosSolado();
      const idPorInsumo: Record<number, { id_movimiento: number; cantidad: number }> = {
        [insumoPasta.id_insumo]: { id_movimiento: 300, cantidad: 1 },
        [insumoClefa.id_insumo]: { id_movimiento: 301, cantidad: 0.6 },
        [insumoPvc.id_insumo]: { id_movimiento: 302, cantidad: 0.8 },
      };
      mockKardexService.buscarUltimoConsumoAutomaticoNoRevertido.mockImplementation(
        (_manager: any, _pedidoId: number, insumoId: number) => Promise.resolve(idPorInsumo[insumoId]),
      );
      mockKardexService.registrarMovimientoInsumoTx.mockResolvedValue({ id_movimiento: 400 });

      await service.moverEstado(5, 'Aparado', 'admin');

      expect(mockKardexService.registrarMovimientoInsumoTx).toHaveBeenCalledTimes(3);
      expect(mockKardexService.marcarRevertidoTx).toHaveBeenCalledWith(mockManager, 300);
      expect(mockKardexService.marcarRevertidoTx).toHaveBeenCalledWith(mockManager, 301);
      expect(mockKardexService.marcarRevertidoTx).toHaveBeenCalledWith(mockManager, 302);
    });

    it('retroceso sin rol admin sigue prohibido aunque la etapa tenga receta', async () => {
      const pedido = pedidoEnEstado('Cortado');
      mockPedidoRepo.findOne.mockResolvedValue(pedido);

      await expect(service.moverEstado(5, 'Pendiente', 'operario')).rejects.toThrow(ForbiddenException);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });
  });
});
