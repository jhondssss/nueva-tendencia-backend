import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCamposFormulaProduccion1788309210055 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Cantidad fija por docena, consumida en cada etapa del Kanban.
    // No tocamos porcentaje_clefa/porcentaje_pasta: quedan sin uso en la BD
    // hasta confirmar que no hay que migrar datos reales ya cargados.
    await queryRunner.query(`
      ALTER TABLE "productos"
        ADD COLUMN IF NOT EXISTS "cuero_pies" DECIMAL(10,2) NULL,
        ADD COLUMN IF NOT EXISTS "clefa_aparado_litros" DECIMAL(10,2) NULL,
        ADD COLUMN IF NOT EXISTS "pasta_solado_litros" DECIMAL(10,2) NULL,
        ADD COLUMN IF NOT EXISTS "clefa_solado_litros" DECIMAL(10,2) NULL,
        ADD COLUMN IF NOT EXISTS "clefa_empaque_litros" DECIMAL(10,2) NULL,
        ADD COLUMN IF NOT EXISTS "esponja_empaque_hojas" DECIMAL(10,2) NULL
    `);

    // Nuevas unidades de medida para los insumos Cuero (pies) y Esponja (hojas).
    await queryRunner.query(`ALTER TYPE "insumos_unidad_medida_enum" ADD VALUE IF NOT EXISTS 'pie'`);
    await queryRunner.query(`ALTER TYPE "insumos_unidad_medida_enum" ADD VALUE IF NOT EXISTS 'hoja'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres no soporta DROP VALUE en un enum; 'pie'/'hoja' quedan definidos
    // pero sin uso si se revierte esta migración.
    await queryRunner.query(`
      ALTER TABLE "productos"
        DROP COLUMN IF EXISTS "esponja_empaque_hojas",
        DROP COLUMN IF EXISTS "clefa_empaque_litros",
        DROP COLUMN IF EXISTS "clefa_solado_litros",
        DROP COLUMN IF EXISTS "pasta_solado_litros",
        DROP COLUMN IF EXISTS "clefa_aparado_litros",
        DROP COLUMN IF EXISTS "cuero_pies"
    `);
  }
}
