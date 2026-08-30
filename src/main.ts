import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import * as fs from 'fs';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ── Helmet — headers de seguridad HTTP ──
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // ── Cookies (para la cookie HttpOnly de sesión) ──
  app.use(cookieParser());

  // ── Validación global ──
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
  }));

  // ── CORS estricto ──
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'https://nueva-tendencia-frontend.vercel.app',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-silent'],
    credentials: true,
  });

  // ── Carpeta de uploads ──
  const uploadsDir = join(__dirname, '..', 'uploads', 'productos');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Carpeta de uploads creada:', uploadsDir);
  }

  // ── Archivos estáticos ──
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // ── Swagger ──
  const config = new DocumentBuilder()
    .setTitle('API de Calzados Nueva Tendencia')
    .setDescription('Documentación de los endpoints del proyecto')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log('🚀 Servidor backend corriendo en puerto', port);
  console.log(`📚 Swagger disponible en http://localhost:${port}/api`);
}
bootstrap();