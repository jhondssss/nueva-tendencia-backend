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
