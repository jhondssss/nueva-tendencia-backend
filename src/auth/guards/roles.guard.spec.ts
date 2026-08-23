import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let jwtService: { verify: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };

  const buildContext = (method: string, authHeader?: string): ExecutionContext => {
    const request: any = { method, headers: authHeader ? { authorization: authHeader } : {} };
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  };

  const setMetadata = (isPublic: boolean | undefined, roles: string[] | undefined) => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return isPublic;
      if (key === ROLES_KEY) return roles;
      return undefined;
    });
  };

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(jwtService as unknown as JwtService, reflector as unknown as Reflector);
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
});
