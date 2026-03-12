export interface TallaConfig {
  talla: number;
  pares: number;
}

export const TALLAS_NINO: TallaConfig[] = [
  { talla: 27, pares: 2 },
  { talla: 28, pares: 2 },
  { talla: 29, pares: 2 },
  { talla: 30, pares: 2 },
  { talla: 31, pares: 2 },
  { talla: 32, pares: 2 },
]; // total: 12 pares

export const TALLAS_JUVENIL: TallaConfig[] = [
  { talla: 33, pares: 2 },
  { talla: 34, pares: 4 },
  { talla: 35, pares: 2 },
  { talla: 36, pares: 4 },
]; // total: 12 pares

export const TALLAS_ADULTO: TallaConfig[] = [
  { talla: 37, pares: 2 },
  { talla: 38, pares: 2 },
  { talla: 39, pares: 2 },
  { talla: 40, pares: 2 },
  { talla: 41, pares: 2 },
  { talla: 42, pares: 2 },
]; // total: 12 pares

export const DISTRIBUCION_TALLAS: Record<string, TallaConfig[]> = {
  nino: TALLAS_NINO,
  juvenil: TALLAS_JUVENIL,
  adulto: TALLAS_ADULTO,
};
