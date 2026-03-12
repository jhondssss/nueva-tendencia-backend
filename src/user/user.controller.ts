import { Controller, Post, Body } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import * as jwt from 'jsonwebtoken';

@Controller('auth')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // Registro
  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    const user = await this.userService.create(createUserDto);
    const { password, ...result } = user;
    return result; // No devolver contraseña
  }

  // Login
  @Post('login')
  async login(@Body() loginUserDto: LoginUserDto) {
    const user = await this.userService.validateUser(loginUserDto.email, loginUserDto.password);
    if (!user) {
      return { message: 'Usuario o contraseña incorrectos' };
    }

    // Generar token JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      'SECRET_KEY', // Cambia por tu secreto en .env
      { expiresIn: '1h' }
    );

    return { token };
  }
}
