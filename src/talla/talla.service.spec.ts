import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { TallaService } from './talla.service';
import { TallaDetalle } from './entities/talla-detalle.entity';

describe('TallaService', () => {
  let service: TallaService;

  const mockTallaRepo = {
    create: jest.fn((data) => data),
    save: jest.fn((data) => Promise.resolve(data)),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TallaService,
        { provide: getRepositoryToken(TallaDetalle), useValue: mockTallaRepo },
      ],
    }).compile();

    service = module.get<TallaService>(TallaService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generarTallasParaPedido', () => {
    it('escala la distribución estándar por la cantidad de docenas', async () => {
      const resultado = await service.generarTallasParaPedido(1, 'adulto', 2);
      const total = resultado.reduce((s, t) => s + t.cantidad_pares, 0);
      expect(total).toBe(24); // 12 pares/docena * 2 docenas
    });
  });

  describe('actualizarTallasPersonalizadas', () => {
    // Regresión: la distribución personalizada llega en pares POR DOCENA
    // (mismo contrato que generarTallasParaPedido) y debe escalarse por la
    // cantidad de docenas del pedido antes de guardarse. Antes de este fix
    // se guardaba tal cual llegaba, perdiendo pares en pedidos multi-docena.
    it('escala la distribución personalizada por la cantidad de docenas', async () => {
      const distribucionPorDocena = [37, 38, 39, 40, 41, 42].map(t => ({ talla: t, cantidad_pares: 2 }));

      const resultado = await service.actualizarTallasPersonalizadas(1, 'adulto', distribucionPorDocena, 2);

      const total = resultado.reduce((s, t) => s + t.cantidad_pares, 0);
      expect(total).toBe(24); // 12 pares/docena * 2 docenas, no 12
      expect(resultado.every(t => t.cantidad_pares === 4)).toBe(true); // 2 * 2 docenas
    });

    it('no escala cuando la cantidad es 1 docena (caso ya cubierto antes del fix)', async () => {
      const distribucionPorDocena = [37, 38, 39, 40, 41, 42].map(t => ({ talla: t, cantidad_pares: 2 }));

      const resultado = await service.actualizarTallasPersonalizadas(1, 'adulto', distribucionPorDocena, 1);

      const total = resultado.reduce((s, t) => s + t.cantidad_pares, 0);
      expect(total).toBe(12);
    });

    it('rechaza tallas fuera del rango de la categoría', async () => {
      const invalida = [{ talla: 50, cantidad_pares: 12 }];
      await expect(
        service.actualizarTallasPersonalizadas(1, 'adulto', invalida, 1),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
