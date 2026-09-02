import { Between, Like, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { buildWherePedidos, buildWhereKardex } from './reportes-filtro.util';

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

describe('buildWhereKardex', () => {
  it('siempre fija tipo_registro:insumo, sin más filtros si no se pasa filtro', () => {
    expect(buildWhereKardex()).toEqual({ tipo_registro: 'insumo' });
  });

  it('siempre fija tipo_registro:insumo si el filtro no tiene campos', () => {
    expect(buildWhereKardex({})).toEqual({ tipo_registro: 'insumo' });
  });

  it('filtra por insumo_id exacto', () => {
    const where = buildWhereKardex({ insumo_id: 5 });
    expect(where).toEqual({ tipo_registro: 'insumo', insumo: { id_insumo: 5 } });
  });

  it('filtra por tipo exacto', () => {
    const where = buildWhereKardex({ tipo: 'salida' });
    expect(where).toEqual({ tipo_registro: 'insumo', tipo: 'salida' });
  });

  it('filtra por origen exacto', () => {
    const where = buildWhereKardex({ origen: 'automatico' });
    expect(where).toEqual({ tipo_registro: 'insumo', origen: 'automatico' });
  });

  it('filtra por categoria_insumo_id vía insumo.categoria', () => {
    const where = buildWhereKardex({ categoria_insumo_id: 3 });
    expect(where).toEqual({
      tipo_registro: 'insumo',
      insumo: { categoria: { id_categoria_insumo: 3 } },
    });
  });

  it('combina insumo_id y categoria_insumo_id en el mismo insumo', () => {
    const where = buildWhereKardex({ insumo_id: 5, categoria_insumo_id: 3 });
    expect(where).toEqual({
      tipo_registro: 'insumo',
      insumo: { id_insumo: 5, categoria: { id_categoria_insumo: 3 } },
    });
  });

  it('filtra por rango de fechas cuando hay desde y hasta', () => {
    const where = buildWhereKardex({ desde: '2026-01-01', hasta: '2026-01-31' });
    expect(where).toEqual({
      tipo_registro: 'insumo',
      fecha: Between(
        new Date('2026-01-01T00:00:00'),
        new Date('2026-01-31T23:59:59.999'),
      ),
    });
  });

  it('filtra desde una fecha en adelante si solo hay desde', () => {
    const where = buildWhereKardex({ desde: '2026-01-01' });
    expect(where).toEqual({
      tipo_registro: 'insumo',
      fecha: MoreThanOrEqual(new Date('2026-01-01T00:00:00')),
    });
  });

  it('filtra hasta una fecha si solo hay hasta', () => {
    const where = buildWhereKardex({ hasta: '2026-01-31' });
    expect(where).toEqual({
      tipo_registro: 'insumo',
      fecha: LessThanOrEqual(new Date('2026-01-31T23:59:59.999')),
    });
  });

  it('combina todos los filtros a la vez', () => {
    const where = buildWhereKardex({
      insumo_id: 5,
      tipo: 'entrada',
      origen: 'manual',
      categoria_insumo_id: 3,
      desde: '2026-01-01',
      hasta: '2026-01-31',
    });
    expect(where).toEqual({
      tipo_registro: 'insumo',
      insumo: { id_insumo: 5, categoria: { id_categoria_insumo: 3 } },
      tipo: 'entrada',
      origen: 'manual',
      fecha: Between(
        new Date('2026-01-01T00:00:00'),
        new Date('2026-01-31T23:59:59.999'),
      ),
    });
  });
});
