import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Cron('*/5 * * * *')
  async pingDb() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch (err) {
      this.logger.error('Keep-alive DB ping failed', (err as Error).message);
    }
  }

  @Cron('0 */10 * * * *')
  async pingHttp() {
    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) return;

    try {
      const res = await fetch(`${backendUrl}/api`);
      this.logger.log(`Keep-alive HTTP ping OK — status ${res.status}`);
    } catch (err) {
      this.logger.error('Keep-alive HTTP ping failed', (err as Error).message);
    }
  }
}
