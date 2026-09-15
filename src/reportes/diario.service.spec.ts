import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Between } from 'typeorm';
import { DiarioService } from './diario.service';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { KardexMovimiento } from '../kardex/entities/kardex.entity';
import { Auditoria } from '../auditoria/entities/auditoria.entity';

describe('DiarioService', () => {
  let service: DiarioService;

  const mockPedidoRepo = { find: jest.fn() };
  const mockQueryBuilder = { where: jest.fn().mockReturnThis(), getMany: jest.fn() };
  const mockProductoRepo = { createQueryBuilder: jest.fn(() => mockQueryBuilder) };
  const mockInsumoRepo = { createQueryBuilder: jest.fn(() => mockQueryBuilder) };
  const mockKardexRepo = { find: jest.fn() };
  const mockAuditoriaRepo = { find: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiarioService,
        { provide: getRepositoryToken(Pedido), useValue: mockPedidoRepo },
        { provide: getRepositoryToken(Producto), useValue: mockProductoRepo },
        { provide: getRepositoryToken(Insumo), useValue: mockInsumoRepo },
        { provide: getRepositoryToken(KardexMovimiento), useValue: mockKardexRepo },
        { provide: getRepositoryToken(Auditoria), useValue: mockAuditoriaRepo },
      ],
    }).compile();

    service = module.get<DiarioService>(DiarioService);

    mockQueryBuilder.getMany.mockResolvedValue([]);
    mockKardexRepo.find.mockResolvedValue([]);
    mockAuditoriaRepo.find.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  // Caso real de la auditoría de reportes (junio 2026): para el 15/06/2026
  // (hora Bolivia), el criterio viejo (fecha_actualizacion = hoy + Terminado)
  // devolvía 0 pedidos, mientras que fecha_entrega = hoy + Terminado (el
  // mismo criterio que ya usan Ventas, Ganancias y Pedidos Entregados)
  // devuelve los 3 pedidos reales (#9, #146, #172) por Bs. 13.680 que sí
  // tenían entrega programada ese día.
  it('"ventas del día" filtra por fecha_entrega = hoy + Terminado (caso real: 15/06/2026, 3 pedidos, Bs. 13.680)', async () => {
    jest.useFakeTimers({ now: new Date('2026-06-15T12:00:00.000Z') });

    const pedidosTerminadosReales = [
      { id_pedido: 9,   total: 6240, fecha_entrega: '2026-06-15', cliente: { nombre: 'Cliente 1' }, producto: { nombre_modelo: 'Producto 1' } },
      { id_pedido: 146, total: 3720, fecha_entrega: '2026-06-15', cliente: { nombre: 'Cliente 2' }, producto: { nombre_modelo: 'Producto 2' } },
      { id_pedido: 172, total: 3720, fecha_entrega: '2026-06-15', cliente: { nombre: 'Cliente 3' }, producto: { nombre_modelo: 'Producto 3' } },
    ];

    mockPedidoRepo.find
      .mockResolvedValueOnce([])                    // pedidosCreados
      .mockResolvedValueOnce([])                     // pedidosMovidos
      .mockResolvedValueOnce(pedidosTerminadosReales); // pedidosTerminados ("ventas del día")

    const data = await service.getResumenDiario();

    expect(mockPedidoRepo.find).toHaveBeenNthCalledWith(3, {
      where: { estado: 'Terminado', fecha_entrega: '2026-06-15' },
      relations: ['cliente', 'producto'],
    });
    expect(data.ventasDia).toBe(13680);
    expect(data.resumen.totalVentasDia).toBe(13680);
    expect(data.pedidosTerminados).toHaveLength(3);
  });

  it('caso borde: sin pedidos con fecha_entrega hoy, ventasDia es 0 sin dividir entre cero', async () => {
    jest.useFakeTimers({ now: new Date('2026-06-16T12:00:00.000Z') });

    mockPedidoRepo.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const data = await service.getResumenDiario();

    expect(mockPedidoRepo.find).toHaveBeenNthCalledWith(3, {
      where: { estado: 'Terminado', fecha_entrega: '2026-06-16' },
      relations: ['cliente', 'producto'],
    });
    expect(data.ventasDia).toBe(0);
  });

  // "Pedidos movidos" no debe tocarse: sigue trackeando actividad (cualquier
  // edición del pedido) vía fecha_actualizacion, no ventas.
  it('"pedidos movidos" sigue filtrando por fecha_actualizacion (no cambia con este fix)', async () => {
    jest.useFakeTimers({ now: new Date('2026-06-15T12:00:00.000Z') });

    mockPedidoRepo.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.getResumenDiario();

    expect(mockPedidoRepo.find).toHaveBeenNthCalledWith(2, {
      where: {
        fecha_actualizacion: Between(
          new Date('2026-06-15T04:00:00.000Z'),
          new Date('2026-06-16T03:59:59.999Z'),
        ),
      },
      relations: ['cliente', 'producto'],
    });
  });

  // "Pedidos creados" tampoco cambia: sigue trackeando creación vía
  // fecha_creacion.
  it('"pedidos creados" sigue filtrando por fecha_creacion (no cambia con este fix)', async () => {
    jest.useFakeTimers({ now: new Date('2026-06-15T12:00:00.000Z') });

    mockPedidoRepo.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.getResumenDiario();

    expect(mockPedidoRepo.find).toHaveBeenNthCalledWith(1, {
      where: {
        fecha_creacion: Between(
          new Date('2026-06-15T04:00:00.000Z'),
          new Date('2026-06-16T03:59:59.999Z'),
        ),
      },
      relations: ['cliente', 'producto'],
    });
  });
});
