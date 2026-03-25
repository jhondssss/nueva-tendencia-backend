import { Injectable } from '@nestjs/common';

@Injectable()
export class TelegramService {
  private readonly botToken = process.env.TELEGRAM_BOT_TOKEN;
  private readonly chatId   = process.env.TELEGRAM_CHAT_ID;

  async sendMessage(message: string): Promise<void> {
    if (!this.botToken || !this.chatId) return;

    await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: this.chatId, text: message }),
    });
  }
}
