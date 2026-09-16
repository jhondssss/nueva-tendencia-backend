import { FindOperator, Raw } from 'typeorm';

/** A partir del alias que TypeORM calcula en tiempo de consulta para la columna
 * `nombre` del cliente joineado (ej. "Pedido__Pedido_cliente"."nombre"), deriva
 * el alias de tabla para poder referenciar también la columna hermana
 * `apellido` dentro del mismo Raw(). No se hardcodea el alias: se deriva del
 * que entrega TypeORM en cada ejecución, así que sigue funcionando aunque
 * cambien nombres de clase, de propiedad o la estrategia de aliasing. */
function aliasTabla(aliasColumna: string): string {
  return `"${aliasColumna.slice(0, aliasColumna.lastIndexOf('.'))}"`;
}

/** Busca `texto` contra "nombre apellido" combinados en una sola columna
 * virtual, en vez de solo contra `nombre`. Sin esto, un nombre completo como
 * "Carlos Mamani Flores" nunca matchea porque en la BD nombre y apellido son
 * columnas separadas ("Carlos" / "Mamani Flores") y ninguna por sí sola
 * contiene la cadena completa. También sigue matcheando búsquedas parciales
 * (solo nombre o solo apellido), ya que ambas quedan incluidas en el
 * combinado. `apellido` es nullable, de ahí el COALESCE.
 *
 * Debe usarse como valor del campo `nombre` en un `where: { cliente: { nombre: ... } } }`
 * de TypeORM (`repo.find()`), nunca contra `apellido` directamente (duplicaría
 * la condición). */
export function matchClienteNombreCompleto(texto: string): FindOperator<string> {
  return Raw(
    alias =>
      `CONCAT(${aliasTabla(alias)}."nombre", ' ', COALESCE(${aliasTabla(alias)}."apellido", '')) ILIKE :clienteBusqueda`,
    { clienteBusqueda: `%${texto}%` },
  );
}

/** Nombre a mostrar de un cliente: para persona_natural concatena nombre +
 * apellido (antes se mostraba solo `nombre`, ej. "Carlos" en vez de "Carlos
 * Mamani Flores"); para empresa, `apellido` no se llena, así que el resultado
 * es simplemente el nombre comercial, sin necesidad de ramificar por
 * `tipo_cliente` (que además es un catálogo gestionable, no un enum fijo). */
export function nombreCompletoCliente(
  cliente?: { nombre: string; apellido?: string | null } | null,
  fallback = '—',
): string {
  if (!cliente) return fallback;
  return cliente.apellido ? `${cliente.nombre} ${cliente.apellido}`.trim() : cliente.nombre;
}
