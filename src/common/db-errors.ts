import { QueryFailedError } from 'typeorm';

const FOREIGN_KEY_VIOLATION = '23503';

/**
 * Si `err` es una violación de FK de Postgres (delete bloqueado por un
 * registro relacionado), devuelve el nombre de la tabla que lo referencia.
 * TypeORM copia `code`/`table`/`constraint` del error nativo de `pg`
 * directo sobre la instancia de QueryFailedError.
 */
export function fkViolationTable(err: unknown): string | null {
  if (err instanceof QueryFailedError && (err as unknown as { code?: string }).code === FOREIGN_KEY_VIOLATION) {
    return (err as unknown as { table?: string }).table ?? null;
  }
  return null;
}
