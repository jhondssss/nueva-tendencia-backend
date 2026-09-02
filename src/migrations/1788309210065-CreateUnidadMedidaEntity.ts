import { MigrationInterface, QueryRunner } from 'typeorm';

// Convierte Insumo.unidad_medida de enum fijo a una entidad gestionable
// desde el panel (unidades_medida), mismo patrón que CreateCategoriaInsumoEntity:
// migra los datos existentes 1 a 1 por nombre y aborta con RAISE EXCEPTION
// si algún insumo quedara sin unidad_medida_id asignado — revierte toda la
// migración (corre en su propia transacción, modo migrationsTransactionMode:
// 'each' de data-source.ts) en vez de dejar datos corruptos.
export class CreateUnidadMedidaEntity1788309210065 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "unidades_medida" (
        "id_unidad_medida" SERIAL PRIMARY KEY,
        "nombre" VARCHAR(30) NOT NULL UNIQUE,
        "activo" BOOLEAN NOT NULL DEFAULT true
      )
    `);

    await queryRunner.query(`
      INSERT INTO "unidades_medida" ("nombre") VALUES
        ('litro'), ('kilo'), ('metro'), ('unidad'), ('galon'), ('pie'), ('hoja')
    `);

    await queryRunner.query(`
      ALTER TABLE "insumos"
        ADD COLUMN "unidad_medida_id" INTEGER NULL
          REFERENCES "unidades_medida"("id_unidad_medida")
    `);

    await queryRunner.query(`
      UPDATE "insumos" i SET "unidad_medida_id" = u."id_unidad_medida"
        FROM "unidades_medida" u
        WHERE u."nombre" = i."unidad_medida"::text
    `);

    // Ningún insumo puede quedar sin unidad_medida_id: si el mapeo por nombre
    // dejó alguno sin match (valor de unidad_medida inesperado), abortamos
    // toda la migración en vez de continuar con datos incompletos.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "insumos" WHERE "unidad_medida_id" IS NULL) THEN
          RAISE EXCEPTION 'Hay insumos sin unidad_medida_id tras la migración de datos — abortando';
        END IF;
      END $$;
    `);

    await queryRunner.query(`ALTER TABLE "insumos" ALTER COLUMN "unidad_medida_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "insumos" DROP COLUMN "unidad_medida"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "insumos_unidad_medida_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "insumos_unidad_medida_enum" AS ENUM
        ('litro', 'kilo', 'metro', 'unidad', 'galon', 'pie', 'hoja')
    `);

    await queryRunner.query(`
      ALTER TABLE "insumos" ADD COLUMN "unidad_medida" "insumos_unidad_medida_enum" NULL
    `);

    await queryRunner.query(`
      UPDATE "insumos" i SET "unidad_medida" = u."nombre"::"insumos_unidad_medida_enum"
        FROM "unidades_medida" u
        WHERE u."id_unidad_medida" = i."unidad_medida_id"
    `);

    await queryRunner.query(`ALTER TABLE "insumos" ALTER COLUMN "unidad_medida" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "insumos" DROP COLUMN "unidad_medida_id"`);
    await queryRunner.query(`DROP TABLE "unidades_medida"`);
  }
}
