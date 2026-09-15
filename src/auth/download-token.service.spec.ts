import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { DownloadTokenService } from './download-token.service';

describe('DownloadTokenService', () => {
  const SECRET = 'download-test-secret';
  let jwtService: JwtService;
  let service: DownloadTokenService;

  const buildConfigService = (secret: string | undefined) =>
    ({ get: jest.fn().mockReturnValue(secret) }) as unknown as ConfigService;

  beforeEach(() => {
    jwtService = new JwtService({});
    service = new DownloadTokenService(jwtService, buildConfigService(SECRET));
  });

  it('lanza al construirse si DOWNLOAD_TOKEN_SECRET no está definido', () => {
    expect(() => new DownloadTokenService(new JwtService({}), buildConfigService(undefined))).toThrow(
      'DOWNLOAD_TOKEN_SECRET no está definido',
    );
  });

  it('genera un token que se puede consumir una vez y devuelve el payload del usuario (token válido descarga bien)', () => {
    const token = service.generar({ sub: 1, email: 'admin@nt.com', role: 'admin' });

    const payload = service.consumir(token);

    expect(payload).toMatchObject({ sub: 1, email: 'admin@nt.com', role: 'admin', typ: 'download' });
    expect(typeof payload.jti).toBe('string');
  });

  it('rechaza un token expirado', () => {
    const tokenExpirado = jwtService.sign(
      { sub: 1, email: 'admin@nt.com', role: 'admin', typ: 'download', jti: 'jti-expirado' },
      { secret: SECRET, expiresIn: '-1s' },
    );

    expect(() => service.consumir(tokenExpirado)).toThrow(UnauthorizedException);
    expect(() => service.consumir(tokenExpirado)).toThrow(/inválido o expirado/);
  });

  it('rechaza reutilizar el mismo token (un solo uso)', () => {
    const token = service.generar({ sub: 2, email: 'op@nt.com', role: 'operario' });

    expect(service.consumir(token)).toBeDefined();
    expect(() => service.consumir(token)).toThrow(UnauthorizedException);
    expect(() => service.consumir(token)).toThrow(/ya utilizado/);
  });

  it('rechaza un token firmado con un secreto distinto', () => {
    const tokenAjeno = new JwtService({}).sign(
      { sub: 1, email: 'x@nt.com', role: 'admin', typ: 'download', jti: 'jti-ajeno' },
      { secret: 'otro-secreto', expiresIn: '2m' },
    );

    expect(() => service.consumir(tokenAjeno)).toThrow(UnauthorizedException);
  });

  it('rechaza un JWT de sesión normal (mismo secreto pero sin typ=download)', () => {
    const tokenSesion = jwtService.sign(
      { sub: 1, email: 'admin@nt.com', role: 'admin' },
      { secret: SECRET, expiresIn: '2m' },
    );

    expect(() => service.consumir(tokenSesion)).toThrow(UnauthorizedException);
  });
});
