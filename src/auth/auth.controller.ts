import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CambiarPasswordInicialDto } from './dto/cambiar-password-inicial.dto';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const user = await this.authService.validateUser(loginDto.email, loginDto.password);
    return this.authService.login(user, req.ip);
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
