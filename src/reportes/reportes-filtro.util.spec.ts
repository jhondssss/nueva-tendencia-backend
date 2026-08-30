import { Between, Like, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { buildWherePedidos } from './reportes-filtro.util';

describe('buildWherePedidos', () => {
  it('devuelve un where vacío si no se pasa filtro', () => {
    expect(buildWherePedidos()).toEqual({});
  });

  it('devuelve un where vacío si el filtro no tiene campos', () => {
    expect(buildWherePedidos({})).toEqual({});
  });

  it('filtra por cliente con Like', () => {
    const where = buildWherePedidos({ cliente: 'Juan' });
    expect(where).toEqual({ cliente: { nombre: Like('%Juan%') } });
  });

  it('filtra por producto con Like', () => {
    const where = buildWherePedidos({ producto: 'Bota' });
    expect(where).toEqual({ producto: { nombre_modelo: Like('%Bota%') } });
  });

  it('filtra por categoria exacta', () => {
    const where = buildWherePedidos({ categoria: 'adulto' });
    expect(where).toEqual({ categoria: 'adulto' });
  });

  it('filtra por rango de fechas cuando hay desde y hasta', () => {
    const where = buildWherePedidos({ desde: '2026-01-01', hasta: '2026-01-31' });
    expect(where).toEqual({
      fecha_creacion: Between(
        new Date('2026-01-01T00:00:00'),
        new Date('2026-01-31T23:59:59.999'),
      ),
    });
  });

  it('filtra desde una fecha en adelante si solo hay desde', () => {
    const where = buildWherePedidos({ desde: '2026-01-01' });
    expect(where).toEqual({
      fecha_creacion: MoreThanOrEqual(new Date('2026-01-01T00:00:00')),
    });
  });

  it('filtra hasta una fecha si solo hay hasta', () => {
    const where = buildWherePedidos({ hasta: '2026-01-31' });
    expect(where).toEqual({
      fecha_creacion: LessThanOrEqual(new Date('2026-01-31T23:59:59.999')),
    });
  });

  it('combina todos los filtros a la vez', () => {
    const where = buildWherePedidos({
      cliente: 'Juan',
      producto: 'Bota',
      categoria: 'nino',
      desde: '2026-01-01',
      hasta: '2026-01-31',
    });
    expect(where).toEqual({
      cliente: { nombre: Like('%Juan%') },
      producto: { nombre_modelo: Like('%Bota%') },
      categoria: 'nino',
      fecha_creacion: Between(
        new Date('2026-01-01T00:00:00'),
        new Date('2026-01-31T23:59:59.999'),
      ),
    });
  });
});
