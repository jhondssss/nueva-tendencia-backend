import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { RolesGuard } from './auth/guards/roles.guard';
import { ProductoModule } from './producto/producto.module';
import { ClienteModule } from './cliente/cliente.module';
import { PedidoModule } from './pedido/pedido.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { AssistantModule } from './assistant/assistant.module';
import { ReportesModule } from './reportes/reportes.module';
import { KardexModule } from './kardex/kardex.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { InsumoModule } from './insumo/insumo.module';
import { TallaModule } from './talla/talla.module';
import { TelegramModule } from './telegram/telegram.module';
import { KeepAliveModule } from './keep-alive/keep-alive.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    // ── Rate limiting — máximo 100 requests por IP cada 60 segundos ──
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),

    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const host     = process.env.DB_HOST     || 'mysql-2129d7bb-jhoncarlosg5-8f1f.e.aivencloud.com';
        const port     = parseInt(process.env.DB_PORT || '24469');
        const username = process.env.DB_USERNAME || 'avnadmin';
        const password = process.env.DB_PASSWORD || 'AVNS_TRjUXaO973ksTPwkX5t';
        const database = process.env.DB_NAME     || 'defaultdb';
        console.log('DB_HOST runtime:', host);
        return {
          type:        'mysql',
          host, port, username, password, database,
          entities:    [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: false,
          charset:     'utf8mb4',
          collation:   'utf8mb4_unicode_ci',
          ssl:         { rejectUnauthorized: false },
          // Reconexión automática ante caídas por inactividad (ETIMEDOUT)
          keepConnectionAlive: true,
          retryAttempts:       10,
          retryDelay:          3000,
          extra: {
            // Pool de conexiones — evita abrir/cerrar en cada request
            waitForConnections: true,
            connectionLimit:    10,
            queueLimit:         0,
            // Timeouts para Aiven Cloud (conexión remota con SSL)
            connectTimeout:  60000,
            acquireTimeout:  60000,
            // Keep-alive a nivel de socket — evita que el OS cierre la conexión idle
            keepAlive:             true,
            keepAliveInitialDelay: 10000,
          },
        };
      },
    }),
    ProductoModule,
    ClienteModule,
    PedidoModule,
    DashboardModule,
    AuthModule,
    UserModule,
    AssistantModule,
    ReportesModule,
    KardexModule,
    AuditoriaModule,
    InsumoModule,
    TallaModule,
    TelegramModule,
    KeepAliveModule,
  ],
  providers: [
    // ── Rate limiting global ──
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // ── Guard de roles (ya existía) ──
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}