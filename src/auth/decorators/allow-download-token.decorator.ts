import { SetMetadata } from '@nestjs/common';

/**
 * Habilita, solo para el endpoint marcado, la autenticación alternativa vía
 * `?token=` de un token de descarga de un solo uso (ver DownloadTokenService).
 * Pensado para endpoints de descarga de archivo (window.open) donde no se
 * puede adjuntar el header Authorization ni depender de la cookie de sesión.
 */
export const ALLOW_DOWNLOAD_TOKEN_KEY = 'allowDownloadToken';
export const AllowDownloadToken = () => SetMetadata(ALLOW_DOWNLOAD_TOKEN_KEY, true);
