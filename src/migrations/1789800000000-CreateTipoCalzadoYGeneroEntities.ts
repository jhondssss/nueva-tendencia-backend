import { MigrationInterface, QueryRunner } from 'typeorm';

// Convierte Producto.tipo_calzado y Producto.genero de varchar libre a
// entidades gestionables (tipos_calzado, generos), mismo patrón que
// CreateCategoriaProductoEntity/CreateTipoClienteEntity.
//
// A diferencia de esas migraciones, los catálogos NO se siembran con una
// lista fija: se siembran con los valores DISTINTOS que ya existen en
// productos (deduplicando por LOWER(TRIM) para no crear "Casual" y "casual"
// como dos filas), de modo que ningún valor real se pierde. Si algún producto
// quedara sin FK asignada se aborta con RAISE EXCEPTION y se revierte todo
// (corre en su propia transacción, migrationsTransactionMode: 'each').
// Ambas columnas eran NOT NULL y sin significado especial en null, así que
// las FK quedan NOT NULL.
export class CreateTipoCalzadoYGeneroEntities1789800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.crearCatalogo(queryRunner, {
      tabla: 'tipos_calzado', pk: 'id_tipo_calzado', columnaVieja: 'tipo_calzado', fk: 'tipo_calzado_id',
    });
    await this.crearCatalogo(queryRunner, {
      tabla: 'generos', pk: 'id_genero', columnaVieja: 'genero', fk: 'genero_id',
    });
  }

  private async crearCatalogo(
    queryRunner: QueryRunner,
    c: { tabla: string; pk: string; columnaVieja: string; fk: string },
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "${c.tabla}" (
        "${c.pk}" SERIAL PRIMARY KEY,
        "nombre" VARCHAR(50) NOT NULL UNIQUE,
        "activo" BOOLEAN NOT NULL DEFAULT true
      )
    `);

    // Un valor por cada variante distinta (sin distinguir mayúsculas/espacios);
    // se conserva la grafía de la primera fila por id.
    await queryRunner.query(`
      INSERT INTO "${c.tabla}" ("nombre")
        SELECT DISTINCT ON (LOWER(TRIM("${c.columnaVieja}"))) TRIM("${c.columnaVieja}")
        FROM "productos"
        WHERE TRIM("${c.columnaVieja}") <> ''
        ORDER BY LOWER(TRIM("${c.columnaVieja}")), "id_producto"
    `);

    await queryRunner.query(`
      ALTER TABLE "productos"
        ADD COLUMN "${c.fk}" INTEGER NULL
          REFERENCES "${c.tabla}"("${c.pk}")
    `);

    await queryRunner.query(`
      UPDATE "productos" p SET "${c.fk}" = t."${c.pk}"
        FROM "${c.tabla}" t
        WHERE LOWER(TRIM(t."nombre")) = LOWER(TRIM(p."${c.columnaVieja}"))
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "productos" WHERE "${c.fk}" IS NULL) THEN
          RAISE EXCEPTION 'Hay productos sin ${c.fk} tras la migración de datos — abortando';
        END IF;
      END $$;
    `);

    await queryRunner.query(`ALTER TABLE "productos" ALTER COLUMN "${c.fk}" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN "${c.columnaVieja}"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const c of [
      { tabla: 'generos', pk: 'id_genero', columnaVieja: 'genero', fk: 'genero_id' },
      { tabla: 'tipos_calzado', pk: 'id_tipo_calzado', columnaVieja: 'tipo_calzado', fk: 'tipo_calzado_id' },
    ]) {
      await queryRunner.query(`ALTER TABLE "productos" ADD COLUMN "${c.columnaVieja}" VARCHAR NULL`);
      await queryRunner.query(`
        UPDATE "productos" p SET "${c.columnaVieja}" = t."nombre"
          FROM "${c.tabla}" t
          WHERE t."${c.pk}" = p."${c.fk}"
      `);
      await queryRunner.query(`ALTER TABLE "productos" ALTER COLUMN "${c.columnaVieja}" SET NOT NULL`);
      await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN "${c.fk}"`);
      await queryRunner.query(`DROP TABLE "${c.tabla}"`);
    }
  }
}
