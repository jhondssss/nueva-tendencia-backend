import { Controller, Post, Body, UnauthorizedException, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ── Máximo 5 intentos de login por IP cada 60 segundos ──
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const user = await this.authService.validateUser(loginDto.email, loginDto.password);
    if (!user) throw new UnauthorizedException('Credenciales inválidas');
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
}