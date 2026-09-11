import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ACCESS_TOKEN_COOKIE } from './auth.constants';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { validateUser: jest.Mock; login: jest.Mock; me: jest.Mock };
  let res: { cookie: jest.Mock; clearCookie: jest.Mock };

  beforeEach(() => {
    authService = {
      validateUser: jest.fn(),
      login: jest.fn(),
      me: jest.fn(),
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
