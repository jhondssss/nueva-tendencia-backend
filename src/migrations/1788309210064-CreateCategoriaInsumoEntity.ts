import { MigrationInterface, QueryRunner } from 'typeorm';

// Convierte Insumo.categoria de enum fijo a una entidad gestionable desde
// el panel (categorias_insumo), para no necesitar una migración cada vez
// que se agregue una categoría nueva (ej. la "cuero" que se iba a agregar
// al enum). Migra los datos existentes 1 a 1 por nombre y aborta con
// RAISE EXCEPTION si algún insumo quedara sin categoria_id asignado —
// revierte toda la migración (corre en su propia transacción, modo
// migrationsTransactionMode: 'each' de data-source.ts) en vez de dejar
// datos corruptos.
export class CreateCategoriaInsumoEntity1788309210064 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "categorias_insumo" (
        "id_categoria_insumo" SERIAL PRIMARY KEY,
        "nombre" VARCHAR(50) NOT NULL UNIQUE,
        "activo" BOOLEAN NOT NULL DEFAULT true
      )
    `);

    await queryRunner.query(`
      INSERT INTO "categorias_insumo" ("nombre") VALUES
        ('material'), ('adhesivo'), ('herramienta'), ('quimico'), ('otro'), ('cuero')
    `);

    await queryRunner.query(`
      ALTER TABLE "insumos"
        ADD COLUMN "categoria_id" INTEGER NULL
          REFERENCES "categorias_insumo"("id_categoria_insumo")
    `);

    await queryRunner.query(`
      UPDATE "insumos" i SET "categoria_id" = c."id_categoria_insumo"
        FROM "categorias_insumo" c
        WHERE c."nombre" = i."categoria"::text
    `);

    // Ningún insumo puede quedar sin categoria_id: si el mapeo por nombre
    // dejó alguno sin match (valor de categoria inesperado), abortamos
    // toda la migración en vez de continuar con datos incompletos.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "insumos" WHERE "categoria_id" IS NULL) THEN
          RAISE EXCEPTION 'Hay insumos sin categoria_id tras la migración de datos — abortando';
        END IF;
      END $$;
    `);

    await queryRunner.query(`ALTER TABLE "insumos" ALTER COLUMN "categoria_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "insumos" DROP COLUMN "categoria"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "insumos_categoria_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "insumos_categoria_enum" AS ENUM
        ('adhesivo', 'material', 'herramienta', 'quimico', 'otro', 'cuero')
    `);

    await queryRunner.query(`
      ALTER TABLE "insumos" ADD COLUMN "categoria" "insumos_categoria_enum" NULL
    `);

    await queryRunner.query(`
      UPDATE "insumos" i SET "categoria" = c."nombre"::"insumos_categoria_enum"
        FROM "categorias_insumo" c
        WHERE c."id_categoria_insumo" = i."categoria_id"
    `);

    await queryRunner.query(`ALTER TABLE "insumos" ALTER COLUMN "categoria" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "insumos" DROP COLUMN "categoria_id"`);
    await queryRunner.query(`DROP TABLE "categorias_insumo"`);
  }
}
