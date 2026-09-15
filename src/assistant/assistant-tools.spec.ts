import { executeTool, AssistantRepos } from './assistant-tools';
import { Role } from '../auth/enums/role.enum';

function buildRepos(overrides: Partial<AssistantRepos> = {}): AssistantRepos {
  const emptyRepo = { find: jest.fn().mockResolvedValue([]) };
  return {
    pedidoRepo: emptyRepo as any,
    clienteRepo: emptyRepo as any,
    productoRepo: emptyRepo as any,
    insumoRepo: emptyRepo as any,
    kardexRepo: emptyRepo as any,
    auditoriaRepo: emptyRepo as any,
    prediccionService: {} as any,
    kpiService: {} as any,
    downloadTokenService: { generar: jest.fn().mockReturnValue('mock-token') } as any,
    ...overrides,
  };
}

describe('assistant-tools · executeTool · autorización por rol', () => {
  it('rechaza consultarKardex para rol cliente sin ejecutar ninguna consulta', async () => {
    const kardexRepo = { find: jest.fn() };
    const repos = buildRepos({ kardexRepo: kardexRepo as any });

    const result = await executeTool(
      'consultarKardex',
      { limite: 10 },
      { role: Role.CLIENTE, clienteId: 42 },
      repos,
    );

    expect(result).toEqual({ error: expect.any(String) });
    expect(kardexRepo.find).not.toHaveBeenCalled();
  });

  it('rechaza consultarAuditoria para rol cliente sin ejecutar ninguna consulta', async () => {
    const auditoriaRepo = { find: jest.fn() };
    const repos = buildRepos({ auditoriaRepo: auditoriaRepo as any });

    const result = await executeTool(
      'consultarAuditoria',
      {},
      { role: Role.CLIENTE, clienteId: 42 },
      repos,
    );

    expect(result).toEqual({ error: expect.any(String) });
    expect(auditoriaRepo.find).not.toHaveBeenCalled();
  });

  it('rechaza consultarAuditoria para rol operario (solo admin puede)', async () => {
    const auditoriaRepo = { find: jest.fn() };
    const repos = buildRepos({ auditoriaRepo: auditoriaRepo as any });

    const result = await executeTool('consultarAuditoria', {}, { role: Role.OPERARIO }, repos);

    expect(result).toEqual({ error: expect.any(String) });
    expect(auditoriaRepo.find).not.toHaveBeenCalled();
  });

  it('permite consultarKardex para rol admin y sí ejecuta la consulta', async () => {
    const kardexRepo = { find: jest.fn().mockResolvedValue([]) };
    const repos = buildRepos({ kardexRepo: kardexRepo as any });

    const result = await executeTool('consultarKardex', {}, { role: Role.ADMIN }, repos);

    expect(result).toEqual({ output: [] });
    expect(kardexRepo.find).toHaveBeenCalledTimes(1);
  });

  it('rechaza una función inexistente aunque el nombre no esté ni declarado', async () => {
    const repos = buildRepos();
    const result = await executeTool('borrarTodo', {}, { role: Role.ADMIN }, repos);
    expect(result).toEqual({ error: expect.any(String) });
  });

  it('rechaza consultarTopClientes para rol cliente sin ejecutar ninguna consulta', async () => {
    const pedidoRepo = { find: jest.fn(), createQueryBuilder: jest.fn() };
    const repos = buildRepos({ pedidoRepo: pedidoRepo as any });

    const result = await executeTool(
      'consultarTopClientes',
      { limite: 5 },
      { role: Role.CLIENTE, clienteId: 42 },
      repos,
    );

    expect(result).toEqual({ error: expect.any(String) });
    expect(pedidoRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});

describe('assistant-tools · executeTool · scoping de cliente', () => {
  it('ignora el clienteId que el modelo intenta forzar en los args y usa el de la sesión', async () => {
    const pedidoRepo = { find: jest.fn().mockResolvedValue([]) };
    const repos = buildRepos({ pedidoRepo: pedidoRepo as any });

    await executeTool(
      'consultarPedidos',
      { clienteId: 999, limite: 5 }, // el modelo "pide" los pedidos del cliente 999
      { role: Role.CLIENTE, clienteId: 42 }, // pero la sesión real es el cliente 42
      repos,
    );

    expect(pedidoRepo.find).toHaveBeenCalledTimes(1);
    const [{ where }] = pedidoRepo.find.mock.calls[0];
    expect(where.cliente).toEqual({ id_cliente: 42 });
    expect(where.cliente).not.toEqual({ id_cliente: 999 });
  });

  it('no aplica ningún filtro de cliente para roles internos (admin/operario)', async () => {
    const pedidoRepo = { find: jest.fn().mockResolvedValue([]) };
    const repos = buildRepos({ pedidoRepo: pedidoRepo as any });

    await executeTool('consultarPedidos', {}, { role: Role.ADMIN }, repos);

    const [{ where }] = pedidoRepo.find.mock.calls[0];
    expect(where.cliente).toBeUndefined();
  });

  it('rechaza cualquier tool para rol cliente sin clienteId en la sesión', async () => {
    const pedidoRepo = { find: jest.fn() };
    const repos = buildRepos({ pedidoRepo: pedidoRepo as any });

    const result = await executeTool('consultarPedidos', {}, { role: Role.CLIENTE }, repos);

    expect(result).toEqual({ error: expect.any(String) });
    expect(pedidoRepo.find).not.toHaveBeenCalled();
  });
});

describe('assistant-tools · executeTool · consultarCatalogoProductos no filtra costo_unidad por rol', () => {
  const productoMock = {
    id_producto: 1,
    nombre_modelo: 'Bota X',
    marca: 'NT',
    precio_venta: 250,
    costo_unidad: 120,
    stock: 10,
    nivel_minimo: 3,
    activo: true,
    categoria: null,
  };

  it('nunca incluye costo_unidad en la respuesta para rol cliente (dato interno de producción)', async () => {
    const productoRepo = { find: jest.fn().mockResolvedValue([productoMock]) };
    const repos = buildRepos({ productoRepo: productoRepo as any });

    const result = await executeTool(
      'consultarCatalogoProductos',
      {},
      { role: Role.CLIENTE, clienteId: 42 },
      repos,
    );

    const output = (result as any).output;
    expect(output).toHaveLength(1);
    expect(output[0]).not.toHaveProperty('costo_unidad');
  });

  it('incluye costo_unidad en la respuesta para rol admin/operario, para razonar sobre costos', async () => {
    const productoRepo = { find: jest.fn().mockResolvedValue([productoMock]) };
    const repos = buildRepos({ productoRepo: productoRepo as any });

    const result = await executeTool('consultarCatalogoProductos', {}, { role: Role.ADMIN }, repos);

    const output = (result as any).output;
    expect(output).toHaveLength(1);
    expect(output[0].costo_unidad).toBe(120);
  });
});

describe('assistant-tools · executeTool · consultarTopClientes', () => {
  it('agrega en SQL (SUM por cliente, ordenado desc) y devuelve el resultado ya resuelto', async () => {
    const rows = [
      { id_cliente: '1', nombre: 'Ana', apellido: 'Pérez', total: '500.00', cantidad_pedidos: '3' },
      { id_cliente: '2', nombre: 'Luis', apellido: null, total: '200.00', cantidad_pedidos: '1' },
    ];
    const qb: any = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    };
    const pedidoRepo = { find: jest.fn(), createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const repos = buildRepos({ pedidoRepo: pedidoRepo as any });

    const result = await executeTool('consultarTopClientes', { mes: 9, limite: 2 }, { role: Role.ADMIN }, repos);

    expect(pedidoRepo.createQueryBuilder).toHaveBeenCalledWith('p');
    expect(qb.where).toHaveBeenCalledWith('p.estado = :terminado', { terminado: 'Terminado' });
    expect(qb.andWhere).toHaveBeenCalledWith('EXTRACT(MONTH FROM p.fecha_entrega) = :mes', { mes: 9 });
    expect(qb.limit).toHaveBeenCalledWith(2);
    expect(result).toEqual({
      criterio: 'Solo pedidos Terminado (ventas concretadas)',
      output: [
        { id: 1, nombre: 'Ana Pérez', total: 500, cantidad_pedidos: 3 },
        { id: 2, nombre: 'Luis', total: 200, cantidad_pedidos: 1 },
      ],
    });
  });

  it('siempre incluye el campo "criterio" aunque no haya clientes', async () => {
    const qb: any = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    const pedidoRepo = { find: jest.fn(), createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const repos = buildRepos({ pedidoRepo: pedidoRepo as any });

    const result = await executeTool('consultarTopClientes', {}, { role: Role.OPERARIO }, repos);

    expect(result).toEqual({ criterio: 'Solo pedidos Terminado (ventas concretadas)', output: [] });
  });
});

describe('assistant-tools · executeTool · generarReporte', () => {
  const ORIGINAL_ENV = process.env.BACKEND_URL;

  afterEach(() => {
    process.env.BACKEND_URL = ORIGINAL_ENV;
  });

  it('rechaza generarReporte para rol cliente', async () => {
    const repos = buildRepos();

    const result = await executeTool(
      'generarReporte',
      { tipo: 'pedidos' },
      { role: Role.CLIENTE, clienteId: 42 },
      repos,
    );

    expect(result).toEqual({ error: expect.any(String) });
  });

  it('rechaza un tipo de reporte inexistente', async () => {
    const repos = buildRepos();

    const result = await executeTool('generarReporte', { tipo: 'ganancias-2' }, { role: Role.ADMIN }, repos);

    expect(result).toEqual({ error: expect.any(String) });
  });

  it('rechaza reportes exclusivos de admin (ventas, ganancias) para rol operario', async () => {
    const repos = buildRepos();

    const ventas = await executeTool('generarReporte', { tipo: 'ventas' }, { role: Role.OPERARIO }, repos);
    const ganancias = await executeTool('generarReporte', { tipo: 'ganancias' }, { role: Role.OPERARIO }, repos);

    expect(ventas).toEqual({ error: expect.any(String) });
    expect(ganancias).toEqual({ error: expect.any(String) });
  });

  it('permite a operario generar reportes de pedidos, stock, kardex y pedidos-entregados', async () => {
    const repos = buildRepos();

    for (const tipo of ['pedidos', 'stock', 'kardex', 'pedidos-entregados']) {
      const result = await executeTool('generarReporte', { tipo }, { role: Role.OPERARIO, userId: 1 }, repos);
      expect(result).toHaveProperty('output.url');
    }
  });

  it('arma la URL de ventas con la base del backend y el año pedido, sin mes (todos los meses)', async () => {
    process.env.BACKEND_URL = 'https://api.nueva-tendencia.com';
    const repos = buildRepos();

    const result: any = await executeTool(
      'generarReporte',
      { tipo: 'ventas', filtros: { anio: 2025 } },
      { role: Role.ADMIN, userId: 1 },
      repos,
    );

    expect(result.output.url).toBe('https://api.nueva-tendencia.com/reportes/pdf/ventas?year=2025&token=mock-token');
    expect(result.output.descripcion).toBe('Reporte de ventas — Todos los meses (2025)');
  });

  it('arma la URL de ventas con mes+año cuando se pide un mes específico', async () => {
    process.env.BACKEND_URL = 'https://api.nueva-tendencia.com';
    const repos = buildRepos();

    const result: any = await executeTool(
      'generarReporte',
      { tipo: 'ventas', filtros: { mes: 9, anio: 2026 } },
      { role: Role.ADMIN, userId: 1 },
      repos,
    );

    expect(result.output.url).toBe(
      'https://api.nueva-tendencia.com/reportes/pdf/ventas?year=2026&month=9&token=mock-token',
    );
    expect(result.output.descripcion).toBe('Reporte de ventas — Septiembre 2026');
  });

  it('usa http://localhost:3000 como base cuando no hay BACKEND_URL configurado', async () => {
    delete process.env.BACKEND_URL;
    const repos = buildRepos();

    const result: any = await executeTool('generarReporte', { tipo: 'stock' }, { role: Role.ADMIN, userId: 1 }, repos);

    expect(result.output.url).toBe('http://localhost:3000/reportes/pdf/stock?token=mock-token');
  });

  it('arma la URL de ganancias con mes y año, y una descripción legible', async () => {
    process.env.BACKEND_URL = 'https://api.nueva-tendencia.com';
    const repos = buildRepos();

    const result: any = await executeTool(
      'generarReporte',
      { tipo: 'ganancias', filtros: { mes: 9, anio: 2026 } },
      { role: Role.ADMIN, userId: 1 },
      repos,
    );

    expect(result.output.url).toBe(
      'https://api.nueva-tendencia.com/reportes/pdf/ganancias?month=9&year=2026&token=mock-token',
    );
    expect(result.output.descripcion).toBe('Reporte de ganancias de septiembre 2026');
  });

  it('arma la URL de pedidos con los filtros de cliente, categoría y rango de fechas', async () => {
    process.env.BACKEND_URL = 'https://api.nueva-tendencia.com';
    const repos = buildRepos();

    const result: any = await executeTool(
      'generarReporte',
      {
        tipo: 'pedidos',
        filtros: { cliente: 'Ana', categoria: 'adulto', desde: '2026-09-01', hasta: '2026-09-30' },
      },
      { role: Role.ADMIN, userId: 1 },
      repos,
    );

    expect(result.output.url).toBe(
      'https://api.nueva-tendencia.com/reportes/pdf/pedidos?cliente=Ana&categoria=adulto&desde=2026-09-01&hasta=2026-09-30&token=mock-token',
    );
    expect(result.output.descripcion).toBe('Reporte de pedidos (2026-09-01 a 2026-09-30)');
  });

  it('arma la URL de kardex con insumo_id, tipo y origen usando los mismos nombres de query param que el endpoint', async () => {
    process.env.BACKEND_URL = 'https://api.nueva-tendencia.com';
    const repos = buildRepos();

    const result: any = await executeTool(
      'generarReporte',
      { tipo: 'kardex', filtros: { insumoId: 7, tipoMovimiento: 'salida', origen: 'manual' } },
      { role: Role.ADMIN, userId: 1 },
      repos,
    );

    expect(result.output.url).toBe(
      'https://api.nueva-tendencia.com/reportes/pdf/kardex?insumo_id=7&tipo=salida&origen=manual&token=mock-token',
    );
  });

  it('ignora filtros con formato inválido en lugar de romper o propagarlos', async () => {
    process.env.BACKEND_URL = 'https://api.nueva-tendencia.com';
    const repos = buildRepos();

    const result: any = await executeTool(
      'generarReporte',
      { tipo: 'stock', filtros: { categoria: 'gigante' } },
      { role: Role.ADMIN, userId: 1 },
      repos,
    );

    expect(result.output.url).toBe('https://api.nueva-tendencia.com/reportes/pdf/stock?token=mock-token');
  });

  it('genera el token de descarga con el sub, email y rol del usuario del chat', async () => {
    const generar = jest.fn().mockReturnValue('un-token-real');
    const repos = buildRepos({ downloadTokenService: { generar } as any });

    await executeTool(
      'generarReporte',
      { tipo: 'stock' },
      { role: Role.ADMIN, userId: 7, email: 'admin@nt.com' },
      repos,
    );

    expect(generar).toHaveBeenCalledWith({ sub: 7, email: 'admin@nt.com', role: Role.ADMIN });
  });

  it('rechaza generarReporte si no se puede identificar el usuario (sin userId)', async () => {
    const repos = buildRepos();

    const result = await executeTool('generarReporte', { tipo: 'stock' }, { role: Role.ADMIN }, repos);

    expect(result).toEqual({ error: expect.any(String) });
  });
});
