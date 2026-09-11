import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PdfService } from './pdf.service';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { KardexMovimiento } from '../kardex/entities/kardex.entity';

// pdfkit produce un stream binario comprimido: no es viable parsear su texto
// sin una dependencia nueva. Estas pruebas verifican que las funciones de
// cálculo (totales, porcentajes, inversión estimada, promedios) no revienten
// con datos típicos ni con los casos borde que dividen entre cero o dejan
// relaciones nulas, y que el PDF resultante sea válido.
function expectValidPdf(buffer: Buffer) {
  expect(Buffer.isBuffer(buffer)).toBe(true);
  expect(buffer.length).toBeGreaterThan(0);
  expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
}

describe('PdfService', () => {
  let service: PdfService;

  const mockPedidoRepo = { find: jest.fn() };
  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  const mockProductoRepo = { createQueryBuilder: jest.fn(() => mockQueryBuilder) };
  const mockInsumoRepo = { createQueryBuilder: jest.fn(() => mockQueryBuilder) };
  const mockKardexRepo = { find: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfService,
        { provide: getRepositoryToken(Pedido), useValue: mockPedidoRepo },
        { provide: getRepositoryToken(Producto), useValue: mockProductoRepo },
        { provide: getRepositoryToken(Insumo), useValue: mockInsumoRepo },
        { provide: getRepositoryToken(KardexMovimiento), useValue: mockKardexRepo },
      ],
    }).compile();

    service = module.get<PdfService>(PdfService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generarPDFVentas', () => {
    it('agrupa ventas por mes y calcula porcentajes del total (caso feliz)', async () => {
      mockPedidoRepo.find.mockResolvedValue([
        { fecha_entrega: '2026-01-15', total: 300 },
        { fecha_entrega: '2026-02-10', total: 700 },
      ]);

      const buffer = await service.generarPDFVentas(2026, 'admin@nt.com');

      expectValidPdf(buffer);
    });

    it('no revienta por división entre cero cuando no hay ventas en el año (caso borde)', async () => {
      mockPedidoRepo.find.mockResolvedValue([]);

      const buffer = await service.generarPDFVentas(2026);

      expectValidPdf(buffer);
    });
  });

  describe('generarPDFStock', () => {
    it('calcula la inversión estimada de reposición (caso feliz)', async () => {
      mockQueryBuilder.getMany
        .mockResolvedValueOnce([
          { nombre_modelo: 'Bota', marca: 'NT', stock: 2, nivel_minimo: 10, precio_venta: 200, costo_unidad: 90 },
        ])
        .mockResolvedValueOnce([
          { nombre: 'Pegamento', categoria: { nombre: 'Adhesivo' }, stock: 1, nivel_minimo: 5, precio_unitario: 30 },
        ]);

      const buffer = await service.generarPDFStock(undefined, 'admin@nt.com');

      expectValidPdf(buffer);
    });

    it('genera el reporte sin productos ni insumos críticos (caso borde: listas vacías)', async () => {
      mockQueryBuilder.getMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const buffer = await service.generarPDFStock();

      expectValidPdf(buffer);
    });
  });

  describe('generarPDFGanancias', () => {
    it('calcula el promedio por pedido (caso feliz)', async () => {
      mockPedidoRepo.find.mockResolvedValue([
        { id_pedido: 1, cliente: { nombre: 'Juan', id_cliente: 1 }, producto: { nombre_modelo: 'Bota' }, cantidad: 1, cantidad_pares: 12, total: 1000, fecha_entrega: '2026-01-10' },
      ]);

      const buffer = await service.generarPDFGanancias(1, 2026, 'admin@nt.com');

      expectValidPdf(buffer);
    });

    it('evita la división entre cero cuando no hay pedidos entregados en el mes (caso borde)', async () => {
      mockPedidoRepo.find.mockResolvedValue([]);

      const buffer = await service.generarPDFGanancias(2, 2026);

      expectValidPdf(buffer);
    });
  });
});
