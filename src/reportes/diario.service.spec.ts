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

  // Ventana de día boliviano (UTC-4) que usa getResumenDiario: 00:00 local =
  // 04:00 UTC del mismo día, 23:59:59.999 local = 03:59:59.999 UTC del
  // siguiente.
  const ventanaBolivia = (dia: string) => {
    const start = new Date(`${dia}T04:00:00.000Z`);
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) };
  };

  // Caso real de producción (pedido #221): creado el 17/09/2026 08:36 UTC y
  // movido a Terminado ese mismo día 08:50 UTC, pero con fecha_entrega
  // prometida para el 24/09 — una semana después. Con el criterio viejo
  // (fecha_entrega = hoy) no aparecía en "Ventas del día" del 17/09 pese a
  // haberse completado ese día; con fecha_completado sí. Es el caso que
  // motivó la columna.
  it('"ventas del día" incluye un pedido terminado hoy con fecha_entrega futura (caso real #221, 17/09/2026, Bs. 4.550)', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-17T12:00:00.000Z') });
    const { start, end } = ventanaBolivia('2026-09-17');

    const pedido221 = {
      id_pedido: 221,
      total: 4550,
      fecha_entrega: '2026-09-24',                          // entrega prometida: la semana que viene
      fecha_completado: new Date('2026-09-17T08:50:34.357Z'), // pero se completó hoy
      cliente: { nombre: 'Cliente 221' },
      producto: { nombre_modelo: 'Producto 221' },
    };

    mockPedidoRepo.find
      .mockResolvedValueOnce([pedido221])  // pedidosCreados (también se creó hoy)
      .mockResolvedValueOnce([pedido221])  // pedidosMovidos
      .mockResolvedValueOnce([pedido221]); // pedidosTerminados ("ventas del día")

    const data = await service.getResumenDiario();

    // El filtro ya no mira fecha_entrega: mira el instante de completado
    // dentro de la ventana del día boliviano.
    expect(mockPedidoRepo.find).toHaveBeenNthCalledWith(3, {
      where: { estado: 'Terminado', fecha_completado: Between(start, end) },
      relations: ['cliente', 'producto'],
    });
    expect(data.pedidosTerminados).toHaveLength(1);
    expect(data.pedidosTerminados[0].id_pedido).toBe(221);
    expect(data.ventasDia).toBe(4550);
    expect(data.resumen.totalVentasDia).toBe(4550);
  });

  // Caso real de la auditoría de reportes (junio 2026): para el 15/06/2026
  // (hora Bolivia) hubo 3 pedidos reales (#9, #146, #172) por Bs. 13.680.
  // El monto agregado se mantiene con el criterio nuevo — lo que cambia es
  // qué fecha define "del día", no cómo se suma.
  it('"ventas del día" filtra por fecha_completado = hoy + Terminado (caso real: 15/06/2026, 3 pedidos, Bs. 13.680)', async () => {
    jest.useFakeTimers({ now: new Date('2026-06-15T12:00:00.000Z') });
    const { start, end } = ventanaBolivia('2026-06-15');

    const pedidosTerminadosReales = [
      { id_pedido: 9,   total: 6240, fecha_completado: new Date('2026-06-15T14:00:00.000Z'), cliente: { nombre: 'Cliente 1' }, producto: { nombre_modelo: 'Producto 1' } },
      { id_pedido: 146, total: 3720, fecha_completado: new Date('2026-06-15T16:30:00.000Z'), cliente: { nombre: 'Cliente 2' }, producto: { nombre_modelo: 'Producto 2' } },
      { id_pedido: 172, total: 3720, fecha_completado: new Date('2026-06-15T20:15:00.000Z'), cliente: { nombre: 'Cliente 3' }, producto: { nombre_modelo: 'Producto 3' } },
    ];

    mockPedidoRepo.find
      .mockResolvedValueOnce([])                    // pedidosCreados
      .mockResolvedValueOnce([])                     // pedidosMovidos
      .mockResolvedValueOnce(pedidosTerminadosReales); // pedidosTerminados ("ventas del día")

    const data = await service.getResumenDiario();

    expect(mockPedidoRepo.find).toHaveBeenNthCalledWith(3, {
      where: { estado: 'Terminado', fecha_completado: Between(start, end) },
      relations: ['cliente', 'producto'],
    });
    expect(data.ventasDia).toBe(13680);
    expect(data.resumen.totalVentasDia).toBe(13680);
    expect(data.pedidosTerminados).toHaveLength(3);
  });

  it('caso borde: sin pedidos completados hoy, ventasDia es 0 sin dividir entre cero', async () => {
    jest.useFakeTimers({ now: new Date('2026-06-16T12:00:00.000Z') });
    const { start, end } = ventanaBolivia('2026-06-16');

    mockPedidoRepo.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const data = await service.getResumenDiario();

    expect(mockPedidoRepo.find).toHaveBeenNthCalledWith(3, {
      where: { estado: 'Terminado', fecha_completado: Between(start, end) },
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
