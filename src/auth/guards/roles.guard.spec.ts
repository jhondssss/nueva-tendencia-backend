import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ALLOW_DOWNLOAD_TOKEN_KEY } from '../decorators/allow-download-token.decorator';
import { DownloadTokenService } from '../download-token.service';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let jwtService: { verify: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };
  let downloadTokenService: { consumir: jest.Mock };

  const buildContext = (
    method: string,
    authHeader?: string,
    cookies?: Record<string, string>,
    query?: Record<string, string>,
  ): ExecutionContext => {
    const request: any = {
      method,
      headers: authHeader ? { authorization: authHeader } : {},
      cookies: cookies ?? {},
      query: query ?? {},
    };
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  };

  const setMetadata = (
    isPublic: boolean | undefined,
    roles: string[] | undefined,
    allowDownloadToken?: boolean,
  ) => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return isPublic;
      if (key === ROLES_KEY) return roles;
      if (key === ALLOW_DOWNLOAD_TOKEN_KEY) return allowDownloadToken;
      return undefined;
    });
  };

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    reflector = { getAllAndOverride: jest.fn() };
    downloadTokenService = { consumir: jest.fn() };
    guard = new RolesGuard(
      jwtService as unknown as JwtService,
      reflector as unknown as Reflector,
      downloadTokenService as unknown as DownloadTokenService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('permite el paso sin verificar token si el endpoint es @Public()', () => {
    setMetadata(true, undefined);
    const context = buildContext('GET');

    expect(guard.canActivate(context)).toBe(true);
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it('lanza UnauthorizedException si no se envía token', () => {
    setMetadata(false, undefined);
    const context = buildContext('GET');

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException si el token es inválido o expiró', () => {
    setMetadata(false, undefined);
    jwtService.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const context = buildContext('GET', 'Bearer token-invalido');

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  describe('extracción de token', () => {
    it('autentica con la cookie access_token si no hay header Authorization', () => {
      setMetadata(false, undefined);
      jwtService.verify.mockReturnValue({ sub: 1, email: 'admin@nt.com', role: 'admin' });
      const context = buildContext('GET', undefined, { access_token: 'token-cookie' });

      expect(guard.canActivate(context)).toBe(true);
      expect(jwtService.verify).toHaveBeenCalledWith('token-cookie');
      const request = context.switchToHttp().getRequest();
      expect(request.authSource).toBe('cookie');
    });

    it('cae al header Authorization si no hay cookie', () => {
      setMetadata(false, undefined);
      jwtService.verify.mockReturnValue({ sub: 1, email: 'admin@nt.com', role: 'admin' });
      const context = buildContext('GET', 'Bearer token-header');

      expect(guard.canActivate(context)).toBe(true);
      expect(jwtService.verify).toHaveBeenCalledWith('token-header');
      const request = context.switchToHttp().getRequest();
      expect(request.authSource).toBe('header');
    });

    it('prioriza la cookie sobre el header si ambos están presentes', () => {
      setMetadata(false, undefined);
      jwtService.verify.mockReturnValue({ sub: 1, email: 'admin@nt.com', role: 'admin' });
      const context = buildContext('GET', 'Bearer token-header', { access_token: 'token-cookie' });

      guard.canActivate(context);
      expect(jwtService.verify).toHaveBeenCalledWith('token-cookie');
    });

    it('lanza UnauthorizedException si el token de la cookie es inválido', () => {
      setMetadata(false, undefined);
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      const context = buildContext('GET', undefined, { access_token: 'token-invalido' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('rol admin', () => {
    it('pasa en cualquier método sin @Roles() declarado', () => {
      setMetadata(false, undefined);
      jwtService.verify.mockReturnValue({ sub: 1, email: 'admin@nt.com', role: 'admin' });

      for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
        const context = buildContext(method, 'Bearer token');
        expect(guard.canActivate(context)).toBe(true);
      }
    });
  });

  describe('rol operario', () => {
    beforeEach(() => {
      jwtService.verify.mockReturnValue({ sub: 2, email: 'operario@nt.com', role: 'operario' });
    });

    it.each(['GET', 'PATCH'])('permite %s sin @Roles() declarado', (method) => {
      setMetadata(false, undefined);
      const context = buildContext(method, 'Bearer token');

      expect(guard.canActivate(context)).toBe(true);
    });

    it.each(['POST', 'DELETE', 'PUT'])('rechaza %s sin @Roles() declarado', (method) => {
      setMetadata(false, undefined);
      const context = buildContext(method, 'Bearer token');

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('rol no reconocido', () => {
    it.each(['cliente', 'user', 'invitado'])(
      'rechaza el rol "%s" en un endpoint sin @Roles() declarado',
      (role) => {
        setMetadata(false, undefined);
        jwtService.verify.mockReturnValue({ sub: 3, email: 'x@nt.com', role });
        const context = buildContext('GET', 'Bearer token');

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      },
    );
  });

  describe('@Roles() explícito', () => {
    it('permite acceso cuando el rol del token está en la lista declarada', () => {
      setMetadata(false, ['cliente']);
      jwtService.verify.mockReturnValue({ sub: 4, email: 'c@nt.com', role: 'cliente' });
      const context = buildContext('GET', 'Bearer token');

      expect(guard.canActivate(context)).toBe(true);
    });

    it('rechaza acceso cuando el rol no está en la lista declarada, incluso a un operario en GET', () => {
      setMetadata(false, ['admin']);
      jwtService.verify.mockReturnValue({ sub: 5, email: 'o@nt.com', role: 'operario' });
      const context = buildContext('GET', 'Bearer token');

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('respeta una lista de múltiples roles declarados', () => {
      setMetadata(false, ['admin', 'operario']);
      jwtService.verify.mockReturnValue({ sub: 6, email: 'o@nt.com', role: 'operario' });
      const context = buildContext('PATCH', 'Bearer token');

      expect(guard.canActivate(context)).toBe(true);
    });

    it('rechaza un rol ausente de la lista aunque el método sea GET/PATCH (no aplica el bypass de operario)', () => {
      setMetadata(false, ['admin']);
      jwtService.verify.mockReturnValue({ sub: 7, email: 'c@nt.com', role: 'cliente' });
      const context = buildContext('GET', 'Bearer token');

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('token de descarga por query param (@AllowDownloadToken)', () => {
    it('permite la descarga con un token de descarga válido cuando no hay cookie ni header', () => {
      setMetadata(false, ['admin', 'operario'], true);
      downloadTokenService.consumir.mockReturnValue({
        sub: 1,
        email: 'admin@nt.com',
        role: 'admin',
        typ: 'download',
        jti: 'jti-1',
      });
      const context = buildContext('GET', undefined, undefined, { token: 'token-descarga-valido' });

      expect(guard.canActivate(context)).toBe(true);
      expect(downloadTokenService.consumir).toHaveBeenCalledWith('token-descarga-valido');
      expect(jwtService.verify).not.toHaveBeenCalled();
      const request = context.switchToHttp().getRequest();
      expect(request.authSource).toBe('download-token');
    });

    it('rechaza el token de descarga si el rol que trae no está habilitado para el endpoint, aunque el token sea válido en su firma', () => {
      setMetadata(false, ['admin'], true);
      downloadTokenService.consumir.mockReturnValue({
        sub: 9,
        email: 'cliente@nt.com',
        role: 'cliente',
        typ: 'download',
        jti: 'jti-cliente',
      });
      const context = buildContext('GET', undefined, undefined, { token: 'token-de-cliente' });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(downloadTokenService.consumir).toHaveBeenCalledWith('token-de-cliente');
    });

    it('propaga el rechazo del servicio si el token de descarga expiró o ya fue usado', () => {
      setMetadata(false, ['admin', 'operario'], true);
      downloadTokenService.consumir.mockImplementation(() => {
        throw new UnauthorizedException('Token de descarga inválido o expirado');
      });
      const context = buildContext('GET', undefined, undefined, { token: 'token-expirado' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('ignora el token de descarga por query param si el endpoint no tiene @AllowDownloadToken()', () => {
      setMetadata(false, ['admin', 'operario'], false);
      const context = buildContext('GET', undefined, undefined, { token: 'token-descarga-valido' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(downloadTokenService.consumir).not.toHaveBeenCalled();
    });

    it('sigue exigiendo cookie/header cuando no se manda ningún token de descarga', () => {
      setMetadata(false, ['admin', 'operario'], true);
      const context = buildContext('GET');

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(downloadTokenService.consumir).not.toHaveBeenCalled();
    });

    it('prioriza la cookie/header por sobre el token de descarga si ambos están presentes', () => {
      setMetadata(false, ['admin', 'operario'], true);
      jwtService.verify.mockReturnValue({ sub: 1, email: 'admin@nt.com', role: 'admin' });
      const context = buildContext('GET', undefined, { access_token: 'token-cookie' }, { token: 'token-descarga' });

      expect(guard.canActivate(context)).toBe(true);
      expect(downloadTokenService.consumir).not.toHaveBeenCalled();
    });
  });
});
