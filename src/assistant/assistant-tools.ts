import { Between, LessThanOrEqual, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { Role } from '../auth/enums/role.enum';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { KardexMovimiento } from '../kardex/entities/kardex.entity';
import { Auditoria } from '../auditoria/entities/auditoria.entity';
import { PrediccionService } from '../dashboard/prediccion.service';
import { KpiService } from '../dashboard/kpi.service';
import { esStockCritico } from '../common/stock-critico';
import { DownloadTokenService } from '../auth/download-token.service';
import type { AssistantUser } from './assistant.service';

// ══════════════════════════════════════════════════════════════════════════
// Declaraciones expuestas al modelo (function calling, formato OpenAI/Groq)
// ══════════════════════════════════════════════════════════════════════════

export interface AssistantToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const TOOL_DECLARATIONS: AssistantToolDeclaration[] = [
  {
    name: 'consultarPedidos',
    description:
      'Lista pedidos con filtros opcionales. Para el rol cliente, siempre se devuelven únicamente los pedidos del cliente que está preguntando, sin importar qué se pida.',
    parameters: {
      type: 'object',
      properties: {
        estado: { type: 'string', enum: ['Pendiente', 'Cortado', 'Aparado', 'Solado', 'Empaque', 'Terminado'] },
        productoId: { type: 'integer' },
        desde: { type: 'string', format: 'date' },
        hasta: { type: 'string', format: 'date' },
        soloVencidos: { type: 'boolean' },
        limite: { type: 'integer', minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'consultarCatalogoProductos',
    description: 'Catálogo de productos disponibles, con búsqueda y filtro por categoría.',
    parameters: {
      type: 'object',
      properties: {
        categoriaId: { type: 'integer' },
        disponible: { type: 'boolean' },
        busqueda: { type: 'string', maxLength: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'consultarStock',
    description: 'Stock de productos o insumos, opcionalmente solo los que están en nivel crítico.',
    parameters: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['producto', 'insumo'] },
        soloCriticos: { type: 'boolean' },
        categoriaId: { type: 'integer' },
        busqueda: { type: 'string', maxLength: 100 },
      },
      required: ['tipo'],
      additionalProperties: false,
    },
  },
  {
    name: 'consultarVentas',
    description: 'Ventas agregadas por mes, por producto (mes actual) o por categoría de calzado.',
    parameters: {
      type: 'object',
      properties: {
        anio: { type: 'integer', minimum: 2000, maximum: 2100 },
        mes: { type: 'integer', minimum: 1, maximum: 12 },
        agrupacion: { type: 'string', enum: ['mes', 'producto', 'categoria'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'consultarClientes',
    description: 'Lista de clientes registrados en el sistema.',
    parameters: {
      type: 'object',
      properties: {
        activo: { type: 'boolean' },
        conPedidoActivo: { type: 'boolean' },
        busqueda: { type: 'string', maxLength: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'consultarKardex',
    description: 'Movimientos de inventario (Kardex) de productos o insumos: entradas, salidas y ajustes.',
    parameters: {
      type: 'object',
      properties: {
        productoId: { type: 'integer' },
        insumoId: { type: 'integer' },
        tipo: { type: 'string', enum: ['entrada', 'salida', 'ajuste'] },
        tipoRegistro: { type: 'string', enum: ['producto', 'insumo'] },
        origen: { type: 'string', enum: ['manual', 'automatico'] },
        desde: { type: 'string', format: 'date' },
        hasta: { type: 'string', format: 'date' },
        limite: { type: 'integer', minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'consultarPrediccionStock',
    description: 'Predicción de reposición de stock de productos (demanda mensual y semanas restantes).',
    parameters: {
      type: 'object',
      properties: {
        productoId: { type: 'integer' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'consultarKpisDashboard',
    description: 'Resumen de KPIs generales del negocio (ventas del mes, pedidos, alertas de stock, producción).',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'consultarAuditoria',
    description: 'Registro de auditoría del sistema (acciones realizadas, módulo, usuario responsable).',
    parameters: {
      type: 'object',
      properties: {
        modulo: { type: 'string', maxLength: 50 },
        usuarioId: { type: 'integer' },
        desde: { type: 'string', format: 'date' },
        hasta: { type: 'string', format: 'date' },
        limite: { type: 'integer', minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'consultarTopClientes',
    description:
      'Clientes que más compraron, agregado por SUM de totales de pedidos con estado Terminado y ordenado de mayor a menor total. La agregación se calcula en el backend (SQL), no en el modelo. La respuesta incluye un campo "criterio" que aclara que el total es solo de pedidos Terminado (ventas concretadas), no de todos los pedidos del cliente.',
    parameters: {
      type: 'object',
      properties: {
        mes: { type: 'integer', minimum: 1, maximum: 12 },
        limite: { type: 'integer', minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'generarComprobante',
    description:
      'Genera la URL de descarga de un comprobante interno en PDF de UN pedido puntual (no es una factura fiscal): incluye cliente, producto, categoría, tallas, cantidad de pares, estado, fecha de pedido, fecha de entrega y total. Usar esta tool (no generarReporte) cuando el usuario pide el "comprobante", "constancia" o "detalle en PDF" de un pedido específico identificado por su número. Disponible también para el rol cliente, pero SOLO puede generar el comprobante de uno de sus propios pedidos: si pide el de un pedido que no es suyo, la descarga se rechaza.',
    parameters: {
      type: 'object',
      properties: {
        pedidoId: { type: 'integer' },
      },
      required: ['pedidoId'],
      additionalProperties: false,
    },
  },
  {
    name: 'generarReporte',
    description:
      'Genera la URL de descarga de un reporte PDF que ya existe en el sistema (ventas, pedidos, stock, kardex, pedidos entregados o ganancias). No genera el archivo en este momento: solo devuelve la URL al endpoint real y una descripción corta para mostrar como texto del enlace. El navegador del usuario debe abrir esa URL para descargar el PDF (la sesión ya autenticada se envía automáticamente por cookie). No disponible para el rol cliente: los reportes son información interna del negocio. Para el comprobante de UN pedido puntual (no una tabla/reporte general) usar la tool generarComprobante en su lugar. ' +
      'IMPORTANTE sobre "filtros": completalo únicamente con lo que el usuario pide EXPLÍCITAMENTE en su mensaje ACTUAL, nunca lo infieras ni lo arrastres de turnos anteriores de la conversación, aunque se haya hablado de un cliente o pedido puntual antes. ' +
      'Ejemplo negativo: si antes se habló del pedido #215 de "Carlos" y ahora el usuario dice "generame el reporte" o "dame el reporte de pedidos" sin nombrar a Carlos en ESE mensaje, no agregues filtros.cliente="Carlos" — generá el reporte sin ese filtro. ' +
      'Ejemplo positivo: si el usuario dice "reporte de pedidos de Carlos" en su mensaje actual, ahí sí corresponde filtros.cliente="Carlos".',
    parameters: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: ['ventas', 'pedidos', 'stock', 'kardex', 'pedidos-entregados', 'ganancias'],
        },
        filtros: {
          type: 'object',
          properties: {
            anio: { type: 'integer', minimum: 2000, maximum: 2100 },
            mes: { type: 'integer', minimum: 1, maximum: 12 },
            desde: { type: 'string', format: 'date' },
            hasta: { type: 'string', format: 'date' },
            cliente: {
              type: 'string',
              maxLength: 100,
              description:
                'Solo si el usuario nombra a un cliente explícitamente en su mensaje ACTUAL pidiendo el reporte. No lo completes por un cliente mencionado en turnos anteriores de la conversación.',
            },
            producto: {
              type: 'string',
              maxLength: 100,
              description:
                'Solo si el usuario nombra un producto explícitamente en su mensaje ACTUAL pidiendo el reporte. No lo completes por un producto mencionado en turnos anteriores de la conversación.',
            },
            categoria: { type: 'string', enum: ['nino', 'juvenil', 'adulto'] },
            insumoId: { type: 'integer' },
            categoriaInsumoId: { type: 'integer' },
            tipoMovimiento: { type: 'string', enum: ['entrada', 'salida', 'ajuste'] },
            origen: { type: 'string', enum: ['manual', 'automatico'] },
          },
          additionalProperties: false,
        },
      },
      required: ['tipo'],
      additionalProperties: false,
    },
  },
];

// ══════════════════════════════════════════════════════════════════════════
// Autorización por rol — capa 1 (declaración) y capa 2 (dispatcher)
// ══════════════════════════════════════════════════════════════════════════

export const TOOL_PERMISSIONS: Record<string, Role[]> = {
  consultarPedidos: [Role.ADMIN, Role.OPERARIO, Role.CLIENTE],
  consultarCatalogoProductos: [Role.ADMIN, Role.OPERARIO, Role.CLIENTE],
  consultarStock: [Role.ADMIN, Role.OPERARIO],
  consultarVentas: [Role.ADMIN, Role.OPERARIO],
  consultarClientes: [Role.ADMIN, Role.OPERARIO],
  consultarKardex: [Role.ADMIN, Role.OPERARIO],
  consultarPrediccionStock: [Role.ADMIN, Role.OPERARIO],
  consultarKpisDashboard: [Role.ADMIN, Role.OPERARIO],
  consultarAuditoria: [Role.ADMIN],
  consultarTopClientes: [Role.ADMIN, Role.OPERARIO],
  generarReporte: [Role.ADMIN, Role.OPERARIO],
  generarComprobante: [Role.ADMIN, Role.OPERARIO, Role.CLIENTE],
};

/** Tools que se declaran al modelo para un rol dado. Un rol sin permiso para
 * una función ni siquiera se entera de que existe. */
export function buildToolsForRole(role: string | undefined): AssistantToolDeclaration[] {
  return TOOL_DECLARATIONS.filter(t => TOOL_PERMISSIONS[t.name as string]?.includes(role as Role));
}

export interface AssistantRepos {
  pedidoRepo: Repository<Pedido>;
  clienteRepo: Repository<Cliente>;
  productoRepo: Repository<Producto>;
  insumoRepo: Repository<Insumo>;
  kardexRepo: Repository<KardexMovimiento>;
  auditoriaRepo: Repository<Auditoria>;
  prediccionService: PrediccionService;
  kpiService: KpiService;
  downloadTokenService: DownloadTokenService;
}

// ══════════════════════════════════════════════════════════════════════════
// Saneamiento de argumentos — los args del modelo son input no confiable,
// igual que un body HTTP
// ══════════════════════════════════════════════════════════════════════════

function clampLimite(v: unknown, def = 20, max = 50): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

function parseFechaISO(v: unknown): string | undefined {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

function parseEntero(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseTexto(v: unknown, maxLength = 100): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, maxLength) : undefined;
}

const ESTADOS_PEDIDO = ['Pendiente', 'Cortado', 'Aparado', 'Solado', 'Empaque', 'Terminado'];
const CATEGORIAS_CALZADO = ['nino', 'juvenil', 'adulto'];
const TIPOS_KARDEX = ['entrada', 'salida', 'ajuste'];
const ORIGENES_KARDEX = ['manual', 'automatico'];
const MESES_NOMBRE = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Mismas rutas y restricciones de rol que ya exige ReportesController: la tool
// nunca ofrece un enlace que el navegador del usuario no podría abrir.
const REPORTES_TIPO_A_RUTA: Record<string, string> = {
  ventas: 'pdf/ventas',
  pedidos: 'pdf/pedidos',
  stock: 'pdf/stock',
  kardex: 'pdf/kardex',
  'pedidos-entregados': 'pdf/pedidos-entregados',
  ganancias: 'pdf/ganancias',
};

const REPORTES_ROLES: Record<string, Role[]> = {
  ventas: [Role.ADMIN],
  pedidos: [Role.ADMIN, Role.OPERARIO],
  stock: [Role.ADMIN, Role.OPERARIO],
  kardex: [Role.ADMIN, Role.OPERARIO],
  'pedidos-entregados': [Role.ADMIN, Role.OPERARIO],
  ganancias: [Role.ADMIN],
};

/** Arma la URL de descarga inyectando un token de un solo uso (misma lógica
 * que POST /reportes/download-token), para que el enlace funcione en una
 * navegación directa fuera de la sesión del chat, sin depender de que la
 * cookie de sesión llegue cross-site. Compartida por generarReporte y
 * generarComprobante para no duplicar la generación del token ni el armado
 * de la URL base. */
function generarUrlDescarga(
  repos: AssistantRepos,
  user: AssistantUser,
  userId: number,
  ruta: string,
  params: URLSearchParams,
): string {
  const token = repos.downloadTokenService.generar({
    sub: userId,
    email: user.email,
    role: user.role,
    ...(user.role === Role.CLIENTE ? { clienteId: user.clienteId } : {}),
  });
  params.set('token', token);
  const baseUrl = process.env.BACKEND_URL || 'http://localhost:3000';
  return `${baseUrl}/reportes/${ruta}?${params.toString()}`;
}

// ══════════════════════════════════════════════════════════════════════════
// Dispatcher — única puerta de entrada para ejecutar una tool
// ══════════════════════════════════════════════════════════════════════════

export async function executeTool(
  name: string,
  rawArgs: Record<string, unknown> | undefined,
  user: AssistantUser,
  repos: AssistantRepos,
): Promise<Record<string, unknown>> {
  const allowedRoles = TOOL_PERMISSIONS[name];
  if (!allowedRoles || !allowedRoles.includes(user.role as Role)) {
    // No se ejecuta ninguna consulta al repositorio bajo ninguna circunstancia:
    // esta verificación no depende de qué tools se le hayan declarado al modelo.
    return { error: 'No tenés permiso para consultar esa información.' };
  }

  const isCliente = user.role === Role.CLIENTE;
  if (isCliente && !user.clienteId) {
    return { error: 'No se encontró una cuenta de cliente asociada a tu usuario.' };
  }

  const args = rawArgs ?? {};

  try {
    switch (name) {
      case 'consultarPedidos': {
        const where: Record<string, unknown> = {};

        // El clienteId nunca se lee de `args`: para rol cliente se fuerza
        // siempre desde la sesión, sin importar qué haya pedido el modelo.
        if (isCliente) {
          where.cliente = { id_cliente: user.clienteId };
        }

        const estado = typeof args.estado === 'string' && ESTADOS_PEDIDO.includes(args.estado) ? args.estado : undefined;
        if (estado) where.estado = estado;

        const productoId = parseEntero(args.productoId);
        if (productoId) where.producto = { id_producto: productoId };

        const desde = parseFechaISO(args.desde);
        const hasta = parseFechaISO(args.hasta);
        if (desde && hasta) where.fecha_entrega = Between(desde, hasta);
        else if (desde) where.fecha_entrega = MoreThanOrEqual(desde);
        else if (hasta) where.fecha_entrega = LessThanOrEqual(hasta);

        const limite = clampLimite(args.limite);
        let pedidos = await repos.pedidoRepo.find({ where, order: { fecha_entrega: 'DESC' }, take: limite });

        if (args.soloVencidos === true) {
          const hoy = new Date().toISOString().slice(0, 10);
          pedidos = pedidos.filter(p => p.fecha_entrega < hoy && p.estado !== 'Terminado');
        }

        return {
          output: pedidos.map(p => ({
            id: p.id_pedido,
            cliente: p.cliente?.nombre ?? '—',
            producto: p.producto?.nombre_modelo ?? '—',
            estado: p.estado,
            fecha_entrega: p.fecha_entrega,
            cantidad_pares: p.cantidad_pares,
            total: Number(p.total),
          })),
        };
      }

      case 'consultarCatalogoProductos': {
        const where: Record<string, unknown> = { activo: true };
        const categoriaId = parseEntero(args.categoriaId);
        if (categoriaId) where.categoria = { id_categoria_producto: categoriaId };

        let productos = await repos.productoRepo.find({ where });

        if (typeof args.disponible === 'boolean') {
          productos = productos.filter(p => (p.stock > 0) === args.disponible);
        }
        const busqueda = parseTexto(args.busqueda)?.toLowerCase();
        if (busqueda) {
          productos = productos.filter(
            p => p.nombre_modelo.toLowerCase().includes(busqueda) || p.marca.toLowerCase().includes(busqueda),
          );
        }
        productos = productos.slice(0, 50);

        return {
          output: productos.map(p =>
            isCliente
              ? { nombre: p.nombre_modelo, marca: p.marca, precio: Number(p.precio_venta), disponible: p.stock > 0 }
              : {
                  id: p.id_producto,
                  nombre: p.nombre_modelo,
                  marca: p.marca,
                  precio: Number(p.precio_venta),
                  costo_unidad: Number(p.costo_unidad),
                  stock: p.stock,
                  nivel_minimo: p.nivel_minimo,
                  categoria: p.categoria?.nombre ?? null,
                },
          ),
        };
      }

      case 'consultarStock': {
        const tipo = args.tipo === 'insumo' ? 'insumo' : 'producto';
        const categoriaId = parseEntero(args.categoriaId);
        const busqueda = parseTexto(args.busqueda)?.toLowerCase();

        if (tipo === 'producto') {
          let productos = await repos.productoRepo.find({ where: { activo: true } });
          if (categoriaId) productos = productos.filter(p => p.categoria?.id_categoria_producto === categoriaId);
          if (args.soloCriticos === true) productos = productos.filter(p => esStockCritico(p.stock, p.nivel_minimo));
          if (busqueda) productos = productos.filter(p => p.nombre_modelo.toLowerCase().includes(busqueda));
          productos = productos.slice(0, 50);

          return {
            output: productos.map(p => ({
              id: p.id_producto,
              nombre: p.nombre_modelo,
              stock: p.stock,
              nivel_minimo: p.nivel_minimo,
              critico: esStockCritico(p.stock, p.nivel_minimo),
            })),
          };
        }

        let insumos = await repos.insumoRepo.find({ where: { activo: true } });
        if (categoriaId) insumos = insumos.filter(i => i.categoria?.id_categoria_insumo === categoriaId);
        if (args.soloCriticos === true) insumos = insumos.filter(i => esStockCritico(i.stock, i.nivel_minimo));
        if (busqueda) insumos = insumos.filter(i => i.nombre.toLowerCase().includes(busqueda));
        insumos = insumos.slice(0, 50);

        return {
          output: insumos.map(i => ({
            id: i.id_insumo,
            nombre: i.nombre,
            stock: Number(i.stock),
            unidad: i.unidad_medida?.nombre ?? '—',
            nivel_minimo: Number(i.nivel_minimo),
            critico: esStockCritico(i.stock, i.nivel_minimo),
          })),
        };
      }

      case 'consultarVentas': {
        const agrupacion = args.agrupacion === 'producto' || args.agrupacion === 'categoria' ? args.agrupacion : 'mes';

        if (agrupacion === 'producto') {
          return { output: await repos.prediccionService.getTopProductos() };
        }

        if (agrupacion === 'categoria') {
          const rows = await repos.pedidoRepo
            .createQueryBuilder('p')
            .select('p.categoria', 'categoria')
            .addSelect('COALESCE(SUM(p.total), 0)', 'total')
            .where('p.estado = :terminado', { terminado: 'Terminado' })
            .groupBy('p.categoria')
            .getRawMany();
          return { output: rows.map(r => ({ categoria: r.categoria, total: Math.round(Number(r.total) * 100) / 100 })) };
        }

        let ventas = await repos.prediccionService.getVentasPorMes();
        const anio = parseEntero(args.anio);
        const mes = parseEntero(args.mes);
        if (anio) ventas = ventas.filter(v => v.mes.startsWith(String(anio)));
        if (mes) ventas = ventas.filter(v => Number(v.mes.slice(5, 7)) === mes);
        return { output: ventas };
      }

      case 'consultarClientes': {
        const where: Record<string, unknown> = {};
        if (typeof args.activo === 'boolean') where.activo = args.activo;

        let clientes = await repos.clienteRepo.find({ where, order: { id_cliente: 'DESC' }, take: 200 });

        const busqueda = parseTexto(args.busqueda)?.toLowerCase();
        if (busqueda) {
          // Contra nombre y apellido combinados, no solo nombre: un nombre completo
          // como "Carlos Mamani Flores" no matchea contra ninguno de los dos campos
          // por separado (son columnas distintas en la BD).
          clientes = clientes.filter(c => `${c.nombre} ${c.apellido ?? ''}`.toLowerCase().includes(busqueda));
        }

        if (args.conPedidoActivo === true) {
          const pedidosActivos = await repos.pedidoRepo.find({ where: { estado: Not('Terminado') } });
          const idsConPedido = new Set(pedidosActivos.map(p => p.cliente?.id_cliente));
          clientes = clientes.filter(c => idsConPedido.has(c.id_cliente));
        }

        clientes = clientes.slice(0, 50);

        return {
          output: clientes.map(c => ({
            id: c.id_cliente,
            nombre: `${c.nombre} ${c.apellido ?? ''}`.trim(),
            tipo: c.tipo_cliente?.nombre ?? '—',
            activo: c.activo,
            telefono: c.telefono_principal,
          })),
        };
      }

      case 'consultarKardex': {
        const where: Record<string, unknown> = {};
        const productoId = parseEntero(args.productoId);
        const insumoId = parseEntero(args.insumoId);
        if (productoId) where.producto = { id_producto: productoId };
        if (insumoId) where.insumo = { id_insumo: insumoId };

        if (typeof args.tipo === 'string' && ['entrada', 'salida', 'ajuste'].includes(args.tipo)) where.tipo = args.tipo;
        if (typeof args.tipoRegistro === 'string' && ['producto', 'insumo'].includes(args.tipoRegistro)) {
          where.tipo_registro = args.tipoRegistro;
        }
        if (typeof args.origen === 'string' && ['manual', 'automatico'].includes(args.origen)) where.origen = args.origen;

        const desde = parseFechaISO(args.desde);
        const hasta = parseFechaISO(args.hasta);
        if (desde && hasta) where.fecha = Between(new Date(desde), new Date(`${hasta}T23:59:59`));
        else if (desde) where.fecha = MoreThanOrEqual(new Date(desde));
        else if (hasta) where.fecha = LessThanOrEqual(new Date(`${hasta}T23:59:59`));

        const limite = clampLimite(args.limite);
        const movimientos = await repos.kardexRepo.find({
          where,
          relations: ['producto', 'insumo', 'usuario'],
          order: { fecha: 'DESC' },
          take: limite,
        });

        return {
          output: movimientos.map(m => ({
            fecha: m.fecha.toISOString().slice(0, 10),
            tipo: m.tipo,
            item: m.tipo_registro === 'producto' ? (m.producto?.nombre_modelo ?? '—') : (m.insumo?.nombre ?? '—'),
            cantidad: Number(m.cantidad),
            stock_anterior: Number(m.stock_anterior),
            stock_nuevo: Number(m.stock_nuevo),
            motivo: m.motivo ?? '—',
            origen: m.origen,
            usuario: m.usuario?.nombre ?? m.usuario?.email ?? '—',
          })),
        };
      }

      case 'consultarPrediccionStock': {
        let prediccion = await repos.prediccionService.getPrediccionStock();
        const productoId = parseEntero(args.productoId);
        if (productoId) prediccion = prediccion.filter(p => p.id === productoId);
        return { output: prediccion };
      }

      case 'consultarKpisDashboard': {
        return { output: await repos.kpiService.getKpis() };
      }

      case 'consultarAuditoria': {
        const where: Record<string, unknown> = {};
        const modulo = parseTexto(args.modulo, 50);
        if (modulo) where.modulo = modulo;
        const usuarioId = parseEntero(args.usuarioId);
        if (usuarioId) where.usuario = { id: usuarioId };

        const desde = parseFechaISO(args.desde);
        const hasta = parseFechaISO(args.hasta);
        if (desde && hasta) where.fecha = Between(new Date(desde), new Date(`${hasta}T23:59:59`));
        else if (desde) where.fecha = MoreThanOrEqual(new Date(desde));
        else if (hasta) where.fecha = LessThanOrEqual(new Date(`${hasta}T23:59:59`));

        const limite = clampLimite(args.limite);
        const registros = await repos.auditoriaRepo.find({
          where,
          relations: ['usuario'],
          order: { fecha: 'DESC' },
          take: limite,
        });

        return {
          output: registros.map(a => ({
            fecha: a.fecha.toISOString().slice(0, 10),
            accion: a.accion,
            modulo: a.modulo,
            descripcion: a.descripcion,
            usuario: a.usuario?.nombre ?? a.usuario?.email ?? '—',
          })),
        };
      }

      case 'consultarTopClientes': {
        const limite = clampLimite(args.limite, 5, 20);
        const mes = parseEntero(args.mes);

        const qb = repos.pedidoRepo
          .createQueryBuilder('p')
          .leftJoin('p.cliente', 'cliente')
          .select('cliente.id_cliente', 'id_cliente')
          .addSelect('cliente.nombre', 'nombre')
          .addSelect('cliente.apellido', 'apellido')
          .addSelect('COALESCE(SUM(p.total), 0)', 'total')
          .addSelect('COUNT(*)', 'cantidad_pedidos')
          .where('p.estado = :terminado', { terminado: 'Terminado' });

        if (mes && mes >= 1 && mes <= 12) {
          qb.andWhere('EXTRACT(MONTH FROM p.fecha_entrega) = :mes', { mes });
        }

        const rows = await qb
          .groupBy('cliente.id_cliente')
          .addGroupBy('cliente.nombre')
          .addGroupBy('cliente.apellido')
          .orderBy('total', 'DESC')
          .limit(limite)
          .getRawMany();

        return {
          criterio: 'Solo pedidos Terminado (ventas concretadas)',
          output: rows.map(r => ({
            id: Number(r.id_cliente),
            nombre: `${r.nombre} ${r.apellido ?? ''}`.trim(),
            total: Math.round(Number(r.total) * 100) / 100,
            cantidad_pedidos: Number(r.cantidad_pedidos),
          })),
        };
      }

      case 'generarReporte': {
        const tipo = typeof args.tipo === 'string' ? args.tipo : '';
        const ruta = REPORTES_TIPO_A_RUTA[tipo];
        if (!ruta) return { error: 'Tipo de reporte no reconocido.' };

        const rolesPermitidos = REPORTES_ROLES[tipo];
        if (!rolesPermitidos.includes(user.role as Role)) {
          return { error: 'No tenés permiso para generar ese reporte.' };
        }

        if (!user.userId) {
          return { error: 'No se pudo identificar tu usuario para generar el enlace de descarga.' };
        }

        const filtros = (typeof args.filtros === 'object' && args.filtros !== null ? args.filtros : {}) as Record<
          string,
          unknown
        >;
        const params = new URLSearchParams();

        const anio = parseEntero(filtros.anio);
        const mes = parseEntero(filtros.mes);
        const desde = parseFechaISO(filtros.desde);
        const hasta = parseFechaISO(filtros.hasta);
        const categoria =
          typeof filtros.categoria === 'string' && CATEGORIAS_CALZADO.includes(filtros.categoria)
            ? filtros.categoria
            : undefined;

        let descripcion = '';

        switch (tipo) {
          case 'ventas': {
            const anioReporte = anio ?? new Date().getFullYear();
            params.set('year', String(anioReporte));
            if (mes && mes >= 1 && mes <= 12) {
              params.set('month', String(mes));
              const nombreMes = MESES_NOMBRE[mes - 1];
              const nombreMesCapitalizado = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
              descripcion = `Reporte de ventas — ${nombreMesCapitalizado} ${anioReporte}`;
            } else {
              descripcion = `Reporte de ventas — Todos los meses (${anioReporte})`;
            }
            break;
          }

          case 'ganancias': {
            const hoy = new Date();
            const mesReporte = mes && mes >= 1 && mes <= 12 ? mes : hoy.getMonth() + 1;
            const anioReporte = anio ?? hoy.getFullYear();
            params.set('month', String(mesReporte));
            params.set('year', String(anioReporte));
            descripcion = `Reporte de ganancias de ${MESES_NOMBRE[mesReporte - 1]} ${anioReporte}`;
            break;
          }

          case 'pedidos':
          case 'pedidos-entregados': {
            const cliente = parseTexto(filtros.cliente);
            const producto = parseTexto(filtros.producto);
            if (cliente) params.set('cliente', cliente);
            if (producto) params.set('producto', producto);
            if (categoria) params.set('categoria', categoria);
            if (desde) params.set('desde', desde);
            if (hasta) params.set('hasta', hasta);
            descripcion = tipo === 'pedidos' ? 'Reporte de pedidos' : 'Reporte de pedidos entregados';
            if (desde && hasta) descripcion += ` (${desde} a ${hasta})`;
            break;
          }

          case 'stock': {
            if (categoria) params.set('categoria', categoria);
            descripcion = 'Reporte de stock crítico';
            break;
          }

          case 'kardex': {
            const insumoId = parseEntero(filtros.insumoId);
            const categoriaInsumoId = parseEntero(filtros.categoriaInsumoId);
            const tipoMovimiento =
              typeof filtros.tipoMovimiento === 'string' && TIPOS_KARDEX.includes(filtros.tipoMovimiento)
                ? filtros.tipoMovimiento
                : undefined;
            const origen =
              typeof filtros.origen === 'string' && ORIGENES_KARDEX.includes(filtros.origen)
                ? filtros.origen
                : undefined;
            if (desde) params.set('desde', desde);
            if (hasta) params.set('hasta', hasta);
            if (insumoId) params.set('insumo_id', String(insumoId));
            if (tipoMovimiento) params.set('tipo', tipoMovimiento);
            if (origen) params.set('origen', origen);
            if (categoriaInsumoId) params.set('categoria_insumo_id', String(categoriaInsumoId));
            descripcion = 'Reporte de kardex de insumos';
            if (desde && hasta) descripcion += ` (${desde} a ${hasta})`;
            break;
          }
        }

        const url = generarUrlDescarga(repos, user, user.userId, ruta, params);

        return { output: { url, descripcion } };
      }

      case 'generarComprobante': {
        const pedidoId = parseEntero(args.pedidoId);
        if (!pedidoId) return { error: 'Falta indicar el número de pedido.' };

        if (!user.userId) {
          return { error: 'No se pudo identificar tu usuario para generar el enlace de descarga.' };
        }

        // Para rol cliente se verifica la pertenencia del pedido ANTES de emitir
        // cualquier URL: el clienteId nunca se lee de `args`, se fuerza siempre
        // desde la sesión (mismo criterio que consultarPedidos). El endpoint
        // vuelve a verificarlo del lado del servidor con el token de descarga,
        // esto solo evita ofrecer un enlace que sabemos que va a fallar.
        if (isCliente) {
          const pedido = await repos.pedidoRepo.findOne({
            where: { id_pedido: pedidoId, cliente: { id_cliente: user.clienteId } },
          });
          if (!pedido) return { error: 'No se encontró ese pedido asociado a tu cuenta.' };
        }

        const url = generarUrlDescarga(repos, user, user.userId, `pdf/comprobante/${pedidoId}`, new URLSearchParams());

        return { output: { url, descripcion: `Comprobante del pedido #${pedidoId}` } };
      }

      default:
        return { error: 'Función no reconocida.' };
    }
  } catch {
    // Nunca se propaga el detalle real del error (stack, mensaje de la BD) al modelo.
    return { error: 'Ocurrió un error al consultar la información.' };
  }
}
