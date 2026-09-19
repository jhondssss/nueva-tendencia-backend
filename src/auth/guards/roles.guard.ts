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
import { ALLOW_DOWNLOAD_TOKEN_KEY } from '../decorators/allow-download-token.decorator';
import { ACCESS_TOKEN_COOKIE } from '../auth.constants';
import { DownloadTokenService } from '../download-token.service';
import { UserService } from '../../user/user.service';

export type AuthSource = 'cookie' | 'header' | 'download-token';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly downloadTokenService: DownloadTokenService,
    private readonly usersService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Endpoints marcados con @Public() no requieren autenticación
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const { token, source } = this.extractToken(request);

    let payload: {
      sub: number;
      email?: string;
      role: string;
      clienteId?: number;
      token_version?: number;
    };

    if (token) {
      try {
        payload = this.jwtService.verify(token);
      } catch {
        throw new UnauthorizedException('Token inválido o expirado');
      }
      (request as any).authSource = source;
    } else {
      // Sin cookie ni header: en endpoints marcados con @AllowDownloadToken()
      // se acepta como última alternativa un token de descarga de un solo uso
      // por query param (ver DownloadTokenService) — pensado para navegación
      // directa (window.open) donde no se puede adjuntar Authorization ni
      // depender de que la cookie de sesión haya llegado.
      const allowsDownloadToken = this.reflector.getAllAndOverride<boolean>(
        ALLOW_DOWNLOAD_TOKEN_KEY,
        [context.getHandler(), context.getClass()],
      );
      const queryToken = allowsDownloadToken
        ? (request.query?.token as string | undefined)
        : undefined;

      if (!queryToken) {
        throw new UnauthorizedException('Token de autenticación no proporcionado');
      }

      payload = this.downloadTokenService.consumir(queryToken);
      (request as any).authSource = 'download-token';
    }

    // Invalidación de sesiones: el token_version del JWT debe coincidir con el
    // de la BD. Los tokens emitidos antes de esta columna no traen el claim y
    // se tratan como versión 0 (el default), así el deploy no desloguea a nadie.
    // Los @Public() ya retornaron arriba: no hacen esta consulta.
    const versionActual = await this.usersService.getTokenVersion(payload.sub);
    if (versionActual === null || (payload.token_version ?? 0) !== versionActual) {
      throw new UnauthorizedException('Sesión inválida, iniciá sesión de nuevo');
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

  private extractToken(request: Request): { token: string | null; source: AuthSource | null } {
    const cookieToken = (request as any).cookies?.[ACCESS_TOKEN_COOKIE];
    if (cookieToken) return { token: cookieToken, source: 'cookie' };

    const auth = request.headers.authorization;
    if (auth?.startsWith('Bearer ')) return { token: auth.split(' ')[1], source: 'header' };

    return { token: null, source: null };
  }
}
