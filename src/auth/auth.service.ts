// src/auth/auth.service.ts
import { Injectable } from '@nestjs/common';
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
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) return null;

    const { password: _, ...result } = user;
    return result;
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
