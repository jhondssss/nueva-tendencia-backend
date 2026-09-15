import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export interface DownloadTokenPayload {
  sub: number;
  email?: string;
  role: string;
  typ: 'download';
  jti: string;
}

export const DOWNLOAD_TOKEN_TTL_SECONDS = 120;

/**
 * Tokens de un solo uso para autorizar UNA descarga puntual (ej. window.open
 * de un PDF/Excel de reportes), donde no se puede adjuntar el header
 * Authorization ni depender de que la cookie de sesión llegue — Vercel y
 * Render son dominios distintos, y una navegación directa cross-site puede
 * ser bloqueada por el bloqueo de cookies de terceros del navegador aunque
 * la cookie tenga SameSite=None; Secure.
 *
 * Se firman con un secreto propio (DOWNLOAD_TOKEN_SECRET, no JWT_SECRET) para
 * que nunca sirvan como token de sesión general en el resto de la API aunque
 * se filtren o queden en el historial del navegador: expiran a los 2 minutos
 * y se invalidan al primer uso.
 *
 * El registro de jti usados es en memoria: alcanza para una sola instancia
 * del backend (que es el despliegue actual en Render). Si en el futuro se
 * escala a múltiples instancias, este estado tendría que moverse a un store
 * compartido (Redis) para que el "un solo uso" siga siendo real entre todas.
 */
@Injectable()
export class DownloadTokenService {
  private readonly secret: string;
  private readonly usedJti = new Map<string, number>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const secret = this.configService.get<string>('DOWNLOAD_TOKEN_SECRET');
    if (!secret) {
      throw new Error(
        'DOWNLOAD_TOKEN_SECRET no está definido. Configurá la variable de entorno antes de iniciar la app.',
      );
    }
    this.secret = secret;
  }

  generar(user: { sub: number; email?: string; role: string }): string {
    const jti = randomUUID();
    return this.jwtService.sign(
      { sub: user.sub, email: user.email, role: user.role, typ: 'download', jti },
      { secret: this.secret, expiresIn: `${DOWNLOAD_TOKEN_TTL_SECONDS}s` },
    );
  }

  /** Verifica firma + expiración + que no haya sido usado, y lo marca como consumido. */
  consumir(token: string): DownloadTokenPayload {
    let payload: DownloadTokenPayload;
    try {
      payload = this.jwtService.verify<DownloadTokenPayload>(token, { secret: this.secret });
    } catch {
      throw new UnauthorizedException('Token de descarga inválido o expirado');
    }

    if (payload.typ !== 'download' || !payload.jti) {
      throw new UnauthorizedException('Token de descarga inválido');
    }

    this.purgeExpirados();
    if (this.usedJti.has(payload.jti)) {
      throw new UnauthorizedException('Token de descarga ya utilizado');
    }

    const decoded = this.jwtService.decode(token) as { exp?: number } | null;
    const expiraEn = decoded?.exp
      ? decoded.exp * 1000
      : Date.now() + DOWNLOAD_TOKEN_TTL_SECONDS * 1000;
    this.usedJti.set(payload.jti, expiraEn);

    return payload;
  }

  private purgeExpirados(): void {
    const now = Date.now();
    for (const [jti, expiraEn] of this.usedJti) {
      if (expiraEn <= now) this.usedJti.delete(jti);
    }
  }
}
