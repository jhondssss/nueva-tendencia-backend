import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { MailService } from '../mail/mail.service';

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ id: 'mock-id' }) },
  })),
}));
jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;

  const mockUserService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    findSessionProfile: jest.fn(),
    updateOwnProfile: jest.fn(),
    findByIdWithPassword: jest.fn(),
    setPasswordAndClearFlag: jest.fn(),
    updatePassword: jest.fn(),
    getTokenVersion: jest.fn(),
    findByResetToken: jest.fn(),
    clearResetToken: jest.fn(),
  };
  const mockJwtService = { sign: jest.fn() };
  const mockAuditoriaService = { registrar: jest.fn().mockResolvedValue(undefined) };
  const mockMailService = { sendMail: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: mockUserService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('login', () => {
    it('retorna JWT cuando las credenciales son correctas', async () => {
      const user = { id: 1, email: 'admin@test.com', role: 'admin' };
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.login(user, '127.0.0.1');

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        email: user.email,
        sub: user.id,
        role: user.role,
        clienteId: undefined,
        requiereCambioPassword: false,
        token_version: 0,
      });
      expect(result).toEqual({
        access_token: 'mock-jwt-token',
        user: { id: 1, email: 'admin@test.com', role: 'admin' },
      });
    });
  });

  describe('me', () => {
    it('delega en usersService.findSessionProfile y no expone el password', async () => {
      const userData = {
        id: 3, email: 'cliente@test.com', nombre: 'Luis', apellido: 'Gomez',
        role: 'cliente', activo: true, clienteId: 10, requiereCambioPassword: false,
      };
      mockUserService.findSessionProfile.mockResolvedValue(userData);

      const result = await service.me(3);

      expect(mockUserService.findSessionProfile).toHaveBeenCalledWith(3);
      expect(result).toEqual(userData);
      expect(result).not.toHaveProperty('password');
    });

    it('lanza UnauthorizedException si el usuario de la sesión ya no existe', async () => {
      mockUserService.findSessionProfile.mockResolvedValue(null);

      await expect(service.me(999)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('updatePerfil', () => {
    it.each(['admin', 'operario', 'cliente'])(
      'edita el perfil propio con rol %s usando el id de la sesión',
      async (role) => {
        const antes = {
          id: 4,
          email: 'a@test.com',
          nombre: 'A',
          apellido: 'B',
          role,
          clienteId: role === 'cliente' ? 3 : null,
        };
        mockUserService.findSessionProfile
          .mockResolvedValueOnce(antes)
          .mockResolvedValueOnce({ ...antes, nombre: 'Nuevo' });

        const { perfil, access_token } = await service.updatePerfil(4, { nombre: 'Nuevo' });

        expect(mockUserService.updateOwnProfile).toHaveBeenCalledWith(4, { nombre: 'Nuevo' });
        expect(perfil.nombre).toBe('Nuevo');
        expect(access_token).toBeUndefined();
      },
    );

    it('re-firma el JWT cuando cambia el email', async () => {
      const antes = { id: 4, email: 'a@test.com', role: 'operario', clienteId: null };
      mockUserService.findSessionProfile
        .mockResolvedValueOnce(antes)
        .mockResolvedValueOnce({ ...antes, email: 'b@test.com' });
      mockJwtService.sign.mockReturnValue('nuevo-jwt');
      mockUserService.getTokenVersion.mockResolvedValue(5);

      const { access_token } = await service.updatePerfil(4, { email: 'b@test.com' });

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 4, email: 'b@test.com', token_version: 5 }),
      );
      expect(access_token).toBe('nuevo-jwt');
    });

    it('propaga el rechazo por email duplicado', async () => {
      mockUserService.findSessionProfile.mockResolvedValue({ id: 4, email: 'a@test.com', role: 'admin' });
      mockUserService.updateOwnProfile.mockRejectedValue(new BadRequestException('Ya existe'));

      await expect(service.updatePerfil(4, { email: 'dup@test.com' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cambiarPassword', () => {
    const userConHash = { id: 4, email: 'a@test.com', password: 'hash' };

    it('exige que password_actual coincida con el hash', async () => {
      mockUserService.findByIdWithPassword.mockResolvedValue(userConHash);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.cambiarPassword(4, { password_actual: 'mala', password_nuevo: 'nueva123' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserService.setPasswordAndClearFlag).not.toHaveBeenCalled();
    });

    it('cambia la contraseña cuando la actual es correcta', async () => {
      mockUserService.findByIdWithPassword.mockResolvedValue(userConHash);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hash-nuevo');
      mockUserService.setPasswordAndClearFlag.mockResolvedValue(8);
      mockJwtService.sign.mockReturnValue('jwt-reemitido');

      const result = await service.cambiarPassword(4, {
        password_actual: 'vieja123',
        password_nuevo: 'nueva123',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('nueva123', 10);
      expect(mockUserService.setPasswordAndClearFlag).toHaveBeenCalledWith(4, 'hash-nuevo');
      // Reemite la sesión propia con la versión ya incrementada (8), no la vieja.
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 4, token_version: 8, requiereCambioPassword: false }),
      );
      expect(result).toEqual({
        message: 'Contraseña actualizada correctamente',
        access_token: 'jwt-reemitido',
      });
    });

    it('no incrementa token_version ni reemite token si la actual es incorrecta', async () => {
      mockUserService.findByIdWithPassword.mockResolvedValue(userConHash);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.cambiarPassword(4, { password_actual: 'x', password_nuevo: 'nueva123' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserService.setPasswordAndClearFlag).not.toHaveBeenCalled();
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });

    it('rechaza una nueva igual a la actual', async () => {
      mockUserService.findByIdWithPassword.mockResolvedValue(userConHash);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.cambiarPassword(4, { password_actual: 'misma123', password_nuevo: 'misma123' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cambiarPasswordInicial', () => {
    it('incrementa token_version y reemite el token con la versión nueva y el flag apagado', async () => {
      mockUserService.findByIdWithPassword.mockResolvedValue({
        id: 6,
        email: 'c@test.com',
        role: 'cliente',
        clienteId: 2,
        requiereCambioPassword: true,
        tokenVersion: 0,
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('h');
      mockUserService.setPasswordAndClearFlag.mockResolvedValue(1);
      mockJwtService.sign.mockReturnValue('jwt-nuevo');

      const result = await service.cambiarPasswordInicial(6, 'nueva123');

      expect(mockUserService.setPasswordAndClearFlag).toHaveBeenCalledWith(6, 'h');
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 6, clienteId: 2, token_version: 1, requiereCambioPassword: false }),
      );
      expect(result.access_token).toBe('jwt-nuevo');
    });
  });

  describe('resetPassword', () => {
    it('cambia la contraseña vía updatePassword (que incrementa token_version) y limpia el token de reset', async () => {
      mockUserService.findByResetToken.mockResolvedValue({
        id: 3,
        reset_token_expires: new Date(Date.now() + 60000),
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('h');

      await service.resetPassword({ token: 't', password: 'nueva123' });

      expect(mockUserService.updatePassword).toHaveBeenCalledWith(3, 'h');
      expect(mockUserService.clearResetToken).toHaveBeenCalledWith(3);
    });
  });

  describe('validateUser', () => {
    it('lanza UnauthorizedException si el usuario no existe', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);

      await expect(service.validateUser('noexiste@test.com', 'pass123')).rejects.toThrow(
        new UnauthorizedException('El usuario no existe'),
      );
    });

    it('lanza UnauthorizedException si la contraseña es incorrecta', async () => {
      const user = { id: 1, email: 'admin@test.com', password: '$2b$10$hashedpass', role: 'admin' };
      mockUserService.findByEmail.mockResolvedValue(user);
      // bcrypt.compare devuelve false → la contraseña no coincide
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.validateUser('admin@test.com', 'wrong-pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
