process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.DOWNLOAD_TOKEN_SECRET = process.env.DOWNLOAD_TOKEN_SECRET || 'test-download-secret';

import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AuthModule } from '../src/auth/auth.module';
import { UserModule } from '../src/user/user.module';
import { AuthService } from '../src/auth/auth.service';
import { UserService } from '../src/user/user.service';
import { User } from '../src/user/entities/user.entity';
import { Cliente } from '../src/cliente/entities/cliente.entity';
import { Auditoria } from '../src/auditoria/entities/auditoria.entity';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { CsrfGuard } from '../src/auth/guards/csrf.guard';

/**
 * Boot de los módulos REALES AuthModule + UserModule (con sus controllers
 * y decorators @Roles tal cual están en el código), con los mismos dos
 * APP_GUARD globales que app.module.ts. El objetivo es demostrar que sacar
 * el @UseGuards(RolesGuard) local y redundante de AuthController/UserController
 * (ver src/auth/auth.controller.ts y src/user/user.controller.ts) no cambió
 * en nada la protección real: sigue siendo el guard global el que decide.
 *
 * AuthService y UserService se reemplazan por fakes para no tocar la BD real;
 * lo que se está probando es el guard/decorator de cada ruta, no la lógica
 * de negocio (que ya tiene sus propios tests unitarios).
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, UserModule],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
class TestAppModule {}

describe('Protección real de /auth y /users (e2e, sin @UseGuards local)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let adminToken: string;
  let operarioToken: string;
  let clienteToken: string;

  const fakeAuthService = {
    validateUser: jest.fn().mockResolvedValue({ id: 1, email: 'admin@nt.com', role: 'admin' }),
    login: jest.fn().mockResolvedValue({
      access_token: 'irrelevante-para-este-test',
      user: { id: 1, email: 'admin@nt.com', role: 'admin' },
    }),
    me: jest.fn().mockImplementation((userId: number) =>
      Promise.resolve({ id: userId, email: 'admin@nt.com', role: 'admin' }),
    ),
    registerOperario: jest.fn().mockResolvedValue({ id: 5, email: 'nuevo-operario@nt.com', role: 'operario' }),
  };

  const fakeUserService = {
    getSessionState: jest.fn().mockResolvedValue({ tokenVersion: 0, activo: true }),
    findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    findOne: jest.fn().mockResolvedValue({ id: 1, email: 'admin@nt.com' }),
    adminCreate: jest.fn().mockResolvedValue({ id: 6, email: 'creado@nt.com' }),
    toggleActive: jest.fn().mockResolvedValue({ id: 1, activo: false }),
    adminUpdate: jest.fn().mockResolvedValue({ id: 1 }),
    adminDelete: jest.fn().mockResolvedValue({ deleted: true }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    })
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      .overrideProvider(UserService)
      .useValue(fakeUserService)
      .overrideProvider(getRepositoryToken(User))
      .useValue({})
      .overrideProvider(getRepositoryToken(Cliente))
      .useValue({})
      .overrideProvider(getRepositoryToken(Auditoria))
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    jwtService = moduleFixture.get(JwtService);
    adminToken = jwtService.sign({ sub: 1, email: 'admin@nt.com', role: 'admin' });
    operarioToken = jwtService.sign({ sub: 2, email: 'operario@nt.com', role: 'operario' });
    clienteToken = jwtService.sign({ sub: 3, email: 'cliente@nt.com', role: 'cliente' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login — sigue público', () => {
    it('no requiere token', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@nt.com', password: 'cualquiera' })
        .expect(201);

      expect(fakeAuthService.validateUser).toHaveBeenCalledWith('admin@nt.com', 'cualquiera');
    });
  });

  describe('GET /auth/me — sigue exigiendo autenticación', () => {
    it('rechaza sin token (401)', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('permite con un token válido (200)', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('POST /auth/register-operario — sigue exigiendo rol admin', () => {
    const body = { email: 'nuevo@nt.com', password: 'secreto1', nombre: 'Nuevo' };

    it('rechaza sin token (401)', async () => {
      await request(app.getHttpServer()).post('/auth/register-operario').send(body).expect(401);
    });

    it('rechaza con token de rol operario (403)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register-operario')
        .set('Authorization', `Bearer ${operarioToken}`)
        .send(body)
        .expect(403);
    });

    it('rechaza con token de rol cliente (403)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register-operario')
        .set('Authorization', `Bearer ${clienteToken}`)
        .send(body)
        .expect(403);
    });

    it('permite con token de rol admin (201)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register-operario')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body)
        .expect(201);

      expect(fakeAuthService.registerOperario).toHaveBeenCalled();
    });
  });

  describe('/users — sigue exigiendo rol admin (declarado a nivel de clase)', () => {
    it('GET /users rechaza sin token (401)', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });

    it('GET /users rechaza con token operario (403)', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${operarioToken}`)
        .expect(403);
    });

    it('GET /users rechaza con token cliente (403)', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect(403);
    });

    it('GET /users permite con token admin (200)', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('POST /users rechaza con token operario (403)', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${operarioToken}`)
        .send({ email: 'x@nt.com' })
        .expect(403);
    });

    it('DELETE /users/1 rechaza con token operario (403)', async () => {
      await request(app.getHttpServer())
        .delete('/users/1')
        .set('Authorization', `Bearer ${operarioToken}`)
        .expect(403);
    });

    it('PATCH /users/1/toggle rechaza con token operario (403) — @Roles(admin) de clase anula el bypass GET/PATCH de operario', async () => {
      await request(app.getHttpServer())
        .patch('/users/1/toggle')
        .set('Authorization', `Bearer ${operarioToken}`)
        .expect(403);
    });

    it('PATCH /users/1/toggle permite con token admin (200)', async () => {
      await request(app.getHttpServer())
        .patch('/users/1/toggle')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });
});
