import { Controller, Post, Body, UseGuards, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CambiarPasswordInicialDto } from './dto/cambiar-password-inicial.dto';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';

const ACCESS_TOKEN_COOKIE = 'access_token';

/**
 * SameSite=None + Secure es obligatorio para que la cookie viaje cross-domain
 * (Render ↔ Vercel) en producción; en desarrollo local (http) usamos Lax
 * porque Secure bloquearía el envío de la cookie por HTTP.
 */
function authCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: 60 * 60 * 1000, // 1h — igual al expiresIn del JWT
    path: '/',
  };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public()
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(loginDto.email, loginDto.password);
    const result = await this.authService.login(user, req.ip);
    // Cookie HttpOnly de transición: el guard todavía no la usa para autenticar
    // (sigue leyendo solo el header Authorization). El body sigue devolviendo
    // access_token para no romper al frontend actual.
    res.cookie(ACCESS_TOKEN_COOKIE, result.access_token, authCookieOptions());
    return result;
  }

  @Public()
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, authCookieOptions());
    return { message: 'Sesión cerrada' };
  }

  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('register-operario')
  async registerOperario(@Body() registerDto: RegisterDto) {
    return this.authService.registerOperario(registerDto);
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Roles('admin', 'operario', 'user', 'cliente')
  @Post('cambiar-password-inicial')
  async cambiarPasswordInicial(
    @Body() dto: CambiarPasswordInicialDto,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.sub as number;
    return this.authService.cambiarPasswordInicial(userId, dto.password);
  }
}
