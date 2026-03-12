import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    transform: true,
  }));

  // ✅ Habilitar CORS para permitir el acceso desde tu frontend Vite (Vue)
  app.enableCors({
    origin: 'http://localhost:5173',
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    credentials: true,
  });
  
  const uploadsDir = join(__dirname, '..', 'uploads', 'productos');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Carpeta de uploads creada:', uploadsDir);
  }

  // ✅ SERVIR ARCHIVOS ESTÁTICOS (para las imágenes de productos)
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // ✅ Swagger (Documentación)
  const config = new DocumentBuilder()
    .setTitle('API de Calzados Nueva Tendencia')
    .setDescription('Documentación de los endpoints del proyecto')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
  console.log('🚀 Servidor backend corriendo en http://localhost:3000');
  console.log('📚 Swagger disponible en http://localhost:3000/api');
}
bootstrap();