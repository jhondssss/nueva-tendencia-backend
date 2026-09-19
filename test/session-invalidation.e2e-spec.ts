process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { UserService } from '../src/user/user.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { MailService } from '../src/mail/mail.service';
import { DownloadTokenService } from '../src/auth/download-token.service';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { CsrfGuard } from '../src/auth/guards/csrf.guard';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/auth.constants';

/**
 * AuthController + AuthService + RolesGuard + CsrfGuard REALES, con los mismos
 * guards globales que app.module.ts. Solo la capa de datos es un fake en
 * memoria con estado (fila de usuario con password y token_version), para
 * probar de punta a punta el ciclo: emitir token → cambiar contraseña →
 * token viejo muerto / token reemitido vivo.
 */
class FakeUserService {
  fila = { id: 1, email: 'ana@nt.com', role: 'operario', password: '', activo: true, clienteId: null, requiereCambioPassword: false, tokenVersion: 0 };
  getTokenVersionCalls = 0;

  async getTokenVersion(id: number) {
    this.getTokenVersionCalls++;
    return id === this.fila.id ? this.fila.tokenVersion : null;
  }
  async findByIdWithPassword(id: number) {
    return id === this.fila.id ? { ...this.fila } : null;
  }
  async findSessionProfile(id: number) {
    if (id !== this.fila.id) return null;
    const { password, ...resto } = this.fila;
    return resto;
  }
  async setPasswordAndClearFlag(id: number, hash: string) {
    this.fila.password = hash;
    this.fila.requiereCambioPassword = false;
    this.fila.tokenVersion += 1;
    return this.fila.tokenVersion;
  }
  async updatePassword(id: number, hash: string) {
    this.fila.password = hash;
    this.fila.tokenVersion += 1;
    return this.fila.tokenVersion;
  }
  async findByEmail(email: string) {
    return email === this.fila.email ? { ...this.fila } : null;
  }
  async findByResetToken(token: string) {
    return token === 'reset-ok' ? { id: 1, reset_token_expires: new Date(Date.now() + 60000) } : null;
  }
  async clearResetToken() {}
}

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '1h' } })],
  controllers: [AuthController],
  providers: [
    AuthService,
    FakeUserService,
    { provide: UserService, useExisting: FakeUserService },
    { provide: AuditoriaService, useValue: { registrar: jest.fn().mockResolvedValue(undefined) } },
    { provide: MailService, useValue: { sendPasswordResetEmail: jest.fn() } },
    { provide: DownloadTokenService, useValue: { consumir: jest.fn() } },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
class TestAppModule {}

describe('Invalidación de sesiones al cambiar contraseña (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let users: FakeUserService;

  const PASS_VIEJA = 'vieja123';
  const PASS_NUEVA = 'nueva456';

  const tokenV = (version?: number) =>
    jwt.sign({ sub: 1, email: 'ana@nt.com', role: 'operario', ...(version === undefined ? {} : { token_version: version }) });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = moduleFixture.get(JwtService);
    users = moduleFixture.get(FakeUserService);
  });

  beforeEach(async () => {
    users.fila.password = await bcrypt.hash(PASS_VIEJA, 4);
    users.fila.tokenVersion = 0;
    users.fila.requiereCambioPassword = false;
    users.getTokenVersionCalls = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  const cambiarPassword = (token: string) =>
    request(app.getHttpServer())
      .patch('/auth/perfil/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ password_actual: PASS_VIEJA, password_nuevo: PASS_NUEVA });

  it('cambiar la contraseña invalida un token viejo (firmado con la token_version anterior)', async () => {
    const tokenViejo = tokenV(0);
    await request(app.getHttpServer()).get('/auth/perfil').set('Authorization', `Bearer ${tokenViejo}`).expect(200);

    await cambiarPassword(tokenViejo).expect(200);

    const res = await request(app.getHttpServer())
      .get('/auth/perfil')
      .set('Authorization', `Bearer ${tokenViejo}`)
      .expect(401);
    expect(res.body.message).toBe('Sesión inválida, iniciá sesión de nuevo');
  });

  it('otra sesión distinta (otro navegador / token robado) también queda invalidada', async () => {
    const sesionA = tokenV(0);
    const sesionB = tokenV(0);

    await cambiarPassword(sesionA).expect(200);

    await request(app.getHttpServer()).get('/auth/perfil').set('Authorization', `Bearer ${sesionB}`).expect(401);
  });

  it('la sesión propia sigue funcionando: el token reemitido (body y cookie) es válido', async () => {
    const res = await cambiarPassword(tokenV(0)).expect(200);

    expect(users.fila.tokenVersion).toBe(1);
    expect(jwt.decode(res.body.access_token)).toMatchObject({ sub: 1, token_version: 1, requiereCambioPassword: false });

    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const cookie = setCookie.find((c) => c.startsWith(`${ACCESS_TOKEN_COOKIE}=`));
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');

    // Por header con el token reemitido
    await request(app.getHttpServer())
      .get('/auth/perfil')
      .set('Authorization', `Bearer ${res.body.access_token}`)
      .expect(200);
    // Y por cookie, tal como lo hace el navegador
    await request(app.getHttpServer())
      .get('/auth/perfil')
      .set('Cookie', cookie!.split(';')[0])
      .expect(200);
  });

  it('una contraseña actual incorrecta no incrementa token_version ni invalida la sesión', async () => {
    const token = tokenV(0);

    await request(app.getHttpServer())
      .patch('/auth/perfil/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ password_actual: 'incorrecta', password_nuevo: PASS_NUEVA })
      .expect(400);

    expect(users.fila.tokenVersion).toBe(0);
    await request(app.getHttpServer()).get('/auth/perfil').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('reset-password (flujo olvidé mi contraseña) también invalida sesiones anteriores', async () => {
    const token = tokenV(0);
    await request(app.getHttpServer()).get('/auth/perfil').set('Authorization', `Bearer ${token}`).expect(200);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: 'reset-ok', password: PASS_NUEVA })
      .expect(201);

    await request(app.getHttpServer()).get('/auth/perfil').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('cambiar-password-inicial invalida sesiones viejas y reemite la propia', async () => {
    users.fila.requiereCambioPassword = true;
    const tokenViejo = tokenV(0);

    const res = await request(app.getHttpServer())
      .post('/auth/cambiar-password-inicial')
      .set('Authorization', `Bearer ${tokenViejo}`)
      .send({ password: PASS_NUEVA })
      .expect(201);

    await request(app.getHttpServer()).get('/auth/perfil').set('Authorization', `Bearer ${tokenViejo}`).expect(401);
    await request(app.getHttpServer())
      .get('/auth/perfil')
      .set('Authorization', `Bearer ${res.body.access_token}`)
      .expect(200);
  });

  it('un JWT anterior a la migración (sin claim token_version) sigue valiendo mientras la BD esté en 0', async () => {
    await request(app.getHttpServer()).get('/auth/perfil').set('Authorization', `Bearer ${tokenV(undefined)}`).expect(200);
  });

  describe('rutas @Public() no se ven afectadas', () => {
    it('login, logout, forgot-password y reset-password no consultan token_version', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(201);
      await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'nadie@nt.com' }).expect(201);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ana@nt.com', password: PASS_VIEJA })
        .expect(201);

      expect(users.getTokenVersionCalls).toBe(0);
    });

    it('una ruta pública responde igual con un token viejo/invalidado adjunto (no se evalúa)', async () => {
      users.fila.tokenVersion = 5;
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${tokenV(0)}`)
        .expect(201);
      expect(users.getTokenVersionCalls).toBe(0);
    });

    it('el login emite un token con la token_version actual, utilizable de inmediato', async () => {
      users.fila.tokenVersion = 3;
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ana@nt.com', password: PASS_VIEJA })
        .expect(201);

      expect(jwt.decode(res.body.access_token)).toMatchObject({ token_version: 3 });
      await request(app.getHttpServer())
        .get('/auth/perfil')
        .set('Authorization', `Bearer ${res.body.access_token}`)
        .expect(200);
    });
  });
});
