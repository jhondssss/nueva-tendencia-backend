// src/auth/dto/register.dto.ts
export class RegisterDto {
  email: string;
  password: string;
  role?: string; // opcional para que funcione con CreateUserDto
}
