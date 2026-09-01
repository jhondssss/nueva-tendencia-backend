import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { KardexService } from './kardex.service';
import { KardexMovimiento } from './entities/kardex.entity';

describe('KardexService', () => {
  let service: KardexService;

  const mockKardexRepo = { count: jest.fn() };
  const mockDataSource = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KardexService,
        { provide: getRepositoryToken(KardexMovimiento), useValue: mockKardexRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<KardexService>(KardexService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('existenMovimientosPorPedido', () => {
    it('devuelve true cuando el pedido tiene movimientos de kardex', async () => {
      mockKardexRepo.count.mockResolvedValue(3);

      const resultado = await service.existenMovimientosPorPedido(1);

      expect(resultado).toBe(true);
      expect(mockKardexRepo.count).toHaveBeenCalledWith({
        where: { pedido: { id_pedido: 1 } },
      });
    });

    it('devuelve false cuando el pedido no tiene movimientos de kardex', async () => {
      mockKardexRepo.count.mockResolvedValue(0);

      const resultado = await service.existenMovimientosPorPedido(2);

      expect(resultado).toBe(false);
    });
  });
});
