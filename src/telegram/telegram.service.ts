import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, Between } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Insumo } from '../insumo/entities/insumo.entity';

@Injectable()
export class TelegramService {
  private readonly botToken = process.env.TELEGRAM_BOT_TOKEN;
  private readonly chatId   = process.env.TELEGRAM_CHAT_ID;

  constructor(
    @InjectRepository(Pedido) private readonly pedidoRepo: Repository<Pedido>,
    @InjectRepository(Insumo) private readonly insumoRepo: Repository<Insumo>,
  ) {}

  async sendMessage(message: string): Promise<void> {
    if (!this.botToken || !this.chatId) return;

    await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: this.chatId, text: message }),
    });
  }

  @Cron('*/10 * * * *', { timeZone: 'America/La_Paz' })
  async keepAlive(): Promise<void> {
    console.log('[KeepAlive]', new Date().toISOString());
  }

  // 7am Bolivia
  @Cron('0 7 * * *', { timeZone: 'America/La_Paz' })
  async sendResumenDiario(): Promise<void> {
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
      vencenHoy,
      vencenManana,
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
        .where('p.fecha_entrega = :hoy', { hoy: hoyStr })
        .andWhere('p.estado != :estado', { estado: 'Terminado' })
        .getCount(),
      // Vencen mañana (fecha_entrega es string 'YYYY-MM-DD')
      this.pedidoRepo.createQueryBuilder('p')
        .where('p.fecha_entrega = :manana', { manana: mananaStr })
        .andWhere('p.estado != :estado', { estado: 'Terminado' })
        .getCount(),
      // Ventas del mes: pedidos Terminados con fecha_entrega en el mes actual
      this.pedidoRepo
        .createQueryBuilder('p')
        .select('SUM(p.total)', 'sum')
        .where('p.estado = :estado', { estado: 'Terminado' })
        .andWhere('p.fecha_entrega >= :inicioMesStr', { inicioMesStr: `${anoHoy}-${String(mesHoy + 1).padStart(2, '0')}-01` })
        .andWhere('p.fecha_entrega <= :finMesStr', { finMesStr: `${anoHoy}-${String(mesHoy + 1).padStart(2, '0')}-31` })
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
      `📅 Vencen HOY: ${vencenHoy} pedidos\n` +
      `📅 Vencen mañana: ${vencenManana} pedidos\n\n` +
      `💰 VENTAS\n` +
      `💵 Ventas del mes: Bs. ${ventasMes.toFixed(2)}\n` +
      `🆕 Pedidos nuevos ayer: ${pedidosNuevosAyer}\n\n` +
      `📋 INVENTARIO\n` +
      `⚠️ Insumos en stock crítico: ${insumosStockCritico.length}` +
      (topInsumosLineas ? `\n${topInsumosLineas}` : '');

    this.sendMessage(mensaje).catch(() => {});
  }
}
