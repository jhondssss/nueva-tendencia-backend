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
import { SolicitudPedidoModule } from './solicitud-pedido/solicitud-pedido.module';
import { CalificacionModule } from './calificacion/calificacion.module';
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
import { SeedModule } from './seed/seed.module';

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
        const host     = process.env.DB_HOST     || 'localhost';
        const port     = parseInt(process.env.DB_PORT || '5432');
        const username = process.env.DB_USERNAME || 'postgres';
        const password = process.env.DB_PASSWORD || '';
        const database = process.env.DB_NAME     || 'postgres';
        console.log('DB_HOST runtime:', host);
        return {
          type:        'postgres',
          host, port, username, password, database,
          entities:    [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: false,
          // rejectUnauthorized: false es necesario — el pooler de Supabase (pgbouncer)
          // presenta un certificado que no encadena a una CA pública reconocida por
          // Node ("self-signed certificate in certificate chain"). Se probó con
          // rejectUnauthorized: true y la conexión falla. La conexión sigue cifrada
          // (TLS), solo no se valida la cadena del certificado contra una CA raíz.
          ssl:         { rejectUnauthorized: false },
          keepConnectionAlive: true,
          retryAttempts:       10,
          retryDelay:          3000,
          extra: {
            max:                        3,
            connectionTimeoutMillis:    60000,
            keepAlive:                  true,
            keepAliveInitialDelayMillis: 30000,
          },
        };
      },
    }),
    ProductoModule,
    ClienteModule,
    PedidoModule,
    SolicitudPedidoModule,
    CalificacionModule,
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
    SeedModule,
  ],
  providers: [
    // ── Rate limiting global ──
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // ── Guard de roles (ya existía) ──
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}