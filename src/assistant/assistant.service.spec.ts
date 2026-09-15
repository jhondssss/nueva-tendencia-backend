import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AssistantService } from './assistant.service';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { KardexMovimiento } from '../kardex/entities/kardex.entity';
import { Auditoria } from '../auditoria/entities/auditoria.entity';
import { PrediccionService } from '../dashboard/prediccion.service';
import { KpiService } from '../dashboard/kpi.service';

// Se mockea el SDK de Groq para probar la mecánica del loop de function
// calling (ejecución de tools, corte por MAX_TOOL_ROUNDS, filtrado de tools
// por rol) sin gastar cuota real de la API.
const mockCreate = jest.fn();

jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

function respuestaTexto(text: string) {
  return { choices: [{ message: { role: 'assistant', content: text, tool_calls: undefined } }] };
}

function respuestaToolCalls(calls: Array<{ id: string; name: string; args: Record<string, unknown> }>) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: calls.map(c => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
        },
      },
    ],
  };
}

describe('AssistantService · function calling (mock de Groq)', () => {
  let service: AssistantService;
  let pedidoRepo: { find: jest.Mock };
  let productoRepo: { find: jest.Mock };

  const emptyRepo = () => ({ find: jest.fn().mockResolvedValue([]) });

  beforeEach(async () => {
    process.env.GROQ_API_KEY = 'test-key';
    pedidoRepo = emptyRepo();
    productoRepo = emptyRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantService,
        { provide: getRepositoryToken(Pedido), useValue: pedidoRepo },
        { provide: getRepositoryToken(Cliente), useValue: emptyRepo() },
        { provide: getRepositoryToken(Producto), useValue: productoRepo },
        { provide: getRepositoryToken(Insumo), useValue: emptyRepo() },
        { provide: getRepositoryToken(KardexMovimiento), useValue: emptyRepo() },
        { provide: getRepositoryToken(Auditoria), useValue: emptyRepo() },
        { provide: PrediccionService, useValue: { getVentasPorMes: jest.fn().mockResolvedValue([]) } },
        { provide: KpiService, useValue: { getKpis: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();

    service = module.get<AssistantService>(AssistantService);
  });

  afterEach(() => jest.clearAllMocks());

  it('ejecuta la tool pedida por Groq contra la base real y le devuelve el resultado', async () => {
    productoRepo.find.mockResolvedValue([
      { id_producto: 1, nombre_modelo: 'Bota X', marca: 'NT', stock: 2, nivel_minimo: 5, activo: true },
    ]);

    mockCreate
      .mockResolvedValueOnce(
        respuestaToolCalls([{ id: 'call-1', name: 'consultarStock', args: { tipo: 'producto', soloCriticos: true } }]),
      )
      .mockResolvedValueOnce(respuestaTexto('La Bota X tiene stock crítico.'));

    const respuesta = await service.chat('¿Qué productos tienen stock crítico?', [], { role: 'admin' });

    expect(respuesta).toBe('La Bota X tiene stock crítico.');
    expect(productoRepo.find).toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(2);

    const segundaLlamada = mockCreate.mock.calls[1][0];
    const mensajeTool = segundaLlamada.messages.at(-1);
    expect(mensajeTool.role).toBe('tool');
    expect(mensajeTool.tool_call_id).toBe('call-1');
    expect(JSON.parse(mensajeTool.content).output[0].nombre).toBe('Bota X');
  });

  it('no declara al modelo las tools restringidas para rol cliente', async () => {
    mockCreate.mockResolvedValueOnce(respuestaTexto('Tu pedido está en camino.'));

    await service.chat('¿Cómo va mi pedido?', [], { role: 'cliente', clienteId: 7 });

    const primeraLlamada = mockCreate.mock.calls[0][0];
    const nombresDeclarados = primeraLlamada.tools.map((t: any) => t.function.name);

    expect(nombresDeclarados).not.toContain('consultarKardex');
    expect(nombresDeclarados).not.toContain('consultarAuditoria');
    expect(nombresDeclarados).not.toContain('consultarClientes');
    expect(nombresDeclarados).not.toContain('consultarTopClientes');
    expect(nombresDeclarados).toContain('consultarPedidos');
  });

  it('sí declara consultarKardex y consultarAuditoria para rol admin', async () => {
    mockCreate.mockResolvedValueOnce(respuestaTexto('Listo.'));

    await service.chat('Dame un resumen', [], { role: 'admin' });

    const primeraLlamada = mockCreate.mock.calls[0][0];
    const nombresDeclarados = primeraLlamada.tools.map((t: any) => t.function.name);

    expect(nombresDeclarados).toContain('consultarKardex');
    expect(nombresDeclarados).toContain('consultarAuditoria');
  });

  it('corta el loop de tool calls en MAX_TOOL_ROUNDS aunque el modelo siga pidiendo funciones', async () => {
    mockCreate.mockResolvedValue(respuestaToolCalls([{ id: 'loop', name: 'consultarKpisDashboard', args: {} }]));

    await service.chat('Dame un resumen', [], { role: 'admin' });

    // 1 llamada inicial + máximo 5 rondas de tool calls = 6 llamadas a create, nunca más.
    expect(mockCreate).toHaveBeenCalledTimes(6);
  });

  it('ignora un clienteId falso que el modelo intenta pasar en los args de una tool', async () => {
    mockCreate
      .mockResolvedValueOnce(
        respuestaToolCalls([{ id: 'call-1', name: 'consultarPedidos', args: { clienteId: 999, limite: 5 } }]),
      )
      .mockResolvedValueOnce(respuestaTexto('Tu pedido está en camino.'));

    await service.chat('¿Cómo va mi pedido?', [], { role: 'cliente', clienteId: 42 });

    // pedidoRepo.find se llama tanto para el snapshot fijo (buildContextCliente)
    // como para la tool consultarPedidos: en NINGUNO de los dos casos debe
    // colarse el clienteId 999 que "pidió" el modelo.
    expect(pedidoRepo.find).toHaveBeenCalled();
    for (const [{ where }] of pedidoRepo.find.mock.calls) {
      expect(where.cliente).toEqual({ id_cliente: 42 });
    }
  });
});
