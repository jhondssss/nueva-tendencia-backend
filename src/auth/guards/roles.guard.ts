import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Endpoints marcados con @Public() no requieren autenticación
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token de autenticación no proporcionado');
    }

    let payload: { sub: number; email: string; role: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const role = payload.role;
    (request as any).user = payload;

    // Verificar roles requeridos por @Roles('admin') en el endpoint
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(role)) {
        throw new ForbiddenException(
          `Acceso denegado: se requiere rol ${requiredRoles.join(' o ')}`,
        );
      }
      return true;
    }

    // Sin @Roles: admin puede todo; operario solo GET y PATCH
    if (role === 'admin') return true;

    if (role === 'operario') {
      const method = request.method.toUpperCase();
      if (method === 'GET' || method === 'PATCH') return true;
      throw new ForbiddenException(
        'Los operarios solo pueden realizar consultas (GET) y actualizaciones (PATCH)',
      );
    }

    throw new ForbiddenException('Rol no reconocido');
  }

  private extractToken(request: Request): string | null {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.split(' ')[1];
  }
}
