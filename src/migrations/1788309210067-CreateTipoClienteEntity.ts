import { MigrationInterface, QueryRunner } from 'typeorm';

// Convierte Cliente.tipo_cliente de texto validado solo por DTO (@IsIn) a
// una entidad gestionable desde el panel (tipos_cliente), mismo patrón que
// CreateCategoriaInsumoEntity/CreateUnidadMedidaEntity: migra los datos
// existentes 1 a 1 por nombre y aborta con RAISE EXCEPTION si algún cliente
// quedara sin tipo_cliente_id asignado — revierte toda la migración (corre
// en su propia transacción, modo migrationsTransactionMode: 'each' de
// data-source.ts) en vez de dejar datos corruptos. A diferencia de
// Producto.categoria, tipo_cliente siempre es obligatorio (sin significado
// especial en null), así que se fuerza NOT NULL al final, como en Insumo.
// No hay tipo ENUM de Postgres que eliminar: la columna original era un
// simple varchar validado únicamente a nivel de DTO.
export class CreateTipoClienteEntity1788309210067 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tipos_cliente" (
        "id_tipo_cliente" SERIAL PRIMARY KEY,
        "nombre" VARCHAR(30) NOT NULL UNIQUE,
        "activo" BOOLEAN NOT NULL DEFAULT true
      )
    `);

    await queryRunner.query(`
      INSERT INTO "tipos_cliente" ("nombre") VALUES
        ('persona_natural'), ('empresa')
    `);

    await queryRunner.query(`
      ALTER TABLE "cliente"
        ADD COLUMN "tipo_cliente_id" INTEGER NULL
          REFERENCES "tipos_cliente"("id_tipo_cliente")
    `);

    await queryRunner.query(`
      UPDATE "cliente" cl SET "tipo_cliente_id" = t."id_tipo_cliente"
        FROM "tipos_cliente" t
        WHERE t."nombre" = cl."tipo_cliente"
    `);

    // Ningún cliente puede quedar sin tipo_cliente_id: si el mapeo por
    // nombre dejó alguno sin match (valor de tipo_cliente inesperado),
    // abortamos toda la migración en vez de continuar con datos incompletos.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "cliente" WHERE "tipo_cliente_id" IS NULL) THEN
          RAISE EXCEPTION 'Hay clientes sin tipo_cliente_id tras la migración de datos — abortando';
        END IF;
      END $$;
    `);

    await queryRunner.query(`ALTER TABLE "cliente" ALTER COLUMN "tipo_cliente_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "cliente" DROP COLUMN "tipo_cliente"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cliente" ADD COLUMN "tipo_cliente" VARCHAR NULL`);

    await queryRunner.query(`
      UPDATE "cliente" cl SET "tipo_cliente" = t."nombre"
        FROM "tipos_cliente" t
        WHERE t."id_tipo_cliente" = cl."tipo_cliente_id"
    `);

    await queryRunner.query(`ALTER TABLE "cliente" ALTER COLUMN "tipo_cliente" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "cliente" DROP COLUMN "tipo_cliente_id"`);
    await queryRunner.query(`DROP TABLE "tipos_cliente"`);
  }
}
