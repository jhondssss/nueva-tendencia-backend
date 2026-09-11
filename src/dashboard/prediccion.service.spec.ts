import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PrediccionService } from './prediccion.service';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Producto } from '../producto/entities/producto.entity';

describe('PrediccionService', () => {
  let service: PrediccionService;

  const mockQueryBuilder = {
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };

  const mockPedidoRepo = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    find: jest.fn(),
  };
  const mockProductoRepo = { find: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrediccionService,
        { provide: getRepositoryToken(Pedido), useValue: mockPedidoRepo },
        { provide: getRepositoryToken(Producto), useValue: mockProductoRepo },
      ],
    }).compile();

    service = module.get<PrediccionService>(PrediccionService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getPrediccionStock', () => {
    it('calcula demanda mensual y semanas restantes cuando hay pedidos recientes (caso feliz)', async () => {
      mockProductoRepo.find.mockResolvedValue([
        { id_producto: 1, nombre_modelo: 'Bota Clásica', stock: 30, nivel_minimo: 10 },
      ]);
      // 6 pedidos en la ventana de 3 meses => demanda mensual = 2
      mockPedidoRepo.find.mockResolvedValue(
        Array.from({ length: 6 }, () => ({ producto: { id_producto: 1 } })),
      );

      const [resultado] = await service.getPrediccionStock();

      expect(resultado.demanda_mensual).toBe(2);
      // stock 30 / demanda 2 * 4 semanas = 60 semanas
      expect(resultado.semanas_restantes).toBe(60);
      expect(resultado.alerta).toBe(false);
    });

    it('devuelve semanas_restantes null cuando no hay demanda (caso borde: división por cero evitada)', async () => {
      mockProductoRepo.find.mockResolvedValue([
        { id_producto: 2, nombre_modelo: 'Sandalia', stock: 5, nivel_minimo: 10 },
      ]);
      mockPedidoRepo.find.mockResolvedValue([]);

      const [resultado] = await service.getPrediccionStock();

      expect(resultado.demanda_mensual).toBe(0);
      expect(resultado.semanas_restantes).toBeNull();
      // stock <= nivel_minimo => alerta activa
      expect(resultado.alerta).toBe(true);
    });

    it('marca alerta cuando el stock es exactamente igual al nivel mínimo (caso borde)', async () => {
      mockProductoRepo.find.mockResolvedValue([
        { id_producto: 3, nombre_modelo: 'Zapato Escolar', stock: 10, nivel_minimo: 10 },
      ]);
      mockPedidoRepo.find.mockResolvedValue([{ producto: { id_producto: 3 } }]);

      const [resultado] = await service.getPrediccionStock();

      expect(resultado.alerta).toBe(true);
    });
  });

  describe('getVentasPorMes', () => {
    it('redondea el total a 2 decimales (caso feliz)', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { mes: '2026-01', total: '1234.5678' },
      ]);

      const resultado = await service.getVentasPorMes();

      expect(resultado).toEqual([{ mes: '2026-01', total: 1234.57 }]);
    });

    it('devuelve una lista vacía cuando no hay ventas (caso borde)', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const resultado = await service.getVentasPorMes();

      expect(resultado).toEqual([]);
    });
  });

  describe('getTopProductos', () => {
    it('mapea cantidad, pares y total del producto más vendido (caso feliz)', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          id_producto: 1,
          nombre: 'Bota Clásica',
          cantidad: '5',
          cantidad_pares: '60',
          total: '1500.006',
        },
      ]);

      const [resultado] = await service.getTopProductos();

      expect(resultado.nombre).toBe('Bota Clásica');
      expect(resultado.cantidad).toBe(5);
      expect(resultado.cantidad_pares).toBe(60);
      expect(resultado.total).toBe(1500.01);
    });

    it('usa "Desconocido" cuando el producto fue eliminado (caso borde: nombre null)', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { id_producto: null, nombre: null, cantidad: '2', cantidad_pares: '10', total: '0' },
      ]);

      const [resultado] = await service.getTopProductos();

      expect(resultado.nombre).toBe('Desconocido');
      expect(resultado.total).toBe(0);
    });
  });
});
