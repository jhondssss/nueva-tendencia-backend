import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { Role } from './enums/role.enum';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UserService,
    private jwtService: JwtService,
    private readonly auditoriaService: AuditoriaService,
    private readonly mailService: MailService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    if (!email || !password) {
      throw new UnauthorizedException('El email y la contraseña son requeridos');
    }

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('El usuario no existe');
    }

    if (!user.activo) {
      throw new UnauthorizedException('Cuenta deshabilitada. Contacte al administrador');
    }

    if (!user.password) {
      throw new UnauthorizedException('Error interno: el usuario no tiene contraseña registrada');
    }

    try {
      const passwordValid = await bcrypt.compare(password, user.password);
      if (!passwordValid) {
        throw new UnauthorizedException('Contraseña incorrecta');
      }
      const { password: _, ...result } = user;
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Error en la validación de credenciales');
    }
  }

  async login(user: any, ip?: string) {
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      clienteId: user.clienteId ?? undefined,
      requiereCambioPassword: !!user.requiereCambioPassword,
    };

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
    const user = await this.usersService.create(registerDto, Role.USER);
    const { password, ...result } = user;
    return result;
  }

  async registerOperario(registerDto: RegisterDto) {
    const user = await this.usersService.create(registerDto, Role.OPERARIO);
    const { password, ...result } = user;
    return result;
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const genericResponse = { message: 'Si el email existe, recibirás las instrucciones de recuperación' };

    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.activo) return genericResponse;

    const token = randomUUID();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await this.usersService.saveResetToken(user.id, token, expires);

    const resetUrl = `https://nueva-tendencia-frontend.vercel.app/reset-password?token=${token}`;
    const nombre = user.nombre ?? user.email;

    await this.mailService.sendPasswordResetEmail(user.email, nombre, resetUrl);

    return genericResponse;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findByResetToken(dto.token);

    if (!user || !user.reset_token_expires) {
      throw new BadRequestException('Token inválido o expirado');
    }

    if (new Date() > user.reset_token_expires) {
      await this.usersService.clearResetToken(user.id);
      throw new BadRequestException('El token ha expirado. Solicita un nuevo enlace de recuperación');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    await this.usersService.updatePassword(user.id, hashedPassword);
    await this.usersService.clearResetToken(user.id);

    return { message: 'Contraseña actualizada correctamente' };
  }

  async cambiarPasswordInicial(userId: number, newPassword: string): Promise<{ message: string }> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.usersService.setPasswordAndClearFlag(userId, hashedPassword);
    return { message: 'Contraseña actualizada correctamente' };
  }
}
