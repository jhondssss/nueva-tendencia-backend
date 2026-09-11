import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '../auth.constants';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Mitigación CSRF para el modelo de "header simple" (no double-submit token):
 * el CORS ya restringe qué orígenes pueden hacer peticiones cross-origin con
 * credentials, así que basta con exigir un header custom en las mutaciones
 * autenticadas por cookie — un <form> o fetch "simple" de un sitio externo no
 * puede agregarlo, y si lo agrega vía fetch/XHR, el preflight de CORS lo frena.
 *
 * Las peticiones autenticadas por header Authorization (Swagger/Postman/tests)
 * no dependen de que el navegador adjunte credenciales automáticamente, así
 * que no están expuestas a CSRF y no pasan por este chequeo.
 *
 * Debe registrarse después de RolesGuard (que es quien fija request.authSource).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!MUTATING_METHODS.has(request.method.toUpperCase())) return true;
    if ((request as any).authSource !== 'cookie') return true;

    const header = request.headers[CSRF_HEADER_NAME];
    if (header !== CSRF_HEADER_VALUE) {
      throw new ForbiddenException(
        `Falta el header ${CSRF_HEADER_NAME}: ${CSRF_HEADER_VALUE} requerido para mutaciones autenticadas por cookie`,
      );
    }

    return true;
  }
}
