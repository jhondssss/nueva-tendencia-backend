import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedInsumosCueroEsponja1788309210056 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Requiere que 'pie'/'hoja' ya existan en insumos_unidad_medida_enum y estén
    // comiteados (migración anterior, en su propia transacción).
    await queryRunner.query(`
      DO $$
      DECLARE
        v_id INTEGER;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM insumos WHERE LOWER(TRIM(nombre)) = LOWER('Cuero')) THEN
          INSERT INTO insumos (nombre, descripcion, categoria, unidad_medida, stock, nivel_minimo, precio_unitario, activo)
          VALUES ('Cuero', 'Cuero para suela (Cortado)', 'material', 'pie', 0, 30, 60.00, true)
          RETURNING id_insumo INTO v_id;

          INSERT INTO kardex_movimientos
            (tipo, cantidad, motivo, stock_anterior, stock_nuevo, insumo_id, tipo_registro, origen)
          VALUES ('entrada', 200, 'Stock inicial al crear insumo', 0, 200, v_id, 'insumo', 'manual');

          UPDATE insumos SET stock = 200 WHERE id_insumo = v_id;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        v_id INTEGER;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM insumos WHERE LOWER(TRIM(nombre)) = LOWER('Esponja')) THEN
          INSERT INTO insumos (nombre, descripcion, categoria, unidad_medida, stock, nivel_minimo, precio_unitario, activo)
          VALUES ('Esponja', 'Esponja (Empaquetado)', 'material', 'hoja', 0, 1, 22.00, true)
          RETURNING id_insumo INTO v_id;

          INSERT INTO kardex_movimientos
            (tipo, cantidad, motivo, stock_anterior, stock_nuevo, insumo_id, tipo_registro, origen)
          VALUES ('entrada', 5, 'Stock inicial al crear insumo', 0, 5, v_id, 'insumo', 'manual');

          UPDATE insumos SET stock = 5 WHERE id_insumo = v_id;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM kardex_movimientos
      WHERE insumo_id IN (SELECT id_insumo FROM insumos WHERE nombre IN ('Cuero', 'Esponja'))
    `);
    await queryRunner.query(`DELETE FROM insumos WHERE nombre IN ('Cuero', 'Esponja')`);
  }
}
