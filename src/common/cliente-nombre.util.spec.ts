import { FindOperator } from 'typeorm';
import { matchClienteNombreCompleto } from './cliente-nombre.util';

function sqlFor(op: FindOperator<string>, aliasColumna: string): string {
  expect(op.getSql).toBeDefined();
  return op.getSql!(aliasColumna);
}

describe('matchClienteNombreCompleto', () => {
  it('busca contra nombre y apellido combinados (nombre completo con apellido)', () => {
    const op = matchClienteNombreCompleto('Carlos Mamani Flores');
    expect(op.type).toBe('raw');
    const sql = sqlFor(op, 'cliente.nombre');
    expect(sql).toContain('"cliente"."nombre"');
    expect(sql).toContain('"cliente"."apellido"');
    expect(sql).toContain('ILIKE');
    expect(op.objectLiteralParameters).toEqual({ clienteBusqueda: '%Carlos Mamani Flores%' });
  });

  it('sigue matcheando cuando solo se pasa el nombre de pila', () => {
    const op = matchClienteNombreCompleto('Carlos');
    const sql = sqlFor(op, 'cliente.nombre');
    expect(sql).toContain('"cliente"."nombre"');
    expect(sql).toContain('"cliente"."apellido"');
    expect(op.objectLiteralParameters).toEqual({ clienteBusqueda: '%Carlos%' });
  });

  it('sigue matcheando cuando solo se pasa el apellido', () => {
    const op = matchClienteNombreCompleto('Mamani Flores');
    const sql = sqlFor(op, 'cliente.nombre');
    expect(sql).toContain('"cliente"."nombre"');
    expect(sql).toContain('"cliente"."apellido"');
    expect(op.objectLiteralParameters).toEqual({ clienteBusqueda: '%Mamani Flores%' });
  });

  it('deriva el alias de tabla a partir del alias de columna que le pasa TypeORM en cada consulta', () => {
    const op = matchClienteNombreCompleto('Ana');
    // Alias distinto (ej. de un join anidado), no debe romper el parseo.
    const sql = sqlFor(op, 'Pedido__Pedido_cliente.nombre');
    expect(sql).toContain('"Pedido__Pedido_cliente"."nombre"');
    expect(sql).toContain('"Pedido__Pedido_cliente"."apellido"');
  });

  it('usa COALESCE para que un apellido null no anule el match por nombre', () => {
    const op = matchClienteNombreCompleto('Carlos');
    const sql = sqlFor(op, 'cliente.nombre');
    expect(sql).toContain('COALESCE');
  });
});
