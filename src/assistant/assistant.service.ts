import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Not, MoreThanOrEqual } from 'typeorm';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { KardexMovimiento } from '../kardex/entities/kardex.entity';
import { Auditoria } from '../auditoria/entities/auditoria.entity';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

export interface ChatMessage {
  role: string;
  text: string;
}

export interface AssistantUser {
  role: string;
  clienteId?: number;
}

const SYSTEM_PROMPT_INTERNO = `Eres NT Assistant, el asistente inteligente de Calzados Nueva Tendencia, un taller de calzado artesanal masculino e infantil ubicado en Cochabamba, Bolivia. Conoces el negocio en detalle y ayudas al administrador a tomar decisiones basadas en los datos reales del sistema.

Tienes acceso a los datos reales del negocio en tiempo real, incluyendo:
- Pedidos, clientes, productos e insumos
- Movimientos de inventario (Kardex): entradas, salidas y ajustes de stock de productos e insumos, con fecha, motivo y usuario responsable
- Auditoría del sistema: registro de acciones realizadas (login, creación, modificación, etc.), módulo afectado, descripción y usuario que las ejecutó

Responde SIEMPRE en español natural y amigable.
Usa emojis relevantes: 👟 pedidos, 📦 stock, 💰 ventas, 👤 clientes, ⚠️ alertas, 📊 estadísticas, 🧴 insumos, 🔄 movimientos de inventario, 🔍 auditoría.
Sé conciso pero completo. Máximo 100 palabras por respuesta.
Si te preguntan algo que no está en los datos responde honestamente que no tienes esa información.
El usuario puede escribir con errores ortográficos o abreviaciones. Interpreta siempre la intención aunque haya errores de escritura.`;

const SYSTEM_PROMPT_CLIENTE = `Eres NT Assistant, el asistente de atención al cliente de Calzados Nueva Tendencia, un taller de calzado artesanal masculino e infantil ubicado en Cochabamba, Bolivia. Estás hablando directamente con un cliente de la tienda, no con personal interno.

Tienes acceso únicamente a:
- Los pedidos del cliente que te está escribiendo (estado, fecha de entrega, productos, tallas)
- El catálogo de productos disponibles (modelos, precios, stock disponible)

NUNCA reveles información de otros clientes, costos internos, insumos, movimientos de inventario (Kardex), auditoría del sistema ni ningún dato de producción interno. Si te preguntan por algo fuera de este alcance, explica amablemente que no tienes acceso a esa información y sugiere contactar directamente a la tienda.

Responde SIEMPRE en español natural, cálido y amigable, como atención al cliente.
Usa emojis relevantes: 👟 pedidos, 📦 productos, ✅ entregas, ⏳ en proceso, 😊 cordialidad.
Sé conciso pero completo. Máximo 100 palabras por respuesta.
El usuario puede escribir con errores ortográficos o abreviaciones. Interpreta siempre la intención aunque haya errores de escritura.`;

@Injectable()
export class AssistantService {
  private readonly modelInterno: GenerativeModel | null;
  private readonly modelCliente: GenerativeModel | null;

