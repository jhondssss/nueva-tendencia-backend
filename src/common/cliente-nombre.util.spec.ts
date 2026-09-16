import { FindOperator } from 'typeorm';
import { matchClienteNombreCompleto, nombreCompletoCliente } from './cliente-nombre.util';

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

describe('nombreCompletoCliente', () => {
  it('concatena nombre + apellido para un cliente persona_natural (antes solo mostraba el nombre)', () => {
    expect(nombreCompletoCliente({ nombre: 'Carlos', apellido: 'Mamani Flores' })).toBe('Carlos Mamani Flores');
  });

  it('muestra solo el nombre comercial para un cliente empresa (sin apellido)', () => {
    expect(nombreCompletoCliente({ nombre: 'Distribuidora El Buen Paso', apellido: null })).toBe(
      'Distribuidora El Buen Paso',
    );
  });

  it('muestra solo el nombre cuando apellido es undefined', () => {
    expect(nombreCompletoCliente({ nombre: 'Ana' })).toBe('Ana');
  });

  it('devuelve el fallback ("—" por defecto) cuando no hay cliente', () => {
    expect(nombreCompletoCliente(undefined)).toBe('—');
    expect(nombreCompletoCliente(null)).toBe('—');
  });

  it('acepta un fallback personalizado (usado en exports de Excel, que usan "" en vez de "—")', () => {
    expect(nombreCompletoCliente(null, '')).toBe('');
  });
});
