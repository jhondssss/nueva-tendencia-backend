import { MigrationInterface, QueryRunner } from 'typeorm';

// Convierte Producto.categoria de enum fijo a una entidad gestionable desde
// el panel (categorias_producto), mismo patrón que CreateCategoriaInsumoEntity,
// con una diferencia clave: la columna se queda NULLABLE. En Producto,
// categoria = null tiene significado propio (el producto no aparece en el
// catálogo público — ver ProductoService.findCatalogo), así que no se puede
// forzar NOT NULL como se hizo con Insumo.categoria/unidad_medida. Solo se
// aborta con RAISE EXCEPTION si una fila con categoria NO nula queda sin
// categoria_producto_id tras el mapeo por nombre (dato perdido), nunca por
// filas que ya eran null de por sí.
export class CreateCategoriaProductoEntity1788309210066 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "categorias_producto" (
        "id_categoria_producto" SERIAL PRIMARY KEY,
        "nombre" VARCHAR(30) NOT NULL UNIQUE,
        "activo" BOOLEAN NOT NULL DEFAULT true
      )
    `);

    await queryRunner.query(`
      INSERT INTO "categorias_producto" ("nombre") VALUES
        ('nino'), ('juvenil'), ('adulto')
    `);

    await queryRunner.query(`
      ALTER TABLE "productos"
        ADD COLUMN "categoria_producto_id" INTEGER NULL
          REFERENCES "categorias_producto"("id_categoria_producto")
    `);

    await queryRunner.query(`
      UPDATE "productos" p SET "categoria_producto_id" = c."id_categoria_producto"
        FROM "categorias_producto" c
        WHERE c."nombre" = p."categoria"::text
    `);

    // Solo abortamos si una fila con categoria NO nula quedó sin mapear
    // (valor inesperado). Las filas con categoria ya nula quedan nula a
    // propósito — no forman parte de esta verificación.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "productos"
          WHERE "categoria" IS NOT NULL AND "categoria_producto_id" IS NULL
        ) THEN
          RAISE EXCEPTION 'Hay productos con categoria sin categoria_producto_id tras la migración de datos — abortando';
        END IF;
      END $$;
    `);

    await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN "categoria"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "productos_categoria_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "productos_categoria_enum" AS ENUM ('nino', 'juvenil', 'adulto')
    `);

    await queryRunner.query(`
      ALTER TABLE "productos" ADD COLUMN "categoria" "productos_categoria_enum" NULL
    `);

    await queryRunner.query(`
      UPDATE "productos" p SET "categoria" = c."nombre"::"productos_categoria_enum"
        FROM "categorias_producto" c
        WHERE c."id_categoria_producto" = p."categoria_producto_id"
    `);

    await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN "categoria_producto_id"`);
    await queryRunner.query(`DROP TABLE "categorias_producto"`);
  }
}
