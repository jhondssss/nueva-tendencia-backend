import { MigrationInterface, QueryRunner } from 'typeorm';

// Elimina porcentaje_clefa/porcentaje_pasta (productos), sin uso desde que
// AddCamposFormulaProduccion introdujo el sistema de 4 etapas (litros fijos
// por docena, independientes por etapa). Verificado antes de dropear: de 11
// productos en Supabase, solo "Mocasín Elegante" tenía datos (70/30) y ya
// cuenta con la fórmula nueva completa — no hay nada que migrar.
export class DropPorcentajeClefaPasta1788309210068 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "productos"
        DROP COLUMN IF EXISTS "porcentaje_clefa",
        DROP COLUMN IF EXISTS "porcentaje_pasta"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "productos"
        ADD COLUMN IF NOT EXISTS "porcentaje_clefa" DECIMAL(5,2) NULL,
        ADD COLUMN IF NOT EXISTS "porcentaje_pasta" DECIMAL(5,2) NULL
    `);
  }
}
