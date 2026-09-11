import { Controller, Get, INestApplication, Module, Patch, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { CsrfGuard } from '../src/auth/guards/csrf.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/auth.constants';

const JWT_SECRET_TEST = 'secreto-de-test';

/**
 * Controlador mínimo solo para ejercitar RolesGuard + CsrfGuard end-to-end
 * (parseo real de cookies/headers en un ciclo HTTP), sin depender de la BD
 * real que usa AppModule.
 */
@Controller('recurso-de-prueba')
class RecursoDePruebaController {
  @Get()
  get() {
    return { ok: true };
  }

  @Post()
  post() {
    return { ok: true };
  }

  @Patch()
  patch() {
    return { ok: true };
  }
}

@Module({
  imports: [JwtModule.register({ secret: JWT_SECRET_TEST, signOptions: { expiresIn: '1h' } })],
  controllers: [RecursoDePruebaController],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
class TestAppModule {}

describe('Autenticación por cookie + CSRF (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    jwtService = moduleFixture.get(JwtService);
    adminToken = jwtService.sign({ sub: 1, email: 'admin@nt.com', role: 'admin' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('una petición GET autenticada solo por cookie funciona', async () => {
    await request(app.getHttpServer())
      .get('/recurso-de-prueba')
      .set('Cookie', `${ACCESS_TOKEN_COOKIE}=${adminToken}`)
      .expect(200)
      .expect({ ok: true });
  });

  it('una mutación autenticada por cookie sin el header X-Requested-With es rechazada con 403', async () => {
    await request(app.getHttpServer())
      .post('/recurso-de-prueba')
      .set('Cookie', `${ACCESS_TOKEN_COOKIE}=${adminToken}`)
      .expect(403);
  });

  it('una mutación autenticada por cookie con el header X-Requested-With funciona', async () => {
    await request(app.getHttpServer())
      .patch('/recurso-de-prueba')
      .set('Cookie', `${ACCESS_TOKEN_COOKIE}=${adminToken}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .expect(200)
      .expect({ ok: true });
  });

  it('una mutación autenticada por header Authorization no requiere el header custom', async () => {
    await request(app.getHttpServer())
      .post('/recurso-de-prueba')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });

  it('una petición sin cookie ni header es rechazada con 401 (mismo guard que protege /auth/me)', async () => {
    await request(app.getHttpServer()).get('/recurso-de-prueba').expect(401);
  });
});
