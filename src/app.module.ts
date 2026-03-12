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
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT ?? '3306', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      autoLoadEntities: true,
      synchronize: true,
      ssl: { rejectUnauthorized: false },
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
