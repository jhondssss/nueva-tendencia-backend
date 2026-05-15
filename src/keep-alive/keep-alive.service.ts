import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Cron('*/5 * * * *')
  async ping() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch (err) {
      this.logger.error('Keep-alive ping failed', (err as Error).message);
    }
  }
}
