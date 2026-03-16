import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

export interface ChatMessage {
  role: string;
  text: string;
}

const SYSTEM_PROMPT = `Eres NT Assistant, el asistente inteligente de Calzados Nueva Tendencia, un taller de calzado artesanal masculino e infantil ubicado en Cochabamba, Bolivia. Conoces el negocio en detalle y ayudas al administrador a tomar decisiones basadas en los datos reales del sistema.

Tienes acceso a los datos reales del negocio en tiempo real.
Responde SIEMPRE en español natural y amigable.
Usa emojis relevantes: 👟 pedidos, 📦 stock, 💰 ventas, 👤 clientes, ⚠️ alertas, 📊 estadísticas, 🧴 insumos.
Sé conciso pero completo. Máximo 150 palabras por respuesta.
Si te preguntan algo que no está en los datos responde honestamente que no tienes esa información.
El usuario puede escribir con errores ortográficos o abreviaciones. Interpreta siempre la intención aunque haya errores de escritura.`;

@Injectable()
export class AssistantService {
  private readonly model: GenerativeModel | null;

  constructor(
    @InjectRepository(Pedido)   private readonly pedidoRepo:   Repository<Pedido>,
    @InjectRepository(Cliente)  private readonly clienteRepo:  Repository<Cliente>,
    @InjectRepository(Producto) private readonly productoRepo: Repository<Producto>,
    @InjectRepository(Insumo)   private readonly insumoRepo:   Repository<Insumo>,
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: { temperature: 0.3 },
        systemInstruction: SYSTEM_PROMPT,
      });
    } else {
      this.model = null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Recolección de datos en paralelo
  // ══════════════════════════════════════════════════════════════════════════

  private async buildContext(): Promise<string> {
    const hoy = new Date().toISOString().slice(0, 10);
    const anio = new Date().getFullYear();
    const mesActual = new Date().getMonth(); // 0-based

    const [pedidos, clientes, productos, insumos] = await Promise.all([
      this.pedidoRepo.find({ relations: ['cliente', 'producto'] }),
      this.clienteRepo.find(),
      this.productoRepo.find(),
      this.insumoRepo.find(),
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
`.trim();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Fallback por palabras clave (si Gemini no disponible o falla)
  // ══════════════════════════════════════════════════════════════════════════

  private async fallbackChat(message: string): Promise<string> {
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
  // Punto de entrada principal
  // ══════════════════════════════════════════════════════════════════════════

  async chat(message: string, history: ChatMessage[] = []): Promise<string> {
    if (!this.model) {
      return this.fallbackChat(message);
    }

    try {
      const contexto = await this.buildContext();

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

      const chatSession = this.model.startChat({ history: geminiHistory });
      const result = await chatSession.sendMessage(message);
      return result.response.text().trim();
    } catch {
      return this.fallbackChat(message);
    }
  }
}
