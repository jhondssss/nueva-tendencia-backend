import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { ExcelService } from './excel.service';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { KardexMovimiento } from '../kardex/entities/kardex.entity';

async function readWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  return wb;
}

describe('ExcelService', () => {
  let service: ExcelService;

  const mockQueryBuilder = {
    orderBy: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const mockPedidoRepo = { find: jest.fn() };
  const mockClienteRepo = { find: jest.fn() };
  const mockProductoRepo = { createQueryBuilder: jest.fn(() => mockQueryBuilder) };
  const mockKardexRepo = { find: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExcelService,
        { provide: getRepositoryToken(Pedido), useValue: mockPedidoRepo },
        { provide: getRepositoryToken(Cliente), useValue: mockClienteRepo },
        { provide: getRepositoryToken(Producto), useValue: mockProductoRepo },
        { provide: getRepositoryToken(KardexMovimiento), useValue: mockKardexRepo },
      ],
    }).compile();

    service = module.get<ExcelService>(ExcelService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('exportarExcelStock', () => {
    it('marca "Normal" cuando el stock está por encima del mínimo (caso feliz)', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([
        {
          id_producto: 1, nombre_modelo: 'Bota Clásica', marca: 'NT', tipo_calzado: 'Bota',
          color: 'Negro', precio_venta: 250, costo_unidad: 120, stock: 30, nivel_minimo: 10,
          unidad_medida: 'par', activo: true,
        },
      ]);

      const buffer = await service.exportarExcelStock();
      const wb = await readWorkbook(buffer as any);
      const ws = wb.getWorksheet('Stock')!;

      expect(ws.getRow(2).getCell(12).value).toBe('Normal');
    });

    it('marca "CRÍTICO" cuando el stock es igual al nivel mínimo (caso borde: umbral inclusivo)', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([
        {
          id_producto: 2, nombre_modelo: 'Sandalia', marca: 'NT', tipo_calzado: 'Sandalia',
          color: 'Blanco', precio_venta: 150, costo_unidad: 80, stock: 10, nivel_minimo: 10,
          unidad_medida: 'par', activo: true,
        },
      ]);

      const buffer = await service.exportarExcelStock();
      const wb = await readWorkbook(buffer as any);
      const ws = wb.getWorksheet('Stock')!;

      expect(ws.getRow(2).getCell(12).value).toBe('CRÍTICO');
    });

    it('genera solo la fila de encabezado cuando no hay productos (caso borde: lista vacía)', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const buffer = await service.exportarExcelStock();
      const wb = await readWorkbook(buffer as any);
      const ws = wb.getWorksheet('Stock')!;

      expect(ws.rowCount).toBe(1);
    });
  });

  describe('exportarExcelGanancias', () => {
    it('calcula suma total, pares y promedio por pedido (caso feliz)', async () => {
      mockPedidoRepo.find.mockResolvedValue([
        { id_pedido: 1, cliente: { nombre: 'Juan', id_cliente: 1 }, producto: { nombre_modelo: 'Bota' }, cantidad: 2, cantidad_pares: 24, total: 1000, fecha_entrega: '2026-01-10' },
        { id_pedido: 2, cliente: { nombre: 'Ana', id_cliente: 2 }, producto: { nombre_modelo: 'Sandalia' }, cantidad: 1, cantidad_pares: 12, total: 500, fecha_entrega: '2026-01-20' },
      ]);

      const buffer = await service.exportarExcelGanancias(1, 2026);
      const wb = await readWorkbook(buffer as any);
      const ws = wb.getWorksheet('Ganancias Enero 2026')!;

      // fila 2 y 3 son datos, fila 4 en blanco, filas 5-8 son el resumen
      const totalRow = ws.getRow(7); // 'Total ganancias (Bs.)'
      const promedioRow = ws.getRow(8); // 'Promedio por pedido (Bs.)'

      expect(totalRow.getCell(1).value).toBe('Total ganancias (Bs.)');
      expect(totalRow.getCell(6).value).toBe(1500);
      expect(promedioRow.getCell(1).value).toBe('Promedio por pedido (Bs.)');
      expect(promedioRow.getCell(6).value).toBe(750);
    });

    it('evita la división por cero y reporta promedio 0 cuando no hay pedidos (caso borde)', async () => {
      mockPedidoRepo.find.mockResolvedValue([]);

      const buffer = await service.exportarExcelGanancias(2, 2026);
      const wb = await readWorkbook(buffer as any);
      const ws = wb.getWorksheet('Ganancias Febrero 2026')!;

      const promedioRow = ws.getRow(6); // sin filas de datos: fila 2 en blanco, 3-6 resumen
      expect(promedioRow.getCell(1).value).toBe('Promedio por pedido (Bs.)');
      expect(promedioRow.getCell(6).value).toBe(0);
    });
  });
});
