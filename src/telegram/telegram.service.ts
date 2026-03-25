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

  // 8am Bolivia (UTC-4) = 12pm UTC
  @Cron('0 12 * * *')
  async sendResumenDiario(): Promise<void> {
    const hoy       = new Date();
    const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
    const finDia    = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999);

    const [terminadosHoy, enProduccion, stockCritico] = await Promise.all([
      this.pedidoRepo.count({
        where: { estado: 'Terminado', fecha_actualizacion: Between(inicioDia, finDia) },
      }),
      this.pedidoRepo.count({ where: { estado: Not('Terminado') } }),
      this.insumoRepo
        .createQueryBuilder('i')
        .where('i.stock <= i.nivel_minimo')
        .getCount(),
    ]);

    this.sendMessage(
      `📊 Resumen del día\n✅ Terminados hoy: ${terminadosHoy}\n🔄 En producción: ${enProduccion}\n⚠️ Stock crítico: ${stockCritico} insumos`,
    ).catch(() => {});
  }
}
