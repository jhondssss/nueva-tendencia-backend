import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const host = process.env.DB_HOST || 'mysql-2129d7bb-jhoncarlosg5-8f1f.e.aivencloud.com';
        const port = parseInt(process.env.DB_PORT || '24469');
        const username = process.env.DB_USERNAME || 'avnadmin';
        const password = process.env.DB_PASSWORD || 'AVNS_TRjUXaO973ksTPwkX5t';
        const database = process.env.DB_NAME || 'defaultdb';
        console.log('DB_HOST runtime:', host);
        return {
          type: 'mysql',
          host, port, username, password, database,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: false,
          ssl: { rejectUnauthorized: false },
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
  ],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
