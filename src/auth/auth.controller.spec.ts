import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ACCESS_TOKEN_COOKIE } from './auth.constants';
import { ROLES_KEY } from './decorators/roles.decorator';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    validateUser: jest.Mock;
    login: jest.Mock;
    me: jest.Mock;
    updatePerfil: jest.Mock;
    cambiarPassword: jest.Mock;
    cambiarPasswordInicial: jest.Mock;
  };
  let res: { cookie: jest.Mock; clearCookie: jest.Mock };

  beforeEach(() => {
    authService = {
      validateUser: jest.fn(),
      login: jest.fn(),
      me: jest.fn(),
      updatePerfil: jest.fn(),
      cambiarPassword: jest.fn(),
      cambiarPasswordInicial: jest.fn(),
    };
    controller = new AuthController(authService as unknown as AuthService);
    res = { cookie: jest.fn(), clearCookie: jest.fn() };
  });

  describe('login', () => {
    it('setea la cookie httpOnly access_token con el JWT devuelto y también lo incluye en el body', async () => {
      const user = { id: 1, email: 'admin@nt.com', role: 'admin' };
      const loginResult = { access_token: 'jwt-de-prueba', user };
      authService.validateUser.mockResolvedValue(user);
      authService.login.mockResolvedValue(loginResult);

      const req = { ip: '127.0.0.1' } as any;
      const result = await controller.login(
        { email: 'admin@nt.com', password: 'secreto' } as any,
        req,
        res as any,
      );

      expect(result).toBe(loginResult);
      expect(res.cookie).toHaveBeenCalledTimes(1);
      const [cookieName, cookieValue, options] = res.cookie.mock.calls[0];
      expect(cookieName).toBe(ACCESS_TOKEN_COOKIE);
      expect(cookieValue).toBe('jwt-de-prueba');
      expect(options).toMatchObject({ httpOnly: true, path: '/' });
    });
  });

  describe('me', () => {
    it('devuelve los datos del usuario logueado a partir del sub del JWT en request.user', async () => {
      const userData = { id: 7, email: 'operario@nt.com', nombre: 'Ana', apellido: 'Perez', role: 'operario', activo: true };
      authService.me.mockResolvedValue(userData);

      const req = { user: { sub: 7, email: 'operario@nt.com', role: 'operario' } } as any;
      const result = await controller.me(req);

      expect(authService.me).toHaveBeenCalledWith(7);
      expect(result).toBe(userData);
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('perfil', () => {
    it.each(['admin', 'operario', 'cliente'])(
      'usa siempre el sub del JWT (rol %s), no un id ajeno',
      async (role) => {
        authService.updatePerfil.mockResolvedValue({ perfil: { id: 5 }, access_token: undefined });
        // Aunque el body traiga un id, el DTO lo descarta y el controller solo lee req.user.sub.
        const req = { user: { sub: 5, role } } as any;

        await controller.updatePerfil({ nombre: 'X', id: 99 } as any, req, res as any);

        expect(authService.updatePerfil).toHaveBeenCalledWith(5, expect.anything());
        expect(authService.updatePerfil).not.toHaveBeenCalledWith(99, expect.anything());
        expect(res.cookie).not.toHaveBeenCalled();
      },
    );

    it('renueva la cookie cuando cambió el email', async () => {
      authService.updatePerfil.mockResolvedValue({ perfil: { id: 5 }, access_token: 'nuevo' });

      await controller.updatePerfil({ email: 'n@t.com' }, { user: { sub: 5 } } as any, res as any);

      expect(res.cookie).toHaveBeenCalledWith(
        ACCESS_TOKEN_COOKIE,
        'nuevo',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('cambiarPassword usa el sub del JWT y renueva la cookie con el token reemitido', async () => {
      authService.cambiarPassword.mockResolvedValue({ message: 'ok', access_token: 'jwt-reemitido' });
      const dto = { password_actual: 'a', password_nuevo: 'bbbbbb' };

      await controller.cambiarPassword(dto, { user: { sub: 5 } } as any, res as any);

      expect(authService.cambiarPassword).toHaveBeenCalledWith(5, dto);
      expect(res.cookie).toHaveBeenCalledWith(
        ACCESS_TOKEN_COOKIE,
        'jwt-reemitido',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('cambiarPasswordInicial renueva la cookie con el token reemitido', async () => {
      authService.cambiarPasswordInicial.mockResolvedValue({ message: 'ok', access_token: 'jwt-nuevo' });

      await controller.cambiarPasswordInicial({ password: 'nueva123' }, { user: { sub: 5 } } as any, res as any);

      expect(authService.cambiarPasswordInicial).toHaveBeenCalledWith(5, 'nueva123');
      expect(res.cookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, 'jwt-nuevo', expect.anything());
    });

    it.each(['perfil', 'updatePerfil', 'cambiarPassword'] as const)(
      '%s permite admin, operario, user y cliente',
      (m) => {
        const roles = Reflect.getMetadata(ROLES_KEY, AuthController.prototype[m]);
        expect(roles).toEqual(expect.arrayContaining(['admin', 'operario', 'user', 'cliente']));
      },
    );
  });

  describe('logout', () => {
    it('limpia la cookie access_token', async () => {
      const result = await controller.logout(res as any);

      expect(res.clearCookie).toHaveBeenCalledWith(
        ACCESS_TOKEN_COOKIE,
        expect.objectContaining({ httpOnly: true }),
      );
      expect(result).toEqual({ message: 'Sesión cerrada' });
    });
  });
});
