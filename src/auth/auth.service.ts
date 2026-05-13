// src/auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UserService,
    private jwtService: JwtService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    // 1. Verificar que los argumentos no sean nulos o vacíos
    if (!email || !password) {
      throw new UnauthorizedException('El email y la contraseña son requeridos');
    }

    // 2. Buscar al usuario
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('El usuario no existe');
    }

    // 3. Verificar que el usuario tenga un hash de contraseña
    if (!user.password) {
      throw new UnauthorizedException('Error interno: el usuario no tiene contraseña registrada');
    }

    // 4. Comparar contraseñas de forma segura
    try {
      const passwordValid = await bcrypt.compare(password, user.password);
      if (!passwordValid) {
        throw new UnauthorizedException('Contraseña incorrecta');
      }

      // Eliminar la contraseña del objeto retornado
      const { password: _, ...result } = user;
      return result;
    } catch (error) {
      throw new UnauthorizedException('Error en la validación de credenciales');
    }
  }

  async login(user: any, ip?: string) {
    const payload = { email: user.email, sub: user.id, role: user.role };

    void this.auditoriaService.registrar({
      accion: 'LOGIN',
      modulo: 'auth',
      descripcion: `Usuario ${user.email} inició sesión`,
      usuarioId: user.id,
      ip,
    });

    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async register(registerDto: RegisterDto) {
    const user = await this.usersService.create(registerDto);
    const { password, ...result } = user;
    return result;
  }

  async registerOperario(registerDto: RegisterDto) {
    const user = await this.usersService.create({ ...registerDto, role: 'operario' });
    const { password, ...result } = user;
    return result;
  }
}
