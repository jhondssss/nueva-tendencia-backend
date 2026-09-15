import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Between } from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
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

  const mockPedidoRepo = { find: jest.fn(), findOne: jest.fn() };
  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  const mockProductoRepo = { createQueryBuilder: jest.fn(() => mockQueryBuilder) };
  const mockInsumoRepo = { createQueryBuilder: jest.fn(() => mockQueryBuilder), findOneBy: jest.fn() };
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

    it('con mes+año, desglosa por día en lugar de por mes (comportamiento actual sin filtro sigue intacto)', async () => {
      mockPedidoRepo.find.mockResolvedValue([
        { fecha_entrega: '2026-09-05', total: 400 },
        { fecha_entrega: '2026-09-20', total: 600 },
      ]);

      const buffer = await service.generarPDFVentas(2026, 'admin@nt.com', 9);

      expectValidPdf(buffer);
      expect(mockPedidoRepo.find).toHaveBeenCalledWith({
        where: { estado: 'Terminado', fecha_entrega: Between('2026-09-01', '2026-09-30') },
      });
    });

    it('con mes+año sin ventas en el mes, no revienta por división entre cero (caso borde)', async () => {
      mockPedidoRepo.find.mockResolvedValue([]);

      const buffer = await service.generarPDFVentas(2026, undefined, 2);

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

  describe('generarPDFPedidosEntregados', () => {
    // Caso real de la auditoría de reportes (junio 2026): filtrar por
    // fecha_entrega + estado Terminado da 53 pedidos / Bs. 283.926 — el
    // mismo criterio "oficial" que usan Ventas y Ganancias. Antes del fix,
    // el reporte filtraba por fecha_creacion y daba un número distinto
    // (36 pedidos / Bs. 253.150) para el mismo rango.
    it('filtra por fecha_entrega (no fecha_creacion) cuando se pasa un rango desde/hasta', async () => {
      mockPedidoRepo.find.mockResolvedValue([
        { id_pedido: 1, cliente: { nombre: 'Juan', id_cliente: 1 }, producto: { nombre_modelo: 'Bota' }, categoria: 'adulto', cantidad: 1, unidad: 'docena', cantidad_pares: 12, total: 150000, fecha_entrega: '2026-06-10' },
        { id_pedido: 2, cliente: { nombre: 'Ana', id_cliente: 2 }, producto: { nombre_modelo: 'Sandalia' }, categoria: 'nino', cantidad: 1, unidad: 'par', cantidad_pares: 1, total: 133926, fecha_entrega: '2026-06-25' },
      ]);

      const buffer = await service.generarPDFPedidosEntregados(
        { desde: '2026-06-01', hasta: '2026-06-30' },
        'admin@nt.com',
      );

      expectValidPdf(buffer);
      expect(mockPedidoRepo.find).toHaveBeenCalledWith({
        where: { fecha_entrega: Between('2026-06-01', '2026-06-30'), estado: 'Terminado' },
        relations: ['cliente', 'producto'],
        order: { id_pedido: 'ASC' },
      });
    });

    it('sin filtro, solo aplica estado Terminado (sin restricción de fecha)', async () => {
      mockPedidoRepo.find.mockResolvedValue([]);

      const buffer = await service.generarPDFPedidosEntregados();

      expectValidPdf(buffer);
      expect(mockPedidoRepo.find).toHaveBeenCalledWith({
        where: { estado: 'Terminado' },
        relations: ['cliente', 'producto'],
        order: { id_pedido: 'ASC' },
      });
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

  describe('generarComprobantePedido', () => {
    const pedidoBase = {
      id_pedido: 42,
      cliente: { id_cliente: 7, nombre: 'Ana', apellido: 'Gómez' },
      producto: { nombre_modelo: 'Bota Urbana' },
      categoria: 'adulto',
      cantidad_pares: 12,
      estado: 'Terminado',
      fecha_creacion: new Date('2026-08-01T10:00:00Z'),
      fecha_entrega: '2026-08-15',
      total: 1500,
      talles: [
        { id_talla: 1, talla: 40, cantidad_pares: 6 },
        { id_talla: 2, talla: 41, cantidad_pares: 6 },
      ],
    };

    it('genera el comprobante con los datos reales del pedido (caso feliz, sin restricción de dueño)', async () => {
      mockPedidoRepo.findOne.mockResolvedValue(pedidoBase);

      const buffer = await service.generarComprobantePedido(42, 'admin@nt.com');

      expectValidPdf(buffer);
      expect(mockPedidoRepo.findOne).toHaveBeenCalledWith({
        where: { id_pedido: 42 },
        relations: ['cliente', 'producto', 'talles'],
      });
    });

    it('lanza NotFoundException si el pedido no existe', async () => {
      mockPedidoRepo.findOne.mockResolvedValue(null);

      await expect(service.generarComprobantePedido(999, 'admin@nt.com')).rejects.toThrow(NotFoundException);
    });

    it('permite el comprobante cuando el clienteId coincide con el dueño del pedido (cliente pidiendo su propio pedido)', async () => {
      mockPedidoRepo.findOne.mockResolvedValue(pedidoBase);

      const buffer = await service.generarComprobantePedido(42, undefined, 7);

      expectValidPdf(buffer);
    });

    it('rechaza con ForbiddenException cuando el clienteId no coincide con el dueño del pedido (pedido ajeno)', async () => {
      mockPedidoRepo.findOne.mockResolvedValue(pedidoBase);

      await expect(service.generarComprobantePedido(42, undefined, 999)).rejects.toThrow(ForbiddenException);
    });

    it('genera el comprobante sin sección de tallas cuando el pedido no tiene distribución personalizada (caso borde)', async () => {
      mockPedidoRepo.findOne.mockResolvedValue({ ...pedidoBase, talles: [] });

      const buffer = await service.generarComprobantePedido(42);

      expectValidPdf(buffer);
    });

    it('incluye el tipo de cuero cuando el pedido tiene cuero_insumo_id (caso feliz)', async () => {
      mockPedidoRepo.findOne.mockResolvedValue({ ...pedidoBase, cuero_insumo_id: 14 });
      mockInsumoRepo.findOneBy.mockResolvedValue({ id_insumo: 14, nombre: 'Cuero Nubuck' });

      const buffer = await service.generarComprobantePedido(42);

      expect(mockInsumoRepo.findOneBy).toHaveBeenCalledWith({ id_insumo: 14 });
      expectValidPdf(buffer);
    });

    it('muestra "—" como tipo de cuero cuando el pedido no tiene cuero_insumo_id (caso borde)', async () => {
      mockPedidoRepo.findOne.mockResolvedValue({ ...pedidoBase, cuero_insumo_id: null });

      const buffer = await service.generarComprobantePedido(42);

      expect(mockInsumoRepo.findOneBy).not.toHaveBeenCalled();
      expectValidPdf(buffer);
    });
  });
});
