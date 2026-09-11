import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';

describe('CsrfGuard', () => {
  let guard: CsrfGuard;

  const buildContext = (
    method: string,
    authSource?: 'cookie' | 'header',
    headers: Record<string, string> = {},
  ): ExecutionContext => {
    const request: any = { method, headers, authSource };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    guard = new CsrfGuard();
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'permite %s autenticado por cookie sin el header custom',
    (method) => {
      const context = buildContext(method, 'cookie');
      expect(guard.canActivate(context)).toBe(true);
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'rechaza %s autenticado por cookie sin el header x-requested-with',
    (method) => {
      const context = buildContext(method, 'cookie');
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'permite %s autenticado por cookie con el header x-requested-with correcto',
    (method) => {
      const context = buildContext(method, 'cookie', { 'x-requested-with': 'XMLHttpRequest' });
      expect(guard.canActivate(context)).toBe(true);
    },
  );

  it('rechaza una mutación por cookie si el header trae un valor incorrecto', () => {
    const context = buildContext('POST', 'cookie', { 'x-requested-with': 'algo-random' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'permite %s autenticado por header Authorization sin exigir el header custom',
    (method) => {
      const context = buildContext(method, 'header');
      expect(guard.canActivate(context)).toBe(true);
    },
  );
});
