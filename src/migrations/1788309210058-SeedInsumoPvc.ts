import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedInsumoPvc1788309210058 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        v_id INTEGER;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM insumos WHERE LOWER(TRIM(nombre)) = LOWER('PVC')) THEN
          INSERT INTO insumos (nombre, descripcion, categoria, unidad_medida, stock, nivel_minimo, precio_unitario, activo)
          VALUES ('PVC', 'PVC para suela (Solado)', 'quimico', 'litro', 0, 4, 45.00, true)
          RETURNING id_insumo INTO v_id;

          INSERT INTO kardex_movimientos
            (tipo, cantidad, motivo, stock_anterior, stock_nuevo, insumo_id, tipo_registro, origen)
          VALUES ('entrada', 15, 'Stock inicial al crear insumo', 0, 15, v_id, 'insumo', 'manual');

          UPDATE insumos SET stock = 15 WHERE id_insumo = v_id;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM kardex_movimientos
      WHERE insumo_id IN (SELECT id_insumo FROM insumos WHERE nombre = 'PVC')
    `);
    await queryRunner.query(`DELETE FROM insumos WHERE nombre = 'PVC'`);
  }
}
