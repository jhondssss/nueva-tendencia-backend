import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, Between } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { AssistantService } from '../assistant/assistant.service';

@Injectable()
export class TelegramService {
  private readonly botToken = process.env.TELEGRAM_BOT_TOKEN;
  private readonly chatId   = process.env.TELEGRAM_CHAT_ID;

  constructor(
    @InjectRepository(Pedido) private readonly pedidoRepo: Repository<Pedido>,
    @InjectRepository(Insumo) private readonly insumoRepo: Repository<Insumo>,
    private readonly assistantService: AssistantService,
  ) {}

  async sendPhoto(photoUrl: string, caption: string, chatId = this.chatId): Promise<void> {
    if (!this.botToken || !chatId) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendPhoto`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ chat_id: chatId, photo: photoUrl, caption }),
          signal:  controller.signal,
        },
      );
      if (!res.ok) {
        console.error(`[Telegram] sendPhoto HTTP ${res.status}:`, await res.text());
      }
    } catch (err) {
      console.error('[Telegram] sendPhoto falló:', err);
    } finally {
      clearTimeout(timeout);
    }
  }

  async sendMessage(message: string, chatId = this.chatId): Promise<void> {
    if (!this.botToken || !chatId) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ chat_id: chatId, text: message }),
          signal:  controller.signal,
        },
      );
      if (!res.ok) {
        console.error(`[Telegram] HTTP ${res.status}:`, await res.text());
      }
    } catch (err) {
      console.error('[Telegram] sendMessage falló:', err);
    } finally {
      clearTimeout(timeout);
    }
  }

  async handleWebhook(body: any): Promise<void> {
    const message = body?.message;
    if (!message) return;

    const text: string | undefined = message.text;
    const chatId: number | undefined = message.chat?.id;
    const chatType: string | undefined = message.chat?.type;

    if (!text || !chatId) return;

    const strChatId = String(chatId);
    const trimmed = text.trim();
    const isCommand = trimmed.startsWith('/');
    const cmd = isCommand
      ? trimmed.split(/\s+/)[0].replace(/@\S+$/, '').toLowerCase()
      : null;

    if (cmd === '/resumen') {
      await this.sendResumenDiario(strChatId);
      return;
    }

    if (cmd === '/pendientes') {
      await this.handlePendientesCommand(strChatId);
      return;
    }

    if (cmd === '/estado') {
      await this.handleEstadoCommand(strChatId);
      return;
    }

    // /nt — compatibilidad con comportamiento anterior
    if (cmd === '/nt') {
      const pregunta = trimmed.replace(/^\/nt(@\S+)?/i, '').trim();
      if (!pregunta) {
        await this.sendMessage(
          '¿Cuál es tu pregunta? Ejemplo:\n/nt ¿cuántos pedidos hay pendientes?',
          strChatId,
        );
        return;
      }
      try {
        await this.sendChatAction(strChatId, 'typing');
        const respuesta = await this.assistantService.chat(pregunta);
        await this.sendMessage(respuesta, strChatId);
      } catch (err) {
        console.error('[Telegram webhook] Error al procesar /nt:', err);
        await this.sendMessage('Ocurrió un error al procesar tu consulta. Intenta nuevamente.', strChatId);
      }
      return;
    }

    // Comando desconocido → ignorar
    if (isCommand) return;

    // Texto libre: en grupos solo responder si el bot fue mencionado o es reply al bot
    if (chatType !== 'private') {
      const botUsername = (process.env.TELEGRAM_BOT_USERNAME ?? '').toLowerCase();
      const isMentioned = botUsername !== '' && trimmed.toLowerCase().includes(`@${botUsername}`);
      const isReplyToBot = message.reply_to_message?.from?.is_bot === true;
      if (!isMentioned && !isReplyToBot) return;
    }

    // Eliminar la mención @bot antes de enviar a Gemini
    const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? '';
    const cleanText = botUsername
      ? trimmed.replace(new RegExp(`@${botUsername}`, 'gi'), '').trim()
      : trimmed;

    try {
      await this.sendChatAction(strChatId, 'typing');
      const respuesta = await this.assistantService.chat(cleanText || trimmed);
      await this.sendMessage(respuesta, strChatId);
    } catch (err) {
      console.error('[Telegram webhook] Error al procesar mensaje libre:', err);
      await this.sendMessage('Ocurrió un error al procesar tu consulta. Intenta nuevamente.', strChatId);
    }
  }

  private async sendChatAction(chatId: string, action: string): Promise<void> {
    if (!this.botToken) return;
    try {
      await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendChatAction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, action }),
        },
      );
    } catch { /* best-effort */ }
  }

  private async handleEstadoCommand(chatId: string): Promise<void> {
    const estados = ['Pendiente', 'Cortado', 'Aparado', 'Solado', 'Empaque'] as const;
    const counts = await Promise.all(
      estados.map(estado => this.pedidoRepo.count({ where: { estado } })),
    );
    const lineas = estados.map((estado, i) => `• ${estado}: ${counts[i]}`);
    const total = counts.reduce((a, b) => a + b, 0);
    await this.sendMessage(
      `🏭 Estado de producción\n\n${lineas.join('\n')}\n\nTotal en proceso: ${total}`,
      chatId,
    );
  }

  private async handlePendientesCommand(chatId: string): Promise<void> {
    const pedidos = await this.pedidoRepo.find({
      where: { estado: Not('Terminado') },
      relations: ['cliente'],
      order: { fecha_entrega: 'ASC' },
    });

    if (pedidos.length === 0) {
      await this.sendMessage('✅ No hay pedidos pendientes.', chatId);
      return;
    }

    const hoy = new Date();
    const hoyMidnight = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    const lineas = pedidos.map(p => {
      const [y, m, d] = p.fecha_entrega.split('-').map(Number);
      const entrega = new Date(y, m - 1, d);
      const dias = Math.floor((entrega.getTime() - hoyMidnight.getTime()) / (1000 * 60 * 60 * 24));
      const emoji = dias <= 0 ? '🔴' : dias === 1 ? '🟠' : dias <= 3 ? '🟡' : '🟢';
      return `• #${p.id_pedido} [${p.estado}] — ${p.cliente?.nombre ?? 'N/A'} — Entrega: ${p.fecha_entrega} ${emoji}`;
    });

    await this.sendMessage(`📋 Pedidos pendientes (${pedidos.length})\n${lineas.join('\n')}`, chatId);
  }

  @Cron('*/10 * * * *', { timeZone: 'America/La_Paz' })
  async keepAlive(): Promise<void> {
    console.log('[KeepAlive]', new Date().toISOString());
  }

  // 7am Bolivia
  @Cron('0 7 * * *', { timeZone: 'America/La_Paz' })
  async sendResumenDiario(chatId = this.chatId): Promise<void> {
    console.log(`[Telegram Cron] Ejecutando sendResumenDiario - ${new Date().toISOString()}`);
    // Fecha actual en Bolivia (UTC-4)
    const ahora = new Date();
    const offsetBolivia = -4 * 60; // UTC-4 en minutos
    const boliviaMs = ahora.getTime() + (offsetBolivia - ahora.getTimezoneOffset()) * 60000;
    const boliviaHoy = new Date(boliviaMs);

    // Usar métodos UTC porque boliviaHoy fue construido con offset manual
    const anoHoy = boliviaHoy.getUTCFullYear();
    const mesHoy = boliviaHoy.getUTCMonth();
    const diaHoy = boliviaHoy.getUTCDate();

    // Rangos en UTC para ayer Bolivia: 00:00 Bolivia = 04:00 UTC
    const inicioAyerUTC = new Date(Date.UTC(anoHoy, mesHoy, diaHoy - 1, 4, 0, 0, 0));
    const finAyerUTC    = new Date(Date.UTC(anoHoy, mesHoy, diaHoy,     3, 59, 59, 999));

    // Inicio del mes actual en Bolivia
    const inicioMesUTC = new Date(Date.UTC(anoHoy, mesHoy, 1, 4, 0, 0, 0));
    const finMesUTC    = new Date(Date.UTC(anoHoy, mesHoy + 1, 1, 3, 59, 59, 999));

    // Strings YYYY-MM-DD para comparar con fecha_entrega (tipo string en la entidad)
    const hoyStr    = `${anoHoy}-${String(mesHoy + 1).padStart(2, '0')}-${String(diaHoy).padStart(2, '0')}`;
    const mananaD   = new Date(Date.UTC(anoHoy, mesHoy, diaHoy + 1));
    const mananaStr = `${mananaD.getUTCFullYear()}-${String(mananaD.getUTCMonth() + 1).padStart(2, '0')}-${String(mananaD.getUTCDate()).padStart(2, '0')}`;

    const [
      terminadosAyer,
      enProduccion,
      pedidosVencenHoy,
      pedidosVencenManana,
      pedidosMes,
      pedidosNuevosAyer,
      insumosStockCritico,
    ] = await Promise.all([
      // Terminados ayer
      this.pedidoRepo.count({
        where: {
          estado: 'Terminado',
          fecha_actualizacion: Between(inicioAyerUTC, finAyerUTC),
        },
      }),
      // En producción ahora
      this.pedidoRepo.count({ where: { estado: Not('Terminado') } }),
      // Vencen hoy (fecha_entrega es string 'YYYY-MM-DD')
      this.pedidoRepo.createQueryBuilder('p')
        .leftJoinAndSelect('p.cliente', 'cliente')
        .leftJoinAndSelect('p.producto', 'producto')
        .where('p.fecha_entrega = :hoy', { hoy: hoyStr })
        .andWhere('p.estado != :estado', { estado: 'Terminado' })
        .getMany(),
      // Vencen mañana (fecha_entrega es string 'YYYY-MM-DD')
      this.pedidoRepo.createQueryBuilder('p')
        .leftJoinAndSelect('p.cliente', 'cliente')
        .leftJoinAndSelect('p.producto', 'producto')
        .where('p.fecha_entrega = :manana', { manana: mananaStr })
        .andWhere('p.estado != :estado', { estado: 'Terminado' })
        .getMany(),
      // Ventas del mes: pedidos Terminados con fecha_entrega en el mes actual
      this.pedidoRepo
        .createQueryBuilder('p')
        .select('SUM(p.total)', 'sum')
        .where('p.estado = :estado', { estado: 'Terminado' })
        .andWhere('p.fecha_entrega >= :inicioMesStr', { inicioMesStr: `${anoHoy}-${String(mesHoy + 1).padStart(2, '0')}-01` })
        .andWhere('p.fecha_entrega <= :finMesStr', { finMesStr: new Date(Date.UTC(anoHoy, mesHoy + 1, 0)).toISOString().split('T')[0] })
        .getRawOne(),
      // Pedidos nuevos ayer
      this.pedidoRepo
        .createQueryBuilder('p')
        .where('p.fecha_creacion >= :inicioAyer', { inicioAyer: inicioAyerUTC })
        .andWhere('p.fecha_creacion <= :finAyer', { finAyer: finAyerUTC })
        .getCount(),
      // Insumos en stock crítico
      this.insumoRepo
        .createQueryBuilder('i')
        .where('i.stock <= i.nivel_minimo')
        .getMany(),
    ]);

    const ventasMes = parseFloat((pedidosMes as any)?.sum ?? '0');

    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const mesesNombre = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                         'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const fechaFormateada = `${diasSemana[boliviaHoy.getUTCDay()]} ${diaHoy} de ${mesesNombre[mesHoy]} de ${anoHoy}`;

    const topInsumosLineas = insumosStockCritico
      .slice(0, 5)
      .map(i => `  • ${i.nombre}: ${i.stock} (mín. ${i.nivel_minimo})`)
      .join('\n');

    const mensaje =
      `📊 Resumen del día — Calzados Nueva Tendencia\n` +
      `📅 ${fechaFormateada}\n\n` +
      `📦 PRODUCCIÓN\n` +
      `✅ Terminados ayer: ${terminadosAyer}\n` +
      `🔄 En producción ahora: ${enProduccion}\n` +
      `📅 Vencen HOY: ${pedidosVencenHoy.length} pedidos\n` +
      `📅 Vencen mañana: ${pedidosVencenManana.length} pedidos\n\n` +
      `💰 VENTAS\n` +
      `💵 Ventas del mes: Bs. ${ventasMes.toFixed(2)}\n` +
      `🆕 Pedidos nuevos ayer: ${pedidosNuevosAyer}\n\n` +
      `📋 INVENTARIO\n` +
      `⚠️ Insumos en stock crítico: ${insumosStockCritico.length}` +
      (topInsumosLineas ? `\n${topInsumosLineas}` : '');

    let seccionEntregas = '';
    if (pedidosVencenHoy.length > 0 || pedidosVencenManana.length > 0) {
      const fmtPedido = (p: Pedido) =>
        `  • #${p.id_pedido} ${p.producto?.nombre_modelo ?? 'N/A'} — ${p.cliente?.nombre ?? 'N/A'} [${p.estado}]`;

      seccionEntregas = '\n\n📅 ENTREGAS PRÓXIMAS';
      if (pedidosVencenHoy.length > 0)
        seccionEntregas += `\n🔴 Vencen HOY (${pedidosVencenHoy.length})\n` +
          pedidosVencenHoy.map(fmtPedido).join('\n');
      if (pedidosVencenManana.length > 0)
        seccionEntregas += `\n🟠 Vencen mañana (${pedidosVencenManana.length})\n` +
          pedidosVencenManana.map(fmtPedido).join('\n');
    }

    await this.sendMessage(mensaje + seccionEntregas, chatId);
  }

  // 8am Bolivia
  @Cron('0 8 * * *', { timeZone: 'America/La_Paz' })
  async alertarStockEnCero(): Promise<void> {
    const sinStock = await this.insumoRepo
      .createQueryBuilder('i')
      .where('i.stock = 0')
      .getMany();

    if (sinStock.length === 0) return;

    const lineas = sinStock.map(i => `• ${i.nombre}: 0 unidades`).join('\n');
    await this.sendMessage(`🚨 STOCK EN CERO — requiere atención inmediata\n${lineas}`);
  }

  // Lunes 7am Bolivia
  @Cron('0 7 * * 1', { timeZone: 'America/La_Paz' })
  async sendResumenSemanal(): Promise<void> {
    console.log(`[Telegram Cron] Ejecutando sendResumenSemanal - ${new Date().toISOString()}`);

    const ahora = new Date();
    const offsetBolivia = -4 * 60;
    const boliviaMs = ahora.getTime() + (offsetBolivia - ahora.getTimezoneOffset()) * 60000;
    const boliviaHoy = new Date(boliviaMs);

    const anoHoy = boliviaHoy.getUTCFullYear();
    const mesHoy = boliviaHoy.getUTCMonth();
    const diaHoy = boliviaHoy.getUTCDate();

    // Rango: últimos 7 días en UTC (Bolivia UTC-4)
    const inicioSemanaUTC = new Date(Date.UTC(anoHoy, mesHoy, diaHoy - 7, 4, 0, 0, 0));
    const finSemanaUTC    = new Date(Date.UTC(anoHoy, mesHoy, diaHoy,     3, 59, 59, 999));

    const hoyStr = `${anoHoy}-${String(mesHoy + 1).padStart(2, '0')}-${String(diaHoy).padStart(2, '0')}`;

    const mesesNombre = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                         'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const fechaFormateada = `${diaHoy} de ${mesesNombre[mesHoy]} de ${anoHoy}`;

    const [
      terminadosSemana,
      nuevosSemana,
      ventasSemanaRaw,
      enProduccion,
      insumosStockCritico,
      vencidosHoy,
    ] = await Promise.all([
      this.pedidoRepo.count({
        where: { estado: 'Terminado', fecha_actualizacion: Between(inicioSemanaUTC, finSemanaUTC) },
      }),
      this.pedidoRepo
        .createQueryBuilder('p')
        .where('p.fecha_creacion >= :inicio', { inicio: inicioSemanaUTC })
        .andWhere('p.fecha_creacion <= :fin', { fin: finSemanaUTC })
        .getCount(),
      this.pedidoRepo
        .createQueryBuilder('p')
        .select('SUM(p.total)', 'sum')
        .where('p.estado = :estado', { estado: 'Terminado' })
        .andWhere('p.fecha_actualizacion >= :inicio', { inicio: inicioSemanaUTC })
        .andWhere('p.fecha_actualizacion <= :fin', { fin: finSemanaUTC })
        .getRawOne(),
      this.pedidoRepo.count({ where: { estado: Not('Terminado') } }),
      this.insumoRepo
        .createQueryBuilder('i')
        .where('i.stock <= i.nivel_minimo')
        .getMany(),
      this.pedidoRepo
        .createQueryBuilder('p')
        .where('p.fecha_entrega <= :hoy', { hoy: hoyStr })
        .andWhere('p.estado != :estado', { estado: 'Terminado' })
        .getCount(),
    ]);

    const ventasSemana = parseFloat((ventasSemanaRaw as any)?.sum ?? '0');

    const contextoNumericos =
      `Semana del ${fechaFormateada}:\n` +
      `- Pedidos terminados: ${terminadosSemana}\n` +
      `- Pedidos nuevos: ${nuevosSemana}\n` +
      `- Ventas acumuladas: Bs. ${ventasSemana.toFixed(2)}\n` +
      `- En producción ahora: ${enProduccion}\n` +
      `- Pedidos vencidos sin terminar: ${vencidosHoy}\n` +
      `- Insumos en stock crítico: ${insumosStockCritico.length}` +
      (insumosStockCritico.length > 0
        ? '\n' + insumosStockCritico.slice(0, 5).map(i => `  • ${i.nombre}: ${i.stock} (mín. ${i.nivel_minimo})`).join('\n')
        : '');

    const promptGemini =
      `Datos reales de la semana:\n${contextoNumericos}\n\n` +
      `Genera un resumen ejecutivo de la semana para el dueño del taller. ` +
      `Analiza el rendimiento, tendencias, alertas importantes y 2-3 recomendaciones concretas. ` +
      `Máximo 200 palabras. Usa emojis. Sé directo y útil.`;

    let cuerpo: string;
    try {
      cuerpo = await this.assistantService.chat(promptGemini);
    } catch (err) {
      console.error('[Telegram Cron] Gemini falló en resumen semanal:',
        err?.message, err?.status, JSON.stringify(err));
      cuerpo = contextoNumericos;
    }

    await this.sendMessage(`📊 Análisis semanal — ${fechaFormateada}\n\n${cuerpo}`);
  }
}
