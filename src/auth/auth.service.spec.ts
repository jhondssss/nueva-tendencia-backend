import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;

  const mockUserService = { findByEmail: jest.fn(), create: jest.fn() };
  const mockJwtService = { sign: jest.fn() };
  const mockAuditoriaService = { registrar: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: mockUserService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
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
      });
      expect(result).toEqual({
        access_token: 'mock-jwt-token',
        user: { id: 1, email: 'admin@test.com', role: 'admin' },
      });
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
