export const ACCESS_TOKEN_COOKIE = 'access_token';

/**
 * Header que debe acompañar toda mutación (POST/PUT/PATCH/DELETE) autenticada
 * por cookie. Un atacante en un sitio externo puede forzar al navegador a
 * enviar la cookie automáticamente (CSRF), pero no puede agregar headers
 * custom a una petición cross-origin sin disparar preflight — y el preflight
 * lo bloquea la whitelist de CORS.
 */
export const CSRF_HEADER_NAME = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'XMLHttpRequest';
