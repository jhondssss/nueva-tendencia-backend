import { MigrationInterface, QueryRunner } from 'typeorm';

// Extiende rol_formula (hasta ahora limitado a 'clefa'/'pasta') para que también
// identifique a Cuero, Esponja y PVC — reemplaza la búsqueda por nombre exacto
// que usaba pedido-estado.service.ts para esos 3 insumos. Migración aditiva:
// solo amplía el CHECK existente y hace UPDATE de un campo ya existente
// (rol_formula), por nombre — mismo patrón idempotente que las migraciones
// seed de Cuero/Esponja/PVC — sin tocar columnas, tablas ni otros datos.
export class AddRolesFormulaCueroEsponjaPvc1788309210060 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "insumos" DROP CONSTRAINT IF EXISTS "chk_insumos_rol_formula"
    `);
    await queryRunner.query(`
      ALTER TABLE "insumos"
        ADD CONSTRAINT "chk_insumos_rol_formula"
        CHECK ("rol_formula" IN ('clefa', 'pasta', 'cuero', 'esponja', 'pvc'))
    `);

    await queryRunner.query(`
      UPDATE insumos SET rol_formula = 'cuero'
        WHERE LOWER(TRIM(nombre)) = LOWER('Cuero') AND rol_formula IS NULL
    `);
    await queryRunner.query(`
      UPDATE insumos SET rol_formula = 'esponja'
        WHERE LOWER(TRIM(nombre)) = LOWER('Esponja') AND rol_formula IS NULL
    `);
    await queryRunner.query(`
      UPDATE insumos SET rol_formula = 'pvc'
        WHERE LOWER(TRIM(nombre)) = LOWER('PVC') AND rol_formula IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE insumos SET rol_formula = NULL
        WHERE rol_formula IN ('cuero', 'esponja', 'pvc')
    `);

    await queryRunner.query(`
      ALTER TABLE "insumos" DROP CONSTRAINT IF EXISTS "chk_insumos_rol_formula"
    `);
    await queryRunner.query(`
      ALTER TABLE "insumos"
        ADD CONSTRAINT "chk_insumos_rol_formula"
        CHECK ("rol_formula" IN ('clefa', 'pasta'))
    `);
  }
}
