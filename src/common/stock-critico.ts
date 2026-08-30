/** Predicado de "stock crítico" para productos e insumos, compartido entre
 * AssistantService, KpiService y DiarioService para evitar que cada uno
 * repita el umbral por su cuenta. */
export function esStockCritico(stock: number, nivelMinimo: number): boolean {
  return Number(stock) <= Number(nivelMinimo);
}

/** Misma condición, en SQL, para usar en un query builder de TypeORM:
 * `.where(condicionStockCritico('p'))`. */
export function condicionStockCritico(alias: string): string {
  return `${alias}.stock <= ${alias}.nivel_minimo`;
}
