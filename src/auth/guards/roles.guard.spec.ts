import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ALLOW_DOWNLOAD_TOKEN_KEY } from '../decorators/allow-download-token.decorator';
import { DownloadTokenService } from '../download-token.service';
import { UserService } from '../../user/user.service';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let jwtService: { verify: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };
  let downloadTokenService: { consumir: jest.Mock };
  let usersService: { getSessionState: jest.Mock };

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
    // Por defecto la BD tiene token_version 0 y cuenta activa, igual que los tokens de prueba (sin claim = 0).
    usersService = { getSessionState: jest.fn().mockResolvedValue({ tokenVersion: 0, activo: true }) };
    guard = new RolesGuard(
      jwtService as unknown as JwtService,
      reflector as unknown as Reflector,
      downloadTokenService as unknown as DownloadTokenService,
      usersService as unknown as UserService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('permite el paso sin verificar token si el endpoint es @Public()', async () => {
    setMetadata(true, undefined);
    const context = buildContext('GET');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verify).not.toHaveBeenCalled();
    expect(usersService.getSessionState).not.toHaveBeenCalled();
  });

  it('lanza UnauthorizedException si no se envía token', async () => {
    setMetadata(false, undefined);
    const context = buildContext('GET');

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException si el token es inválido o expiró', async () => {
    setMetadata(false, undefined);
    jwtService.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const context = buildContext('GET', 'Bearer token-invalido');

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  describe('extracción de token', () => {
    it('autentica con la cookie access_token si no hay header Authorization', async () => {
      setMetadata(false, undefined);
      jwtService.verify.mockReturnValue({ sub: 1, email: 'admin@nt.com', role: 'admin' });
      const context = buildContext('GET', undefined, { access_token: 'token-cookie' });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(jwtService.verify).toHaveBeenCalledWith('token-cookie');
      const request = context.switchToHttp().getRequest();
      expect(request.authSource).toBe('cookie');
    });

    it('cae al header Authorization si no hay cookie', async () => {
      setMetadata(false, undefined);
      jwtService.verify.mockReturnValue({ sub: 1, email: 'admin@nt.com', role: 'admin' });
      const context = buildContext('GET', 'Bearer token-header');

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(jwtService.verify).toHaveBeenCalledWith('token-header');
      const request = context.switchToHttp().getRequest();
      expect(request.authSource).toBe('header');
    });

    it('prioriza la cookie sobre el header si ambos están presentes', async () => {
      setMetadata(false, undefined);
      jwtService.verify.mockReturnValue({ sub: 1, email: 'admin@nt.com', role: 'admin' });
      const context = buildContext('GET', 'Bearer token-header', { access_token: 'token-cookie' });

      await guard.canActivate(context);
      expect(jwtService.verify).toHaveBeenCalledWith('token-cookie');
    });

    it('lanza UnauthorizedException si el token de la cookie es inválido', async () => {
      setMetadata(false, undefined);
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      const context = buildContext('GET', undefined, { access_token: 'token-invalido' });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('rol admin', () => {
    it('pasa en cualquier método sin @Roles() declarado', async () => {
      setMetadata(false, undefined);
      jwtService.verify.mockReturnValue({ sub: 1, email: 'admin@nt.com', role: 'admin' });

      for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
        const context = buildContext(method, 'Bearer token');
        await expect(guard.canActivate(context)).resolves.toBe(true);
      }
    });
  });

  describe('rol operario', () => {
    beforeEach(() => {
      jwtService.verify.mockReturnValue({ sub: 2, email: 'operario@nt.com', role: 'operario' });
    });

    it.each(['GET', 'PATCH'])('permite %s sin @Roles() declarado', async (method) => {
      setMetadata(false, undefined);
      const context = buildContext(method, 'Bearer token');

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it.each(['POST', 'DELETE', 'PUT'])('rechaza %s sin @Roles() declarado', async (method) => {
      setMetadata(false, undefined);
      const context = buildContext(method, 'Bearer token');

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('rol no reconocido', () => {
    it.each(['cliente', 'user', 'invitado'])(
      'rechaza el rol "%s" en un endpoint sin @Roles() declarado',
      async (role) => {
        setMetadata(false, undefined);
        jwtService.verify.mockReturnValue({ sub: 3, email: 'x@nt.com', role });
        const context = buildContext('GET', 'Bearer token');

        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      },
    );
  });

  describe('@Roles() explícito', () => {
    it('permite acceso cuando el rol del token está en la lista declarada', async () => {
      setMetadata(false, ['cliente']);
      jwtService.verify.mockReturnValue({ sub: 4, email: 'c@nt.com', role: 'cliente' });
      const context = buildContext('GET', 'Bearer token');

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('rechaza acceso cuando el rol no está en la lista declarada, incluso a un operario en GET', async () => {
      setMetadata(false, ['admin']);
      jwtService.verify.mockReturnValue({ sub: 5, email: 'o@nt.com', role: 'operario' });
      const context = buildContext('GET', 'Bearer token');

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('respeta una lista de múltiples roles declarados', async () => {
      setMetadata(false, ['admin', 'operario']);
      jwtService.verify.mockReturnValue({ sub: 6, email: 'o@nt.com', role: 'operario' });
      const context = buildContext('PATCH', 'Bearer token');

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('rechaza un rol ausente de la lista aunque el método sea GET/PATCH (no aplica el bypass de operario)', async () => {
      setMetadata(false, ['admin']);
      jwtService.verify.mockReturnValue({ sub: 7, email: 'c@nt.com', role: 'cliente' });
      const context = buildContext('GET', 'Bearer token');

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('invalidación de sesiones (token_version)', () => {
    beforeEach(() => setMetadata(false, undefined));

    it('rechaza con 401 y mensaje específico si el token_version del JWT es menor al de la BD', async () => {
      jwtService.verify.mockReturnValue({ sub: 1, email: 'a@nt.com', role: 'admin', token_version: 2 });
      usersService.getSessionState.mockResolvedValue({ tokenVersion: 3, activo: true });
      const context = buildContext('GET', 'Bearer token-viejo');

      const error = await guard.canActivate(context).catch((e) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.message).toBe('Sesión inválida, iniciá sesión de nuevo');
      expect(usersService.getSessionState).toHaveBeenCalledWith(1);
    });

    it('acepta el token cuando token_version coincide con la BD', async () => {
      jwtService.verify.mockReturnValue({ sub: 1, email: 'a@nt.com', role: 'admin', token_version: 3 });
      usersService.getSessionState.mockResolvedValue({ tokenVersion: 3, activo: true });

      await expect(guard.canActivate(buildContext('GET', 'Bearer token'))).resolves.toBe(true);
    });

    it('trata un token sin claim (emitido antes de la migración) como versión 0', async () => {
      jwtService.verify.mockReturnValue({ sub: 1, email: 'a@nt.com', role: 'admin' });
      usersService.getSessionState.mockResolvedValue({ tokenVersion: 0, activo: true });
      await expect(guard.canActivate(buildContext('GET', 'Bearer token'))).resolves.toBe(true);

      usersService.getSessionState.mockResolvedValue({ tokenVersion: 1, activo: true });
      await expect(guard.canActivate(buildContext('GET', 'Bearer token'))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rechaza con "Cuenta desactivada" a un usuario activo=false aunque firma y token_version sean válidos', async () => {
      jwtService.verify.mockReturnValue({ sub: 1, email: 'a@nt.com', role: 'admin', token_version: 3 });
      usersService.getSessionState.mockResolvedValue({ tokenVersion: 3, activo: false });

      const error = await guard.canActivate(buildContext('GET', 'Bearer token-valido')).catch((e) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.message).toBe('Cuenta desactivada');
    });

    it('el mensaje de cuenta desactivada tiene prioridad sobre el de token_version desfasado', async () => {
      jwtService.verify.mockReturnValue({ sub: 1, email: 'a@nt.com', role: 'admin', token_version: 1 });
      usersService.getSessionState.mockResolvedValue({ tokenVersion: 4, activo: false });

      await expect(guard.canActivate(buildContext('GET', 'Bearer token'))).rejects.toThrow('Cuenta desactivada');
    });

    it('también rechaza a un usuario desactivado con token de descarga', async () => {
      setMetadata(false, ['admin'], true);
      downloadTokenService.consumir.mockReturnValue({ sub: 1, role: 'admin', token_version: 0, typ: 'download', jti: 'j2' });
      usersService.getSessionState.mockResolvedValue({ tokenVersion: 0, activo: false });

      await expect(
        guard.canActivate(buildContext('GET', undefined, undefined, { token: 'd' })),
      ).rejects.toThrow('Cuenta desactivada');
    });

    it('rechaza si el usuario ya no existe', async () => {
      jwtService.verify.mockReturnValue({ sub: 99, email: 'x@nt.com', role: 'admin', token_version: 0 });
      usersService.getSessionState.mockResolvedValue(null);

      await expect(guard.canActivate(buildContext('GET', 'Bearer token'))).rejects.toThrow(
        'Sesión inválida, iniciá sesión de nuevo',
      );
    });

    it('no consulta la BD si la firma del token es inválida', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(guard.canActivate(buildContext('GET', 'Bearer falso'))).rejects.toThrow(
        UnauthorizedException,
      );
      expect(usersService.getSessionState).not.toHaveBeenCalled();
    });

    it('también valida token_version en tokens de descarga', async () => {
      setMetadata(false, ['admin'], true);
      downloadTokenService.consumir.mockReturnValue({ sub: 1, role: 'admin', token_version: 0, typ: 'download', jti: 'j' });
      usersService.getSessionState.mockResolvedValue({ tokenVersion: 1, activo: true });

      await expect(
        guard.canActivate(buildContext('GET', undefined, undefined, { token: 'd' })),
      ).rejects.toThrow('Sesión inválida, iniciá sesión de nuevo');
    });
  });

  describe('token de descarga por query param (@AllowDownloadToken)', () => {
    it('permite la descarga con un token de descarga válido cuando no hay cookie ni header', async () => {
      setMetadata(false, ['admin', 'operario'], true);
      downloadTokenService.consumir.mockReturnValue({
        sub: 1,
        email: 'admin@nt.com',
        role: 'admin',
        typ: 'download',
        jti: 'jti-1',
      });
      const context = buildContext('GET', undefined, undefined, { token: 'token-descarga-valido' });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(downloadTokenService.consumir).toHaveBeenCalledWith('token-descarga-valido');
      expect(jwtService.verify).not.toHaveBeenCalled();
      const request = context.switchToHttp().getRequest();
      expect(request.authSource).toBe('download-token');
    });

    it('rechaza el token de descarga si el rol que trae no está habilitado para el endpoint, aunque el token sea válido en su firma', async () => {
      setMetadata(false, ['admin'], true);
      downloadTokenService.consumir.mockReturnValue({
        sub: 9,
        email: 'cliente@nt.com',
        role: 'cliente',
        typ: 'download',
        jti: 'jti-cliente',
      });
      const context = buildContext('GET', undefined, undefined, { token: 'token-de-cliente' });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      expect(downloadTokenService.consumir).toHaveBeenCalledWith('token-de-cliente');
    });

    it('propaga el rechazo del servicio si el token de descarga expiró o ya fue usado', async () => {
      setMetadata(false, ['admin', 'operario'], true);
      downloadTokenService.consumir.mockImplementation(() => {
        throw new UnauthorizedException('Token de descarga inválido o expirado');
      });
      const context = buildContext('GET', undefined, undefined, { token: 'token-expirado' });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('ignora el token de descarga por query param si el endpoint no tiene @AllowDownloadToken()', async () => {
      setMetadata(false, ['admin', 'operario'], false);
      const context = buildContext('GET', undefined, undefined, { token: 'token-descarga-valido' });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(downloadTokenService.consumir).not.toHaveBeenCalled();
    });

    it('sigue exigiendo cookie/header cuando no se manda ningún token de descarga', async () => {
      setMetadata(false, ['admin', 'operario'], true);
      const context = buildContext('GET');

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(downloadTokenService.consumir).not.toHaveBeenCalled();
    });

    it('prioriza la cookie/header por sobre el token de descarga si ambos están presentes', async () => {
      setMetadata(false, ['admin', 'operario'], true);
      jwtService.verify.mockReturnValue({ sub: 1, email: 'admin@nt.com', role: 'admin' });
      const context = buildContext('GET', undefined, { access_token: 'token-cookie' }, { token: 'token-descarga' });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(downloadTokenService.consumir).not.toHaveBeenCalled();
    });
  });
});
