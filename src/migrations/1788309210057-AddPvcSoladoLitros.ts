import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPvcSoladoLitros1788309210057 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tercer insumo de Solado (Fase 3), independiente de Pasta/Clefa.
    // No requiere ALTER TYPE: la unidad 'litro' ya existe en insumos_unidad_medida_enum.
    await queryRunner.query(`
      ALTER TABLE "productos"
        ADD COLUMN IF NOT EXISTS "pvc_solado_litros" DECIMAL(10,2) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "productos"
        DROP COLUMN IF EXISTS "pvc_solado_litros"
    `);
  }
}
