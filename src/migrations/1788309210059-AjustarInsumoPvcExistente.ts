import { MigrationInterface, QueryRunner } from 'typeorm';

// La migración anterior (SeedInsumoPvc) encontró que ya existía un insumo 'PVC'
// en la BD real (kilo, stock 20, nivel_minimo 5, precio 650) — de otro uso, no
// relacionado con Solado — y no hizo nada por ser idempotente (IF NOT EXISTS por
// nombre). Se decidió reutilizar ese mismo insumo para la receta de Solado
// (Fase 3), estandarizándolo a litros según lo pedido: stock 15, nivel_minimo 4,
// precio 45. Valores originales documentados aquí para poder revertir en down().
const ORIGINAL = {
  unidad_medida: 'kilo',
  stock: 20.00,
  nivel_minimo: 5.00,
  precio_unitario: 650.00,
};

export class AjustarInsumoPvcExistente1788309210059 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        v_id INTEGER;
        v_stock_actual DECIMAL(10,2);
      BEGIN
        SELECT id_insumo, stock INTO v_id, v_stock_actual
          FROM insumos WHERE LOWER(TRIM(nombre)) = LOWER('PVC');

        IF v_id IS NOT NULL AND v_stock_actual IS DISTINCT FROM 15.00 THEN
          UPDATE insumos
            SET unidad_medida = 'litro',
                nivel_minimo = 4.00,
                precio_unitario = 45.00,
                stock = 15.00
            WHERE id_insumo = v_id;

          INSERT INTO kardex_movimientos
            (tipo, cantidad, motivo, stock_anterior, stock_nuevo, insumo_id, tipo_registro, origen)
          VALUES (
            'ajuste', 15.00,
            'Ajuste de stock y estandarización de unidad a litros para uso en Solado (Fase 3)',
            v_stock_actual, 15.00, v_id, 'insumo', 'manual'
          );
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM kardex_movimientos
      WHERE insumo_id IN (SELECT id_insumo FROM insumos WHERE nombre = 'PVC')
        AND motivo = 'Ajuste de stock y estandarización de unidad a litros para uso en Solado (Fase 3)'
    `);
    await queryRunner.query(`
      UPDATE insumos
        SET unidad_medida = '${ORIGINAL.unidad_medida}',
            stock = ${ORIGINAL.stock},
            nivel_minimo = ${ORIGINAL.nivel_minimo},
            precio_unitario = ${ORIGINAL.precio_unitario}
        WHERE nombre = 'PVC'
    `);
  }
}
