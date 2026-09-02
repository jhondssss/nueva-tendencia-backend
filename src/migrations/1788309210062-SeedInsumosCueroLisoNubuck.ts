import { MigrationInterface, QueryRunner } from 'typeorm';

// Cuero Liso y Cuero Nubuck son insumos distintos entre sí y del "Cuero"
// genérico (id 11, ya con historial real de Kardex — queda sin uso, no se
// toca). Sin rol_formula: cada producto se asocia a uno de estos dos vía
// productos.cuero_insumo_id (elegido en el frontend), no por convención.
export class SeedInsumosCueroLisoNubuck1788309210062 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        v_id INTEGER;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM insumos WHERE LOWER(TRIM(nombre)) = LOWER('Cuero Liso')) THEN
          INSERT INTO insumos (nombre, descripcion, categoria, unidad_medida, stock, nivel_minimo, precio_unitario, activo)
          VALUES ('Cuero Liso', 'Cuero liso para Cortado', 'material', 'pie', 0, 20, 39.00, true)
          RETURNING id_insumo INTO v_id;

          INSERT INTO kardex_movimientos
            (tipo, cantidad, motivo, stock_anterior, stock_nuevo, insumo_id, tipo_registro, origen)
          VALUES ('entrada', 27, 'Stock inicial al crear insumo', 0, 27, v_id, 'insumo', 'manual');

          UPDATE insumos SET stock = 27 WHERE id_insumo = v_id;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        v_id INTEGER;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM insumos WHERE LOWER(TRIM(nombre)) = LOWER('Cuero Nubuck')) THEN
          INSERT INTO insumos (nombre, descripcion, categoria, unidad_medida, stock, nivel_minimo, precio_unitario, activo)
          VALUES ('Cuero Nubuck', 'Cuero nubuck para Cortado', 'material', 'pie', 0, 20, 48.00, true)
          RETURNING id_insumo INTO v_id;

          INSERT INTO kardex_movimientos
            (tipo, cantidad, motivo, stock_anterior, stock_nuevo, insumo_id, tipo_registro, origen)
          VALUES ('entrada', 27, 'Stock inicial al crear insumo', 0, 27, v_id, 'insumo', 'manual');

          UPDATE insumos SET stock = 27 WHERE id_insumo = v_id;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM kardex_movimientos
      WHERE insumo_id IN (SELECT id_insumo FROM insumos WHERE nombre IN ('Cuero Liso', 'Cuero Nubuck'))
    `);
    await queryRunner.query(`DELETE FROM insumos WHERE nombre IN ('Cuero Liso', 'Cuero Nubuck')`);
  }
}
