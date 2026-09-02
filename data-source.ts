import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'postgres',
  ssl: { rejectUnauthorized: false },
  entities:   ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  // 'each': cada migración corre en su propia transacción. Necesario porque
  // ALTER TYPE ... ADD VALUE (enums nativos de Postgres) no puede usarse en
  // la misma transacción en la que fue agregado.
  migrationsTransactionMode: 'each',
});