  constructor(
    @InjectRepository(Pedido)           private readonly pedidoRepo:   Repository<Pedido>,
    @InjectRepository(Cliente)          private readonly clienteRepo:  Repository<Cliente>,
    @InjectRepository(Producto)         private readonly productoRepo: Repository<Producto>,
    @InjectRepository(Insumo)           private readonly insumoRepo:   Repository<Insumo>,
    @InjectRepository(KardexMovimiento) private readonly kardexRepo:   Repository<KardexMovimiento>,
    @InjectRepository(Auditoria)        private readonly auditoriaRepo: Repository<Auditoria>,
  ) {
    console.log('[AssistantService] GEMINI_API_KEY presente:', !!process.env.GEMINI_API_KEY);
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      this.modelInterno = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: { temperature: 0.3 },
        systemInstruction: SYSTEM_PROMPT_INTERNO,
      });
      this.modelCliente = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: { temperature: 0.3 },
        systemInstruction: SYSTEM_PROMPT_CLIENTE,
      });
    } else {
      this.modelInterno = null;
      this.modelCliente = null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Recolección de datos en paralelo
  // ══════════════════════════════════════════════════════════════════════════

  private async buildContextInterno(): Promise<string> {
    const hoy = new Date().toISOString().slice(0, 10);
    const anio = new Date().getFullYear();
    const mesActual = new Date().getMonth(); // 0-based

    const unMesAtras = new Date();
    unMesAtras.setMonth(unMesAtras.getMonth() - 1);
    const unMesAtrasStr = unMesAtras.toISOString().slice(0, 10);

    const [pedidos, clientes, productos, insumos, movimientosKardex, accionesAuditoria] = await Promise.all([
      this.pedidoRepo.find({
        relations: ['cliente', 'producto'],
        where: [
          { estado: Not('Terminado') },
          { estado: 'Terminado', fecha_entrega: MoreThanOrEqual(unMesAtrasStr) },
        ],
        order: { fecha_entrega: 'DESC' },
        take: 200,
      }),
      this.clienteRepo.find({ take: 200, order: { id_cliente: 'DESC' } }),
      this.productoRepo.find({ take: 200 }),
      this.insumoRepo.find({ take: 200 }),
      this.kardexRepo.find({
        relations: ['producto', 'insumo', 'usuario'],
        order: { fecha: 'DESC' },
        take: 10,
      }),
      this.auditoriaRepo.find({
        relations: ['usuario'],
        order: { fecha: 'DESC' },
        take: 10,
      }),
    ]);

    // ── Pedidos por estado ─────────────────────────────────────────────────
    const estados = ['Pendiente', 'Aparado', 'Solado', 'Empaque', 'Terminado'] as const;
    const porEstado = estados
      .map(e => `  ${e}: ${pedidos.filter(p => p.estado === e).length}`)
      .join('\n');

    // ── Pedidos vencidos (fecha_entrega < hoy, no Terminado) ───────────────
    const vencidos = pedidos.filter(p => p.fecha_entrega < hoy && p.estado !== 'Terminado');
    const listaVencidos = vencidos.length > 0
      ? vencidos.map(p => {
          const dias = Math.floor(
            (new Date(hoy).getTime() - new Date(p.fecha_entrega).getTime()) / 86_400_000,
          );
          return `  #${p.id_pedido} | ${p.cliente?.nombre ?? '—'} | ${p.producto?.nombre_modelo ?? '—'} | ${dias} día(s) de retraso`;
        }).join('\n')
      : '  Ninguno';

    // ── Clientes ───────────────────────────────────────────────────────────
    const clientesActivos = clientes.filter(c => c.activo).length;
    const idsConPedidoActivo = new Set(
      pedidos
        .filter(p => p.estado !== 'Terminado')
        .map(p => p.cliente?.id_cliente)
        .filter(Boolean),
    );

    // ── Stock crítico productos ────────────────────────────────────────────
    const productosCriticos = productos.filter(p => p.stock <= p.nivel_minimo);
    const listaProductosCriticos = productosCriticos.length > 0
      ? productosCriticos.map(p =>
          `  ${p.nombre_modelo} (${p.marca}): stock ${p.stock}, mínimo ${p.nivel_minimo}`
        ).join('\n')
      : '  Sin alertas';

    // ── Stock crítico insumos ──────────────────────────────────────────────
    const insumosCriticos = insumos.filter(i => Number(i.stock) <= Number(i.nivel_minimo));
    const listaInsumosCriticos = insumosCriticos.length > 0
      ? insumosCriticos.map(i =>
          `  ${i.nombre} (${i.categoria}): stock ${i.stock} ${i.unidad_medida}, mínimo ${i.nivel_minimo}`
        ).join('\n')
      : '  Sin alertas';

    // ── Ventas por mes del año actual ──────────────────────────────────────
    const pedidosAnio = pedidos.filter(p => new Date(p.fecha_entrega).getFullYear() === anio);
    const ventasPorMes = Array(12).fill(0);
    pedidosAnio.forEach(p => {
      const m = new Date(p.fecha_entrega).getMonth();
      ventasPorMes[m] += Number(p.total);
    });
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const ventasStr = ventasPorMes
      .map((v, i) => `  ${meses[i]}: Bs. ${v.toFixed(2)}`)
      .join('\n');

    const ventasMesActual  = ventasPorMes[mesActual];
    const ventasMesAnterior = mesActual > 0 ? ventasPorMes[mesActual - 1] : 0;
    const mejorMesIdx = ventasPorMes.indexOf(Math.max(...ventasPorMes));

    // ── Pares por categoría ────────────────────────────────────────────────
    const catMap: Record<string, string> = { nino: 'Niño', juvenil: 'Juvenil', adulto: 'Adulto' };
    const paresPorCat = ['nino', 'juvenil', 'adulto'].map(cat => {
      const total = pedidos
        .filter(p => p.categoria === cat)
        .reduce((a, p) => a + (p.cantidad_pares ?? 0), 0);
      return `  ${catMap[cat]}: ${total} pares`;
    }).join('\n');

    // ── Top productos del mes actual ───────────────────────────────────────
    const pedidosMes = pedidos.filter(p => new Date(p.fecha_entrega).getMonth() === mesActual);
    const conteoProductos: Record<string, { nombre: string; pares: number }> = {};
    pedidosMes.forEach(p => {
      const key = String(p.producto?.id_producto ?? 'X');
      if (!conteoProductos[key]) {
        conteoProductos[key] = { nombre: p.producto?.nombre_modelo ?? '—', pares: 0 };
      }
      conteoProductos[key].pares += p.cantidad_pares ?? 0;
    });
    const topProductos = Object.values(conteoProductos)
      .sort((a, b) => b.pares - a.pares)
      .slice(0, 5)
      .map(x => `  ${x.nombre}: ${x.pares} pares`)
      .join('\n') || '  Sin datos';

    // ── Movimientos de Kardex ──────────────────────────────────────────────
    const listaKardex = movimientosKardex.length > 0
      ? movimientosKardex.map(m => {
          const item = m.tipo_registro === 'producto'
            ? (m.producto?.nombre_modelo ?? '—')
            : (m.insumo?.nombre ?? '—');
          const fecha = new Date(m.fecha).toISOString().slice(0, 10);
          return `  ${fecha} ${m.tipo.toUpperCase()} ${item} ×${m.cantidad} (${m.stock_anterior}→${m.stock_nuevo}) ${m.motivo ?? '—'}`;
        }).join('\n')
      : '  Sin movimientos registrados';

    // ── Auditoría ──────────────────────────────────────────────────────────
    const listaAuditoria = accionesAuditoria.length > 0
      ? accionesAuditoria.map(a => {
          const fecha = new Date(a.fecha).toISOString().slice(0, 10);
          return `  ${fecha} ${a.accion} [${a.modulo}] ${a.descripcion}`;
        }).join('\n')
      : '  Sin acciones registradas';

    return `
=== DATOS EN TIEMPO REAL — ${hoy} ===

📊 PEDIDOS (total: ${pedidos.length})
Por estado:
${porEstado}

⚠️ PEDIDOS VENCIDOS (${vencidos.length}):
${listaVencidos}

👤 CLIENTES
  Total registrados: ${clientes.length}
  Activos: ${clientesActivos}
  Con pedido activo: ${idsConPedidoActivo.size}

📦 STOCK CRÍTICO — PRODUCTOS (${productosCriticos.length} alertas):
${listaProductosCriticos}

🧴 STOCK CRÍTICO — INSUMOS (${insumosCriticos.length} alertas):
${listaInsumosCriticos}

💰 VENTAS ${anio} POR MES:
${ventasStr}
  Mes actual (${meses[mesActual]}): Bs. ${ventasMesActual.toFixed(2)}
  Mes anterior (${meses[mesActual > 0 ? mesActual - 1 : 11]}): Bs. ${ventasMesAnterior.toFixed(2)}
  Mejor mes del año: ${meses[mejorMesIdx]} (Bs. ${ventasPorMes[mejorMesIdx].toFixed(2)})

👟 PARES PRODUCIDOS POR CATEGORÍA:
${paresPorCat}

🏆 TOP PRODUCTOS DEL MES (${meses[mesActual]}):
${topProductos}

=== MOVIMIENTOS DE KARDEX (últimos 10) ===
${listaKardex}

=== AUDITORÍA (últimas 10 acciones) ===
${listaAuditoria}
`.trim();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Contexto acotado para rol cliente: solo sus pedidos + catálogo
  // ══════════════════════════════════════════════════════════════════════════

  private async buildContextCliente(clienteId: number): Promise<string> {
    const hoy = new Date().toISOString().slice(0, 10);

    const [misPedidos, productos] = await Promise.all([
      this.pedidoRepo.find({
        relations: ['producto'],
        where: { cliente: { id_cliente: clienteId } },
        order: { fecha_entrega: 'DESC' },
      }),
      this.productoRepo.find(),
    ]);

    const listaPedidos = misPedidos.length > 0
      ? misPedidos.map(p =>
          `  #${p.id_pedido} | ${p.producto?.nombre_modelo ?? '—'} | Estado: ${p.estado} | Entrega: ${p.fecha_entrega} | Pares: ${p.cantidad_pares ?? '—'}`
        ).join('\n')
      : '  No tienes pedidos registrados todavía';

    const listaCatalogo = productos.length > 0
      ? productos.map(p =>
          `  ${p.nombre_modelo} (${p.marca}) — Bs. ${p.precio_venta ?? '—'} ${p.stock > 0 ? `— disponible` : '— agotado'}`
        ).join('\n')
      : '  Catálogo no disponible en este momento';

    return `
=== DATOS DEL CLIENTE — ${hoy} ===

👟 TUS PEDIDOS (${misPedidos.length}):
${listaPedidos}

📦 CATÁLOGO DE PRODUCTOS DISPONIBLES:
${listaCatalogo}
`.trim();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Fallback por palabras clave (si Gemini no disponible o falla)
  // ══════════════════════════════════════════════════════════════════════════

  private async fallbackChat(message: string, user?: AssistantUser): Promise<string> {
    if (user?.role === 'cliente') {
      return this.fallbackChatCliente(message, user.clienteId);
    }

    const mensajeLower = message.toLowerCase().trim();

    // ── Saludos y cortesía ─────────────────────────────────────────────────
    if (mensajeLower.match(/^(hola|buenos|buenas|hey|hi|hello)/)) {
      return '¡Hola! 👋 Soy NT Assistant. ¿En qué puedo ayudarte hoy? Puedes preguntarme sobre pedidos, ventas, stock, clientes o insumos.';
    }

    if (mensajeLower.match(/gracias|thank|genial|perfecto|excelente|ok|bien|bueno/)) {
      return '¡De nada! 😊 Estoy aquí para ayudarte. ¿Hay algo más que quieras consultar?';
    }

    if (mensajeLower.match(/adios|chau|bye|hasta|nos vemos/)) {
      return '¡Hasta luego! 👋 Cuando necesites consultar algo estaré aquí.';
    }

    if (mensajeLower.match(/como estas|cómo estás|como andas/)) {
      return '¡Todo bien! 😄 Listo para ayudarte con la gestión de Nueva Tendencia. ¿Qué necesitas?';
    }

    const q = mensajeLower;

    if (/hola|ayuda|help/.test(q)) {
      return (
        '¡Hola! Soy NT Assistant de Calzados Nueva Tendencia. ' +
        'Puedo ayudarte con información sobre:\n' +
        '• Pedidos y producción\n' +
        '• Clientes\n' +
        '• Productos e inventario\n' +
        '• Alertas de stock\n' +
        '• Ventas totales\n' +
        'Escribe tu consulta y te respondo.'
      );
    }

    if (/pedido|pedidos/.test(q)) {
      const pedidos = await this.pedidoRepo.find();
      const estados = ['Pendiente', 'Aparado', 'Solado', 'Empaque', 'Terminado'];
      const porEstado = estados
        .map(e => `  • ${e}: ${pedidos.filter(p => p.estado === e).length}`)
        .join('\n');
      return `Total de pedidos: ${pedidos.length}\n\nPor estado:\n${porEstado}`;
    }

    if (/cliente|clientes/.test(q)) {
      const total = await this.clienteRepo.count();
      const activos = await this.clienteRepo.count({ where: { activo: true } });
      return `Total de clientes registrados: ${total}\nClientes activos: ${activos}`;
    }

    if (/insumo|insumos/.test(q)) {
      const insumos = await this.insumoRepo.find();
      const criticos = insumos.filter(i => Number(i.stock) <= Number(i.nivel_minimo));
      if (criticos.length === 0) return '🧴 Sin alertas de insumos. Todos están sobre el nivel mínimo.';
      const lista = criticos
        .map(i => `  • ${i.nombre}: ${i.stock} ${i.unidad_medida} (mínimo ${i.nivel_minimo})`)
        .join('\n');
      return `🧴 ${criticos.length} insumo(s) con stock bajo:\n${lista}`;
    }

    if (/stock|alerta|alertas/.test(q)) {
      const productos = await this.productoRepo.find();
      const bajos = productos.filter(p => p.stock <= p.nivel_minimo);
      if (bajos.length === 0) return '📦 Sin alertas de stock. Todos los productos están sobre el nivel mínimo.';
      const lista = bajos
        .map(p => `  • ${p.nombre_modelo}: stock ${p.stock} (mínimo ${p.nivel_minimo})`)
        .join('\n');
      return `⚠️ ${bajos.length} producto(s) con stock bajo:\n${lista}`;
    }

    if (/producto|productos|inventario/.test(q)) {
      const productos = await this.productoRepo.find();
      const stockBajo = productos.filter(p => p.stock <= p.nivel_minimo).length;
      return (
        `📦 Total de productos en catálogo: ${productos.length}\n` +
        `⚠️ Productos con stock bajo: ${stockBajo}`
      );
    }

    if (/venta|ventas|total/.test(q)) {
      const pedidos = await this.pedidoRepo.find();
      const total = pedidos.reduce((sum, p) => sum + Number(p.total), 0);
      return `💰 Total acumulado en ventas: Bs ${total.toFixed(2)} (${pedidos.length} pedidos)`;
    }

    if (/pendiente|producción|produccion/.test(q)) {
      const pedidos = await this.pedidoRepo.find({ where: { estado: 'Pendiente' } });
      if (pedidos.length === 0) return '👟 No hay pedidos pendientes en este momento.';
      const lista = pedidos
        .map(p => `  • #${p.id_pedido} — entrega: ${p.fecha_entrega}`)
        .join('\n');
      return `👟 Pedidos en estado Pendiente (${pedidos.length}):\n${lista}`;
    }

    return 'No entendí tu consulta. Puedes preguntarme sobre pedidos, clientes, productos, insumos, stock, ventas o producción.';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Fallback por palabras clave — rol cliente (contexto acotado)
  // ══════════════════════════════════════════════════════════════════════════

  private async fallbackChatCliente(message: string, clienteId?: number): Promise<string> {
    const mensajeLower = message.toLowerCase().trim();

    if (mensajeLower.match(/^(hola|buenos|buenas|hey|hi|hello)/)) {
      return '¡Hola! 👋 Soy NT Assistant. ¿En qué puedo ayudarte? Puedo contarte sobre tus pedidos o el catálogo de productos.';
    }

    if (mensajeLower.match(/gracias|thank|genial|perfecto|excelente|ok|bien|bueno/)) {
      return '¡De nada! 😊 ¿Algo más en lo que te pueda ayudar?';
    }

    if (mensajeLower.match(/adios|chau|bye|hasta|nos vemos/)) {
      return '¡Hasta luego! 👋 Aquí estaré cuando me necesites.';
    }

    if (!clienteId) {
      return 'No encuentro una cuenta de cliente asociada a tu usuario. Por favor contactá al soporte de Nueva Tendencia para que revisen tu cuenta. 😊';
    }

    const q = mensajeLower;

    if (/pedido|pedidos|estado|entrega/.test(q)) {
      const pedidos = await this.pedidoRepo.find({
        relations: ['producto'],
        where: { cliente: { id_cliente: clienteId } },
        order: { fecha_entrega: 'DESC' },
      });
      if (pedidos.length === 0) return '👟 Todavía no tienes pedidos registrados con nosotros.';
      const lista = pedidos
        .map(p => `  • #${p.id_pedido} — ${p.producto?.nombre_modelo ?? '—'} — Estado: ${p.estado} — Entrega: ${p.fecha_entrega}`)
        .join('\n');
      return `👟 Tus pedidos (${pedidos.length}):\n${lista}`;
    }

    if (/producto|catalogo|catálogo|modelo|precio/.test(q)) {
      const productos = await this.productoRepo.find();
      if (productos.length === 0) return '📦 El catálogo no está disponible en este momento.';
      const lista = productos
        .map(p => `  • ${p.nombre_modelo} (${p.marca}) — Bs. ${p.precio_venta ?? '—'}`)
        .join('\n');
      return `📦 Catálogo disponible:\n${lista}`;
    }

    return 'No entendí tu consulta 🙂 Puedo contarte sobre el estado de tus pedidos o el catálogo de productos disponibles.';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Punto de entrada principal
  // ══════════════════════════════════════════════════════════════════════════

  async chat(message: string, history: ChatMessage[] = [], user?: AssistantUser): Promise<string> {
    const isCliente = user?.role === 'cliente';

    if (isCliente && !user?.clienteId) {
      return 'No encuentro una cuenta de cliente asociada a tu usuario. Por favor contactá al soporte de Nueva Tendencia para que revisen tu cuenta. 😊';
    }

    const model = isCliente ? this.modelCliente : this.modelInterno;

    if (!model) {
      return this.fallbackChat(message, user);
    }

    try {
      const contexto = isCliente
        ? await this.buildContextCliente(user!.clienteId!)
        : await this.buildContextInterno();

      // El contexto de BD se inyecta como primer turno del historial
      const geminiHistory = [
        {
          role: 'user',
          parts: [{ text: contexto }],
        },
        {
          role: 'model',
          parts: [{ text: 'Entendido. Tengo los datos actualizados del negocio y estoy listo para responder.' }],
        },
        ...history.map(h => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.text }],
        })),
      ];

      const chatSession = model.startChat({ history: geminiHistory });
      console.log('[AssistantService] Llamando a Gemini con mensaje:', message.slice(0, 100));
      const result = await chatSession.sendMessage(message);
      return result.response.text().trim();
    } catch (err) {
      console.error('[AssistantService] Gemini falló:', err?.message, err?.status, JSON.stringify(err));
      return this.fallbackChat(message, user);
    }
  }
}
